import { test, vi } from 'vitest';
import assert from 'node:assert/strict';

process.env.LOGGING_ENABLE_PERSISTENT_LOGGER = 'false';
process.env.LOGGING_PERSISTENCE_LEVEL = 'ERROR';
process.env.LOG_LEVEL = 'error';

vi.mock('../../app/db.server.js', () => {
  const createModel = () => ({
    findMany: vi.fn(async () => [])
  });

  const prismaStub = {
    $disconnect: vi.fn(() => Promise.resolve()),
    $connect: vi.fn(() => Promise.resolve()),
    subscriptionPlan: createModel(),
    shopSubscription: createModel(),
    shop: createModel(),
    language: createModel(),
    resource: createModel()
  };

  return {
    prisma: prismaStub,
    default: prismaStub
  };
});

const { createSubscriptionManager } = await import('../../app/services/subscription-manager.server.js');
const { logger } = await import('../../app/utils/logger.server.js');
const { prisma } = await import('../../app/db.server.js');

await prisma.$disconnect().catch(() => {});

logger.info = () => {};
logger.warn = () => {};
logger.error = () => {};

class FakePrisma {
  constructor() {
    this.reset();
  }

  reset() {
    this.plans = [
      {
        id: 'plan_free',
        name: 'free',
        displayName: 'Free',
        price: 0,
        monthlyCredits: 0,
        maxLanguages: 1,
        features: { autoTranslation: false },
        sortOrder: 0,
        isActive: true
      },
      {
        id: 'plan_starter',
        name: 'starter',
        displayName: 'Starter',
        price: 9.99,
        monthlyCredits: 10,
        maxLanguages: 3,
        features: { autoTranslation: true },
        sortOrder: 1,
        isActive: true
      }
    ];

    this.shopSubscriptions = new Map();
    this.shops = new Map();
  }

  clone(value) {
    return value == null ? value : structuredClone(value);
  }

  ensureShop(id) {
    if (!this.shops.has(id)) {
      this.shops.set(id, {
        id,
        pendingPlanId: null,
        planChangeRequestedAt: null,
        gracePeriodEndsAt: null
      });
    }
    return this.shops.get(id);
  }

  filterPlans(where) {
    if (!where) return this.plans;
    return this.plans.filter((plan) => {
      if (where.OR) {
        return where.OR.some((condition) => this.filterPlans(condition).includes(plan));
      }
      if (where.isActive !== undefined && plan.isActive !== where.isActive) return false;
      if (where.id && plan.id !== where.id) return false;
      if (where.name && plan.name !== where.name) return false;
      if (where.price !== undefined && Number(plan.price) !== Number(where.price)) return false;
      return true;
    });
  }

  subscriptionPlan = {
    findMany: async ({ where, orderBy } = {}) => {
      let plans = this.filterPlans(where);
      if (orderBy && orderBy.length) {
        plans = plans.slice().sort((a, b) => {
          for (const order of orderBy) {
            const [[key, direction]] = Object.entries(order);
            if (a[key] === b[key]) continue;
            const comparison = a[key] > b[key] ? 1 : -1;
            return direction === 'asc' ? comparison : -comparison;
          }
          return 0;
        });
      }
      return plans.map((plan) => this.clone(plan));
    },
    findFirst: async ({ where } = {}) => {
      const plans = this.filterPlans(where);
      return plans.length ? this.clone(plans[0]) : null;
    }
  };

  shopSubscription = {
    findMany: async () => Array.from(this.shopSubscriptions.values()).map((record) => this.clone(record)),
    findUnique: async ({ where: { shopId } }) => {
      const record = this.shopSubscriptions.get(shopId);
      return record ? this.clone(record) : null;
    },
    upsert: async ({ where: { shopId }, update, create, include }) => {
      let record = this.shopSubscriptions.get(shopId);
      if (record) {
        record = { ...record, ...update };
      } else {
        record = { id: `sub_${this.shopSubscriptions.size + 1}`, ...create };
      }
      this.shopSubscriptions.set(shopId, record);

      if (include?.plan) {
        const plan = this.plans.find((p) => p.id === record.planId);
        return this.clone({ ...record, plan: plan ? this.clone(plan) : null });
      }
      return this.clone(record);
    },
    update: async ({ where: { shopId }, data }) => {
      const record = this.shopSubscriptions.get(shopId);
      if (!record) {
        throw new Error(`Shop subscription not found for ${shopId}`);
      }
      const updated = { ...record, ...data };
      this.shopSubscriptions.set(shopId, updated);
      return this.clone(updated);
    }
  };

  shop = {
    findMany: async () => Array.from(this.shops.values()).map((record) => this.clone(record)),
    update: async ({ where: { id }, data, include }) => {
      const current = { ...this.ensureShop(id), ...data };
      this.shops.set(id, current);
      if (include?.pendingPlan) {
        const plan = current.pendingPlanId
          ? this.plans.find((p) => p.id === current.pendingPlanId)
          : null;
        return this.clone({ ...current, pendingPlan: plan ? this.clone(plan) : null });
      }
      return this.clone(current);
    },
    findUnique: async ({ where: { id } }) => {
      const record = this.shops.get(id);
      return record ? this.clone(record) : null;
    }
  };
}

const fakePrisma = new FakePrisma();

function buildManager() {
  return createSubscriptionManager({ prismaClient: fakePrisma });
}

test('listActivePlans returns active plans with expected ordering', async () => {
  fakePrisma.reset();
  const manager = buildManager();

  const plans = await manager.listActivePlans();
  assert.equal(plans.length, 2);
  assert.deepEqual(plans.map((p) => p.name), ['free', 'starter']);
});

test('createSubscriptionSession activates free plan without Shopify call', async () => {
  fakePrisma.reset();
  const manager = buildManager();

  const result = await manager.createSubscriptionSession({
    admin: {}, // 未使用
    shopId: 'shop_free',
    planId: 'free',
    returnUrl: 'https://example.com/billing'
  });

  assert.equal(result.confirmationUrl, null);

  const stored = await manager.getSubscription('shop_free');
  assert.equal(stored.status, 'active');
  assert.equal(stored.planId, 'plan_free');
});

test('createSubscriptionSession calls Shopify for paid plan', async () => {
  fakePrisma.reset();
  const manager = buildManager();

  let graphqlCalled = false;
  const admin = {
    graphql: async (_query, { variables }) => {
      graphqlCalled = true;
      assert.equal(variables.lineItems[0].plan.appRecurringPricingDetails.price.amount, 9.99);
      return {
        json: async () => ({
          data: {
            appSubscriptionCreate: {
              appSubscription: {
                id: 'gid://shopify/AppSubscription/999',
                status: 'PENDING',
                lineItems: variables.lineItems
              },
              confirmationUrl: 'https://shopify.test/confirm',
              userErrors: []
            }
          }
        })
      };
    }
  };

  const result = await manager.createSubscriptionSession({
    admin,
    shopId: 'shop_paid',
    planId: 'starter',
    returnUrl: 'https://example.com/billing'
  });

  assert.equal(graphqlCalled, true);
  assert.equal(result.confirmationUrl, 'https://shopify.test/confirm');

  const stored = await manager.getSubscription('shop_paid');
  assert.equal(stored.status, 'pending_activation');
  assert.equal(stored.shopifyChargeId, 'gid://shopify/AppSubscription/999');
});

test('syncSubscriptionFromShopify updates local record to active', async () => {
  fakePrisma.reset();
  const manager = buildManager();

  fakePrisma.shopSubscriptions.set('shop_sync', {
    id: 'sub_existing',
    shopId: 'shop_sync',
    planId: 'plan_starter',
    status: 'pending_activation',
    shopifyChargeId: 'gid://shopify/AppSubscription/999',
    startDate: new Date(),
    billingCycle: 'monthly'
  });

  const admin = {
    graphql: async () => ({
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              {
                id: 'gid://shopify/AppSubscription/999',
                name: 'Starter Plan',
                status: 'ACTIVE',
                test: false,
                trialDays: 0,
                currentPeriodEnd: null,
                lineItems: [
                  {
                    plan: {
                      pricingDetails: {
                        __typename: 'AppRecurringPricing',
                        interval: 'EVERY_30_DAYS',
                        price: { amount: 9.99, currencyCode: 'USD' }
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      })
    })
  };

  const updated = await manager.syncSubscriptionFromShopify({
    admin,
    shopId: 'shop_sync'
  });

  assert.equal(updated.status, 'active');
  assert.equal(updated.shopifyChargeId, 'gid://shopify/AppSubscription/999');
});

test('cancelSubscription updates local record and returns cancelled status', async () => {
  fakePrisma.reset();
  const manager = buildManager();

  const existing = {
    id: 'sub_cancel',
    shopId: 'shop_cancel',
    planId: 'plan_starter',
    status: 'active',
    shopifyChargeId: 'gid://shopify/AppSubscription/888',
    startDate: new Date(),
    billingCycle: 'monthly'
  };

  fakePrisma.shopSubscriptions.set('shop_cancel', existing);

  let cancelCalled = false;
  const admin = {
    graphql: async () => {
      cancelCalled = true;
      return {
        json: async () => ({
          data: {
            appSubscriptionCancel: {
              appSubscription: { id: existing.shopifyChargeId, status: 'CANCELLED' },
              userErrors: []
            }
          }
        })
      };
    }
  };

  const result = await manager.cancelSubscription({
    admin,
    shopId: 'shop_cancel',
    prorate: false,
    reason: 'CUSTOMER_REQUEST'
  });

  assert.equal(cancelCalled, true);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.prorated, false);

  const stored = await manager.getSubscription('shop_cancel');
  assert.equal(stored.status, 'cancelled');
  assert.ok(stored.cancelledAt instanceof Date);
});

test('scheduleDowngrade stores pending plan info with grace period', async () => {
  fakePrisma.reset();
  fakePrisma.ensureShop('shop_pending');
  const manager = buildManager();

  const result = await manager.scheduleDowngrade({
    shopId: 'shop_pending',
    targetPlanId: 'plan_free',
    gracePeriodDays: 5
  });

  assert.ok(result.gracePeriodEndsAt instanceof Date);
  const stored = fakePrisma.shops.get('shop_pending');
  assert.equal(stored.pendingPlanId, 'plan_free');
  assert.ok(stored.planChangeRequestedAt instanceof Date);
  assert.ok(stored.gracePeriodEndsAt instanceof Date);
});
