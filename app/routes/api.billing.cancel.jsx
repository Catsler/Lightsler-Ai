import { createApiRoute } from "../utils/base-route.server.js";
import { subscriptionManager } from "../services/subscription-manager.server.js";

const ALLOWED_REASONS = new Set([
  'CUSTOMER_REQUEST',
  'FAILED_PAYMENT',
  'SHOPIFY_INITIATED',
  'OTHER'
]);

function validateCancelParams(params) {
  // 在取消场景下，允许缺少 reason，_fetchId 用于前端匹配
  if (params.reason && !ALLOWED_REASONS.has(params.reason)) {
    return { valid: false, errors: [{ field: 'reason', message: 'reason 参数不合法' }] };
  }
  return { valid: true };
}

async function handleCancelSubscription({ session, admin, params }) {
  const reason = ALLOWED_REASONS.has(params.reason) ? params.reason : 'CUSTOMER_REQUEST';
  const prorate = params.prorate === 'true';
  const fetchId = params._fetchId || null;

  try {
    const result = await subscriptionManager.cancelSubscription({
      admin,
      shopId: session.shop,
      prorate,
      reason
    });

    return {
      success: true,
      data: result,
      _fetchId: fetchId
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '取消订阅失败',
      _fetchId: fetchId
    };
  }
}

export const action = createApiRoute(handleCancelSubscription, {
  requireAuth: true,
  operationName: 'billing:cancel',
  metricKey: 'billing.cancel.action',
  validateParams: validateCancelParams
});
