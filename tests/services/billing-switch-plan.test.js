import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../app/services/subscription-manager.server.js', () => {
  const getSubscription = vi.fn();
  const listActivePlans = vi.fn();
  const scheduleDowngrade = vi.fn();
  const createSubscriptionSession = vi.fn();
  const validatePlanChange = vi.fn(async () => ({ canProceed: true }));
  return {
    subscriptionManager: {
      getSubscription,
      listActivePlans,
      scheduleDowngrade,
      createSubscriptionSession,
      validatePlanChange
    }
  };
});

const { subscriptionManager } = await import('../../app/services/subscription-manager.server.js');
const { handleSwitchPlan } = await import('../../app/services/billing/switch-plan-handler.server.js');

describe('handleSwitchPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules downgrade when target plan is cheaper', async () => {
    const graceDate = new Date('2030-01-01T00:00:00Z');
    subscriptionManager.getSubscription.mockResolvedValue({
      plan: { id: 'plan_starter', price: 15 },
      status: 'active'
    });
    subscriptionManager.listActivePlans.mockResolvedValue([
      { id: 'plan_free', price: 0 }
    ]);
    subscriptionManager.scheduleDowngrade.mockResolvedValue({
      gracePeriodEndsAt: graceDate
    });

    const result = await handleSwitchPlan({
      session: { shop: 'shop_a' },
      admin: {},
      params: { planId: 'plan_free' }
    });

    expect(subscriptionManager.scheduleDowngrade).toHaveBeenCalledWith({
      shopId: 'shop_a',
      targetPlanId: 'plan_free',
      gracePeriodDays: expect.any(Number)
    });
    expect(result.success).toBe(true);
    expect(result.data?.gracePeriodEndsAt).toEqual(graceDate);
  });

  it('creates subscription session for upgrades with provided returnUrl', async () => {
    subscriptionManager.getSubscription.mockResolvedValue({
      plan: { id: 'plan_free', price: 0 },
      status: 'active'
    });
    subscriptionManager.listActivePlans.mockResolvedValue([
      { id: 'plan_pro', price: 25 }
    ]);
    subscriptionManager.createSubscriptionSession.mockResolvedValue({
      confirmationUrl: 'https://shopify.test/confirm',
      appSubscription: { status: 'pending' }
    });

    const result = await handleSwitchPlan({
      session: { shop: 'shop_b' },
      admin: { id: 'admin-test' },
      params: { planId: 'plan_pro', returnUrl: 'https://example.com/app/billing' }
    });

    expect(subscriptionManager.createSubscriptionSession).toHaveBeenCalledWith({
      admin: { id: 'admin-test' },
      shopId: 'shop_b',
      planId: 'plan_pro',
      returnUrl: 'https://example.com/app/billing',
      trialDays: undefined
    });
    expect(result.success).toBe(true);
    expect(result.data?.confirmationUrl).toBe('https://shopify.test/confirm');
  });

  it('returns failure when upgrade request misses returnUrl', async () => {
    subscriptionManager.getSubscription.mockResolvedValue({
      plan: { id: 'plan_free', price: 0 },
      status: 'active'
    });
    subscriptionManager.listActivePlans.mockResolvedValue([
      { id: 'plan_pro', price: 25 }
    ]);
    subscriptionManager.createSubscriptionSession.mockRejectedValue(new Error('returnUrl 必填'));

    const result = await handleSwitchPlan({
      session: { shop: 'shop_c' },
      admin: { id: 'admin-test' },
      params: { planId: 'plan_pro' }
    });

    expect(subscriptionManager.createSubscriptionSession).toHaveBeenCalledWith({
      admin: { id: 'admin-test' },
      shopId: 'shop_c',
      planId: 'plan_pro',
      returnUrl: undefined,
      trialDays: undefined
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe('returnUrl 必填');
  });
});
