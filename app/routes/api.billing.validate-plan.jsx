import { json } from "@remix-run/node";
import { createApiRoute } from "../utils/base-route.server.js";
import { subscriptionManager } from "../services/subscription-manager.server.js";

async function handleValidatePlan({ request, session }) {
  const url = new URL(request.url);
  const targetPlanId = url.searchParams.get("planId");

  if (!targetPlanId) {
    return json({ success: false, message: "planId is required" }, { status: 400 });
  }

  const plans = await subscriptionManager.listActivePlans();
  const targetPlan = plans.find((p) => p.id === targetPlanId) || null;
  const validation = await subscriptionManager.validatePlanChange({ shopId: session?.shop, targetPlan });

  return json({ success: true, validation });
}

export const loader = createApiRoute(handleValidatePlan, {
  requireAuth: true,
  operationName: "billing-validate-plan",
});
