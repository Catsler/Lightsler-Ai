import { json } from "@remix-run/node";
import { prisma } from "../db.server.js";

export const loader = async () => {
  try {
    const lock = await prisma.serviceLock.findUnique({
      where: { service: "billing-scheduler" }
    });

    const now = Date.now();
    const lockAge = lock ? now - new Date(lock.acquiredAt).getTime() : null;
    const isStale = lockAge != null && lockAge > 15 * 60 * 1000; // 15分钟视为异常

    return json(
      {
        status: isStale ? "degraded" : "healthy",
        scheduler: {
          running: !!lock,
          instanceId: lock?.instanceId,
          lastHeartbeat: lock?.acquiredAt,
          lockAgeMs: lockAge,
          isStale,
        },
      },
      { status: isStale ? 503 : 200 }
    );
  } catch (error) {
    return json(
      {
        status: "error",
        error: error?.message || error,
      },
      { status: 500 }
    );
  }
};
