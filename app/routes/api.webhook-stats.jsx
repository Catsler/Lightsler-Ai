import { getWebhookEventStats } from "../services/webhook-cleanup.server";
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 获取webhook事件统计信息的处理函数
 */
async function handleGetWebhookStats() {
  // 获取统计信息
  const stats = await getWebhookEventStats();
  
  return stats;
}

export const loader = createApiRoute(handleGetWebhookStats, {
  requireAuth: true,
  operationName: '获取Webhook统计'
});