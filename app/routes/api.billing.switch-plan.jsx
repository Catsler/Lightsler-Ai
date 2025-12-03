import { createApiRoute } from "../utils/base-route.server.js";
import { handleSwitchPlan } from "../services/billing/switch-plan-handler.server.js";

function validateSwitchParams(params) {
  const errors = [];
  if (!params.planId) {
    errors.push({ field: 'planId', message: 'planId 是必填参数' });
  }
  return errors.length ? { valid: false, errors } : { valid: true };
}

export const action = createApiRoute(handleSwitchPlan, {
  requireAuth: true,
  operationName: 'billing:switch-plan',
  metricKey: 'billing.switchPlan.action',
  validateParams: validateSwitchParams
});
