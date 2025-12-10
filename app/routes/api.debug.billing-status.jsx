import { json } from "@remix-run/node";
import { createApiRoute } from "../utils/base-route.server.js";
import prisma from "../db.server.js";
import { subscriptionManager } from "../services/subscription-manager.server.js";
import { ULTRA_PLANS, getEffectivePlan } from "../utils/pricing-config.js";
import { apiLogger } from "../utils/logger.server.js";

/**
 * 调试端点：输出当前店铺的计费状态（订阅、override、生效套餐）。
 * 仅用于临时排障；如需保留请加上鉴权限制。
 */
async function handleBillingStatus({ session }) {
  const shopId = session?.shop;
  const isProd = process.env.NODE_ENV === "production";
  const whitelist = (process.env.ADMIN_SHOPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (isProd) {
    if (!shopId || !whitelist.includes(shopId)) {
      return json({ success: false, message: "Debug endpoint disabled or forbidden" }, { status: 403 });
    }
  } else if (whitelist.length && (!shopId || !whitelist.includes(shopId))) {
    return json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    const subscription = await subscriptionManager.getSubscription(shopId);

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        overridePlanId: true,
        overrideExpiresAt: true,
        pendingPlanId: true,
        gracePeriodEndsAt: true,
        subscription: true,
      },
    });

    const effectivePlan = getEffectivePlan(
      {
        ...shop,
        activeSubscription: subscription,
        planId: subscription?.planId,
      },
      ULTRA_PLANS
    );

    return json({
      success: true,
      shopId,
      subscription: subscription || null,
      shop: shop || null,
      effectivePlan: effectivePlan || null,
      plans: ULTRA_PLANS.map((p) => ({
        id: p.id,
        price: p.price,
        monthlyCredits: p.monthlyCredits,
        hidden: p.hidden,
      })),
    });
  } catch (error) {
    apiLogger.error("[BillingStatus] Failed", { shopId: shopId || "unknown", error: error.message });
    return json({ success: false, message: "Failed to fetch billing status" }, { status: 500 });
  }
}

export const loader = createApiRoute(handleBillingStatus, {
  requireAuth: true,
  operationName: "debug-billing-status",
});
