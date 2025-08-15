import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getWebhookEventStats } from "../services/webhook-cleanup.server";
import { withErrorHandling } from "../utils/error-handler.server";

/**
 * 获取webhook事件统计信息
 */
export const loader = withErrorHandling(async ({ request }) => {
  // 认证
  const { admin } = await authenticate.admin(request);
  
  try {
    // 获取统计信息
    const stats = await getWebhookEventStats();
    
    return json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});