import { json } from "@remix-run/node";
import { createApiRoute } from "../utils/base-route.server.js";
import prisma from "../db.server";
import { ULTRA_PLANS } from "../utils/pricing-config";
import { apiLogger } from "../utils/logger.server.js";

const adminWhitelist = (process.env.ADMIN_SHOPS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

function isAllowed({ shop, isProd }) {
  if (isProd) {
    if (!shop) return false;
    if (!adminWhitelist.length) return false;
    return adminWhitelist.includes(shop);
  }

  if (adminWhitelist.length) {
    return shop ? adminWhitelist.includes(shop) : false;
  }

  // 非生产且未配置白名单，默认允许（便于开发）
  return true;
}

async function handleSeedPlans({ request, session }) {
  if (request.method !== "POST") {
    return json({ success: false, message: "Method not allowed" }, { status: 405 });
  }

  const shop = session?.shop;
  const isProd = process.env.NODE_ENV === "production";
  const allowed = isAllowed({ shop, isProd });

  if (!allowed) {
    return json({ success: false, message: "Seed endpoint disabled or forbidden" }, { status: 403 });
  }

  const results = [];

  try {
    for (const plan of ULTRA_PLANS) {
      const upsert = await prisma.subscriptionPlan.upsert({
        where: { id: plan.id },
        update: {
          name: plan.name,
          displayName: plan.displayName,
          price: plan.price,
          monthlyCredits: plan.monthlyCredits,
          rateLimit: plan.rateLimit,
          isActive: true,
          features: JSON.stringify(plan.features || {}),
        },
        create: {
          id: plan.id,
          name: plan.name,
          displayName: plan.displayName,
          price: plan.price,
          currency: "USD",
          interval: "EVERY_30_DAYS",
          monthlyCredits: plan.monthlyCredits,
          rateLimit: plan.rateLimit,
          isActive: true,
          features: JSON.stringify(plan.features || {}),
        },
      });
      results.push(upsert);
    }

    apiLogger.info("[SeedPlans] Seed completed", {
      shopId: shop || "unknown",
      seeded: results.length,
      isProd,
      allowed,
    });

    return json({ success: true, seeded: results.length, plans: results });
  } catch (error) {
    apiLogger.error("[SeedPlans] Failed", {
      shopId: shop || "unknown",
      error: error.message,
      isProd,
      allowed,
    });
    return json({ success: false, message: "Seed failed" }, { status: 500 });
  }
}

export const action = createApiRoute(handleSeedPlans, {
  requireAuth: true,
  operationName: "seed-plans",
});
