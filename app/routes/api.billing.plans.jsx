import { createApiRoute } from "../utils/base-route.server.js";
import { subscriptionManager } from "../services/subscription-manager.server.js";
import { creditManager } from "../services/credit-manager.server.js";
import { billingLogger } from "../utils/logger.server.js";

async function handleBillingPlans({ session }) {
  const shopId = session.shop;

  const [plans, subscription, credits] = await Promise.all([
    subscriptionManager.listActivePlans({ includeHidden: true }),
    subscriptionManager.getSubscription(shopId),
    creditManager
      .getAvailableCredits(shopId)
      .catch((error) => {
        billingLogger.warn('[Billing] Failed to load credit balance', { shopId, error: error.message });
        return null;
      })
  ]);

  return {
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      price: plan.price,
      monthlyCredits: plan.monthlyCredits,
      maxLanguages: plan.maxLanguages,
      features: plan.features
    })),
    subscription: subscription
      ? {
          status: subscription.status,
          planId: subscription.planId,
          planName: subscription.plan?.name,
          planDisplayName: subscription.plan?.displayName,
          shopifyChargeId: subscription.shopifyChargeId,
          billingCycle: subscription.billingCycle,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          cancelledAt: subscription.cancelledAt
        }
      : null,
    credits
  };
}

export const loader = createApiRoute(handleBillingPlans, {
  requireAuth: true,
  operationName: 'billing:listPlans',
  metricKey: 'billing.plans.loader'
});
