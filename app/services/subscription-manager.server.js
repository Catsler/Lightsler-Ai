import { prisma } from '../db.server.js';
import { billingLogger as logger } from '../utils/logger.server.js';
import { collectError, ERROR_TYPES } from './error-collector.server.js';

const REQUIRED_PRISMA_MODELS = ['subscriptionPlan', 'shopSubscription', 'shop', 'language'];

// Explicit plan selection to avoid querying non-existent legacy columns
const PLAN_SELECT = {
  id: true,
  name: true,
  displayName: true,
  price: true,
  monthlyCredits: true,
  maxLanguages: true,
  features: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

function assertPrismaModels(prismaClient) {
  const missingModels = REQUIRED_PRISMA_MODELS.filter(
    (model) => typeof prismaClient?.[model]?.findMany !== 'function'
  );

  if (missingModels.length > 0) {
    const message = `Prisma client missing required models: ${missingModels.join(
      ', '
    )}. Run "npx prisma generate" and restart the dev server.`;
    const error = new Error(message);
    error.name = 'PrismaClientOutdatedError';

    logger.error('[Billing] Prisma client missing required models', {
      missingModels
    });

    collectError({
      errorType: ERROR_TYPES.BILLING,
      errorCategory: 'CONFIGURATION',
      errorCode: 'BILLING_PRISMA_MODEL_MISSING',
      message,
      stack: error.stack,
      operation: 'billing.prisma_validation',
      severity: 5,
      retryable: false,
      fatal: true,
      context: {
        missingModels
      }
    }).catch((collectErr) => {
      logger.warn('[Billing] Failed to record Prisma model error', {
        error: collectErr?.message || collectErr
      });
    });

    throw error;
  }
}

const BILLING_CURRENCY = (process.env.BILLING_CURRENCY || 'USD').toUpperCase();
const BILLING_INTERVAL = process.env.BILLING_INTERVAL || 'EVERY_30_DAYS';
const BILLING_TEST_MODE = process.env.BILLING_TEST_MODE === 'true';

const SHOPIFY_STATUS_MAP = {
  ACTIVE: 'active',
  ACCEPTED: 'active',
  PENDING: 'pending_activation',
  PENDING_ACTIVATION: 'pending_activation',
  PAUSED: 'paused',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

const APP_SUBSCRIPTION_CREATE_MUTATION = `#graphql
mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean, $trialDays: Int) {
  appSubscriptionCreate(
    name: $name
    returnUrl: $returnUrl
    lineItems: $lineItems
    test: $test
    trialDays: $trialDays
  ) {
    appSubscription {
      id
      name
      status
      test
      trialDays
      currentPeriodEnd
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              interval
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
    confirmationUrl
    userErrors {
      field
      message
    }
  }
}
`;

const CURRENT_APP_INSTALLATION_QUERY = `#graphql
query CurrentAppInstallation {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      test
      trialDays
      currentPeriodEnd
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              interval
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
}
`;

const APP_SUBSCRIPTION_CANCEL_MUTATION = `#graphql
mutation AppSubscriptionCancel($id: ID!, $reason: AppSubscriptionCancellationReason!, $refund: Boolean!) {
  appSubscriptionCancel(id: $id, cancellationReason: $reason, prorate: $refund) {
    appSubscription {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

function mapShopifyStatus(status) {
  if (!status) {
    return 'unknown';
  }
  return SHOPIFY_STATUS_MAP[status] || status.toLowerCase();
}

function createSubscriptionManager({ prismaClient }) {
  assertPrismaModels(prismaClient);

  const listActivePlans = () => {
    assertPrismaModels(prismaClient);
    return prismaClient.subscriptionPlan.findMany({
      where: { isActive: true },
      select: PLAN_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { monthlyCredits: 'asc' }]
    });
  };

  const findPlanByIdOrName = async (planIdOrName) => {
    assertPrismaModels(prismaClient);
    if (!planIdOrName) return null;
    const [plan] = await prismaClient.subscriptionPlan.findMany({
      where: {
        OR: [{ id: planIdOrName }, { name: planIdOrName }]
      },
      select: PLAN_SELECT
    });
    return plan;
  };

  const validatePlanChange = async ({ shopId, targetPlan }) => {
    assertPrismaModels(prismaClient);
    if (!targetPlan) {
      return {
        canProceed: false,
        reason: 'PLAN_NOT_FOUND'
      };
    }

    // 仅在目标套餐有限制且为“收紧语言上限”时检查语言数量
    const targetHasLimit =
      targetPlan.maxLanguages !== null && targetPlan.maxLanguages !== undefined;

    // 仅当目标限制比当前更小（或当前无限制）才需要校验
    if (targetHasLimit) {
      const activeLanguagesCount = await prismaClient.language.count({
        where: {
          shopId,
          enabled: true,
          isActive: true // 仅有 isActive 字段，schema 中不存在 status
        }
      });

      if (activeLanguagesCount > targetPlan.maxLanguages) {
        return {
          canProceed: false,
          reason: 'LANGUAGE_LIMIT_EXCEEDED',
          details: {
            activeLanguagesCount,
            allowedLanguages: targetPlan.maxLanguages,
            mustDisable: activeLanguagesCount - targetPlan.maxLanguages
          }
        };
      }
    }

    return { canProceed: true };
  };

  const upsertSubscriptionRecord = (shopId, planId, updates = {}) => {
    assertPrismaModels(prismaClient);
    return prismaClient.shopSubscription.upsert({
      where: { shopId },
      update: {
        planId,
        updatedAt: new Date(),
        ...updates
      },
      create: {
        shopId,
        planId,
        status: updates.status || 'pending_activation',
        billingCycle: updates.billingCycle || 'monthly',
        shopifyChargeId: updates.shopifyChargeId ?? null,
        startDate: updates.startDate || new Date()
      }
    });
  };

  const createSubscriptionForPaidPlan = async ({ admin, shopId, plan, returnUrl, trialDays }) => {
    assertPrismaModels(prismaClient);
    const lineItems = [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: BILLING_INTERVAL,
            price: {
              amount: plan.price,
              currencyCode: BILLING_CURRENCY
            }
          }
        }
      }
    ];

    const variables = {
      name: `${plan.displayName} Plan`,
      returnUrl,
      lineItems,
      test: BILLING_TEST_MODE,
      trialDays: typeof trialDays === 'number' ? trialDays : undefined
    };

    const response = await admin.graphql(APP_SUBSCRIPTION_CREATE_MUTATION, {
      variables
    });
    const payload = await response.json();

    const result = payload?.data?.appSubscriptionCreate;
    const errors = result?.userErrors || payload?.errors;

    if (errors && errors.length) {
      const message = errors.map((err) => err.message || JSON.stringify(err)).join('; ');
      logger.error('[Billing] Failed to create Shopify subscription', {
        shopId,
        planId: plan.id,
        message
      });
      throw new Error(`Shopify 订阅创建失败: ${message}`);
    }

    const appSubscription = result?.appSubscription;
    if (!appSubscription?.id) {
      throw new Error('Shopify 未返回有效的订阅ID');
    }

    await upsertSubscriptionRecord(shopId, plan.id, {
      status: 'pending_activation',
      shopifyChargeId: appSubscription.id,
      startDate: new Date(),
      cancelledAt: null,
      endDate: null
    });

    logger.info('[Billing] Created Shopify subscription', {
      shopId,
      plan: plan.name,
      chargeId: appSubscription.id,
      testMode: BILLING_TEST_MODE
    });

    return {
      confirmationUrl: result?.confirmationUrl,
      appSubscription
    };
  };

  const activateFreePlan = async (shopId, plan) => {
    assertPrismaModels(prismaClient);
    const subscription = await upsertSubscriptionRecord(shopId, plan.id, {
      status: 'active',
      shopifyChargeId: null,
      startDate: new Date(),
      cancelledAt: null,
      endDate: null
    });

    logger.info('[Billing] Activated free plan for shop', {
      shopId,
      plan: plan.name
    });

    return {
      confirmationUrl: null,
      appSubscription: null,
      subscription
    };
  };

  const scheduleDowngrade = async ({ shopId, targetPlanId, gracePeriodDays = 30 }) => {
    const now = new Date();
    const graceEnds = new Date(now.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    const updated = await prismaClient.shop.update({
      where: { id: shopId },
      data: {
        pendingPlanId: targetPlanId,
        planChangeRequestedAt: now,
        gracePeriodEndsAt: graceEnds
      },
      include: {
        pendingPlan: true
      }
    });

    logger.info('[Billing] Scheduled downgrade', {
      shopId,
      toPlan: updated.pendingPlan?.name,
      gracePeriodEndsAt: graceEnds.toISOString()
    });

    return { gracePeriodEndsAt: graceEnds };
  };

  /**
   * 执行已到期的待处理套餐变更（主要用于降级）
   * @param {object} params
   * @param {import('@shopify/shopify-api').AdminApiContext} params.admin - Shopify Admin 实例
   * @param {string} params.shopId
   */
  const executePendingPlanChange = async ({ admin, shopId }) => {
    assertPrismaModels(prismaClient);
    if (!admin || !shopId) {
      throw new Error('executePendingPlanChange 需要 admin 和 shopId');
    }

    const shop = await prismaClient.shop.findUnique({
      where: { id: shopId },
      include: {
        pendingPlan: true,
        subscription: true
      }
    });

    if (!shop?.pendingPlanId || !shop?.gracePeriodEndsAt) {
      return { executed: false, reason: 'no-pending-plan' };
    }

    if (new Date() < shop.gracePeriodEndsAt) {
      return { executed: false, reason: 'grace-period-not-ended' };
    }

    // 1) 取消当前 Shopify 订阅（如果有）
    try {
      await cancelSubscription({ admin, shopId, prorate: false, reason: 'CUSTOMER_REQUEST' });
    } catch (err) {
      logger.error('[Billing] Failed to cancel subscription before applying pending plan', {
        shopId,
        error: err?.message || err
      });
      throw err;
    }

    // 2) 应用新的计划到本地订阅记录（不创建新 Shopify 订阅，假设为降级场景）
    await upsertSubscriptionRecord(shopId, shop.pendingPlanId, {
      status: 'active',
      startDate: new Date(),
      cancelledAt: null,
      endDate: null,
      billingCycle: 'monthly'
    });

    // 3) 清空待处理字段
    await prismaClient.shop.update({
      where: { id: shopId },
      data: {
        pendingPlanId: null,
        planChangeRequestedAt: null,
        gracePeriodEndsAt: null
      }
    });

    logger.info('[Billing] Executed pending plan change', {
      shopId,
      appliedPlanId: shop.pendingPlanId
    });

    return { executed: true, planId: shop.pendingPlanId };
  };

  const createSubscriptionSession = async ({ admin, shopId, planId, returnUrl, trialDays }) => {
    if (!shopId) {
      throw new Error('shopId 必填');
    }

    const plan = await findPlanByIdOrName(planId);
    if (!plan || !plan.isActive) {
      throw new Error('订阅计划不存在或已停用');
    }

    if (!returnUrl) {
      throw new Error('returnUrl 必填');
    }

    if (plan.price <= 0) {
      return activateFreePlan(shopId, plan);
    }

    return createSubscriptionForPaidPlan({ admin, shopId, plan, returnUrl, trialDays });
  };

  const getSubscription = async (shopId) => {
    assertPrismaModels(prismaClient);
    if (!shopId) return null;
    return prismaClient.shopSubscription.findUnique({
      where: { shopId },
      include: { plan: true }
    });
  };

  const syncSubscriptionFromShopify = async ({ admin, shopId }) => {
    if (!admin || !shopId) {
      throw new Error('同步订阅需要提供 admin 实例和 shopId');
    }

    assertPrismaModels(prismaClient);
    const response = await admin.graphql(CURRENT_APP_INSTALLATION_QUERY);
    const payload = await response.json();
    const active = payload?.data?.currentAppInstallation?.activeSubscriptions || [];

    const existing = await getSubscription(shopId);

    if (active.length === 0) {
      if (existing && existing.status !== 'cancelled') {
        await prismaClient.shopSubscription.update({
          where: { shopId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            endDate: new Date()
          }
        });

        logger.warn('[Billing] Shopify reports no active subscriptions; record marked cancelled', {
          shopId,
          previousStatus: existing.status
        });
      }
      return null;
    }

    const subscription = active[0];
    const status = mapShopifyStatus(subscription.status);
    const lineItem = subscription.lineItems?.[0];
    const price = lineItem?.plan?.pricingDetails?.price?.amount ?? null;
    const currency = lineItem?.plan?.pricingDetails?.price?.currencyCode ?? BILLING_CURRENCY;

    let planId = existing?.planId ?? null;
    if (!planId && price != null) {
      const plan = await prismaClient.subscriptionPlan.findFirst({
        where: {
          price: Number(price),
          isActive: true
        },
        select: PLAN_SELECT
      });
      if (plan) {
        planId = plan.id;
      }
    }

    if (!planId && existing?.planId) {
      planId = existing.planId;
    }

    const defaultPlan = await prismaClient.subscriptionPlan.findFirst({
      where: { name: 'free', isActive: true },
      select: PLAN_SELECT
    });

    const updated = await prismaClient.shopSubscription.upsert({
      where: { shopId },
      update: {
        status,
        shopifyChargeId: subscription.id,
        planId: planId ?? existing?.planId ?? null,
        startDate: existing?.startDate ?? new Date(),
        endDate: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null,
        updatedAt: new Date()
      },
      create: {
        shopId,
        planId: planId ?? defaultPlan?.id ?? null,
        status,
        shopifyChargeId: subscription.id,
        startDate: new Date(),
        billingCycle: 'monthly'
      },
      include: { plan: true }
    });

    logger.info('[Billing] Synced Shopify subscription status', {
      shopId,
      status,
      price,
      currency,
      test: subscription.test
    });

    return updated;
  };

  const cancelSubscription = async ({ admin, shopId, prorate = false, reason = 'CUSTOMER_REQUEST' }) => {
    assertPrismaModels(prismaClient);
    const existing = await getSubscription(shopId);
    if (!existing?.shopifyChargeId) {
      logger.warn('[Billing] cancelSubscription called but no charge id found', { shopId });
      if (existing) {
        await prismaClient.shopSubscription.update({
          where: { shopId },
          data: { status: 'cancelled', cancelledAt: new Date(), endDate: new Date() }
        });
      }
      return { status: 'cancelled', prorated: false };
    }

    const response = await admin.graphql(APP_SUBSCRIPTION_CANCEL_MUTATION, {
      variables: {
        id: existing.shopifyChargeId,
        reason,
        refund: !!prorate
      }
    });

    const payload = await response.json();
    const result = payload?.data?.appSubscriptionCancel;
    const errors = result?.userErrors;

    if (errors && errors.length) {
      const message = errors.map((err) => err.message || JSON.stringify(err)).join('; ');
      throw new Error(`取消订阅失败: ${message}`);
    }

    await prismaClient.shopSubscription.update({
      where: { shopId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        endDate: new Date()
      }
    });

    logger.info('[Billing] Subscription cancelled', {
      shopId,
      chargeId: existing.shopifyChargeId,
      prorate
    });

    return { status: 'cancelled', prorated: !!prorate };
  };

  return {
    listActivePlans,
    validatePlanChange,
    createSubscriptionSession,
    scheduleDowngrade,
    getSubscription,
    syncSubscriptionFromShopify,
    cancelSubscription,
    executePendingPlanChange
  };
}

export const subscriptionManager = createSubscriptionManager({ prismaClient: prisma });
export { createSubscriptionManager };
