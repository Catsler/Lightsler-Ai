import { subscriptionManager } from "../subscription-manager.server.js";

const DEFAULT_GRACE_DAYS = Number(process.env.BILLING_DOWNGRADE_GRACE_DAYS || 30);

export async function handleSwitchPlan({ session, admin, params }) {
  const targetPlanId = params.planId;
  const fetchId = params._fetchId || null;

  try {
    const current = await subscriptionManager.getSubscription(session.shop);
    const currentPlan = current?.plan ?? null;

    const targetPlan = await subscriptionManager.listActivePlans().then((plans) =>
      plans.find((plan) => plan.id === targetPlanId)
    );

    if (!targetPlan) {
      return {
        success: false,
        message: '目标套餐不存在或已停用',
        _fetchId: fetchId
      };
    }

    // 若已存在等待中的订阅变更，避免重复提交
    if (current?.status === 'pending_activation' || current?.pendingPlanId) {
      return {
        success: false,
        code: 'SUBSCRIPTION_PENDING',
        message: '当前已有待处理的套餐变更，请稍后再试。',
        _fetchId: fetchId
      };
    }

    // 前置验证（语言槽位等）
    const validation = await subscriptionManager.validatePlanChange({
      shopId: session.shop,
      targetPlan
    });

    if (!validation.canProceed) {
      const reason = validation.reason || 'VALIDATION_FAILED';
      let message = '套餐切换验证未通过';
      if (reason === 'LANGUAGE_LIMIT_EXCEEDED' && validation.details) {
        const { activeLanguagesCount, allowedLanguages, mustDisable } = validation.details;
        message = `当前激活语言数 ${activeLanguagesCount} 超出目标套餐限制 ${allowedLanguages}，请先禁用 ${mustDisable} 个语言后再尝试。`;
      }
      return {
        success: false,
        code: reason,
        message,
        details: validation.details,
        _fetchId: fetchId
      };
    }

    if (currentPlan && currentPlan.id === targetPlan.id) {
      return {
        success: true,
        data: {
          confirmationUrl: null,
          status: current.status
        },
        _fetchId: fetchId
      };
    }

    const currentPrice = currentPlan?.price ?? 0;
    const targetPrice = targetPlan.price ?? 0;

    if (currentPlan && targetPrice < currentPrice) {
      const schedule = await subscriptionManager.scheduleDowngrade({
        shopId: session.shop,
        targetPlanId: targetPlan.id,
        gracePeriodDays: DEFAULT_GRACE_DAYS
      });

      return {
        success: true,
        data: {
          confirmationUrl: null,
          status: current.status,
          gracePeriodEndsAt: schedule.gracePeriodEndsAt
        },
        _fetchId: fetchId
      };
    }

    const result = await subscriptionManager.createSubscriptionSession({
      admin,
      shopId: session.shop,
      planId: targetPlan.id,
      returnUrl: params.returnUrl,
      trialDays: params.trialDays ? Number(params.trialDays) : undefined
    });

    return {
      success: true,
      data: {
        confirmationUrl: result.confirmationUrl ?? null,
        status: result.appSubscription?.status ?? 'active'
      },
      _fetchId: fetchId
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '套餐切换失败',
      _fetchId: fetchId
    };
  }
}
