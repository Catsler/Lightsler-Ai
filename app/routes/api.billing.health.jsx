import { json } from "@remix-run/node";
import { createApiRoute } from "../utils/base-route.server.js";
import { prisma } from "../db.server.js";
import { apiLogger } from "../utils/logger.server.js";

async function handleBillingHealth() {
  try {
    const lock = await prisma.serviceLock.findUnique({
      where: { service: "billing-scheduler" },
    });

    const now = Date.now();
    const lockAge = lock ? now - new Date(lock.acquiredAt).getTime() : null;
    const isStale = lockAge != null && lockAge > 15 * 60 * 1000; // 15分钟视为异常

    const body = {
      status: isStale ? "degraded" : "healthy",
      scheduler: {
        running: !!lock,
        instanceId: lock?.instanceId,
        lastHeartbeat: lock?.acquiredAt,
        lockAgeMs: lockAge,
        isStale,
      },
    };

    return new Response(JSON.stringify(body), { status: isStale ? 503 : 200 });
  } catch (error) {
    apiLogger.error("[BillingHealth] Failed", { error: error?.message || error });
    return json(
      {
        status: "error",
        error: error?.message || error,
      },
      { status: 500 }
    );
  }
}

export const loader = createApiRoute(handleBillingHealth, {
  requireAuth: false,
  operationName: "billing-health",
});
