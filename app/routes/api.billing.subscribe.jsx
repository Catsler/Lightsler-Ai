import { createApiRoute } from "../utils/base-route.server.js";
import { subscriptionManager } from "../services/subscription-manager.server.js";

function buildReturnUrl(request, fallbackPath = '/app/billing/activate') {
  const envUrl = process.env.BILLING_RETURN_URL;
  if (envUrl) {
    return envUrl;
  }

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (appUrl) {
    try {
      const url = new URL(fallbackPath, appUrl);
      return url.toString();
    } catch {
      // ignore invalid base URL
    }
  }

  const requestUrl = new URL(request.url);
  requestUrl.pathname = fallbackPath;
  requestUrl.search = '';
  return requestUrl.toString();
}

function validateSubscribeParams(params) {
  const errors = [];
  if (!params.planId) {
    errors.push({ field: 'planId', message: 'planId is required' });
  }

  if (errors.length) {
    return { valid: false, errors };
  }
  return { valid: true };
}

async function handleSubscribe({ request, session, admin, params }) {
  const planId = params.planId;
  const trialDays = params.trialDays ? Number(params.trialDays) : undefined;
  const returnUrl = params.returnUrl || buildReturnUrl(request);
  const fetchId = params._fetchId || null;

  try {
    const result = await subscriptionManager.createSubscriptionSession({
      admin,
      shopId: session.shop,
      planId,
      returnUrl,
      trialDays
    });

    return {
      success: true,
      data: {
        confirmationUrl: result.confirmationUrl,
        status: result.appSubscription?.status ?? 'active',
        shopifyChargeId: result.appSubscription?.id ?? null
      },
      _fetchId: fetchId
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Failed to create subscription',
      _fetchId: fetchId
    };
  }
}

export const action = createApiRoute(handleSubscribe, {
  requireAuth: true,
  operationName: 'billing:subscribe',
  metricKey: 'billing.subscribe.action',
  validateParams: validateSubscribeParams
});
