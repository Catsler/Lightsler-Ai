import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";
import { subscriptionManager } from "../services/subscription-manager.server.js";
import { ULTRA_PLANS, getEffectivePlan } from "../utils/pricing-config.js";

/**
 * 调试端点：输出当前店铺的计费状态（订阅、override、生效套餐）。
 * 仅用于临时排障；如需保留请加上鉴权限制。
 */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  // 订阅（通过封装 manager 获取）
  const subscription = await subscriptionManager.getSubscription(shopId);

  // Shop 关键信息
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      overridePlanId: true,
      overrideExpiresAt: true,
      pendingPlanId: true,
      gracePeriodEndsAt: true,
      subscription: true
    }
  });

  // 计算生效套餐
  const effectivePlan = getEffectivePlan(
    {
      ...shop,
      activeSubscription: subscription,
      // 兼容 getEffectivePlan 对 planId 的读取
      planId: subscription?.planId
    },
    ULTRA_PLANS
  );

  return json({
    shopId,
    subscription: subscription || null,
    shop: shop || null,
    effectivePlan: effectivePlan || null,
    plans: ULTRA_PLANS.map(p => ({
      id: p.id,
      price: p.price,
      monthlyCredits: p.monthlyCredits,
      hidden: p.hidden
    }))
  });
}
