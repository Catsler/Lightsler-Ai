import { authenticate } from "../shopify.server";
import { processWebhookEvent } from "../services/webhook-manager.server";
import { logger } from "../utils/logger.server";

/**
 * 处理产品更新webhook
 */
export const action = async ({ request }) => {
  try {
    const { shop, session, topic, payload } = await authenticate.webhook(request);
    
    logger.info(`收到产品更新webhook`, {
      shop,
      productId: payload.admin_graphql_api_id,
      productTitle: payload.title,
      updatedAt: payload.updated_at
    });
    
    // 处理webhook事件
    const result = await processWebhookEvent(shop, topic, payload);
    
    logger.info(`产品更新webhook处理完成`, {
      shop,
      productId: payload.admin_graphql_api_id,
      result
    });
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error('处理产品更新webhook失败', {
      error: error.message,
      stack: error.stack
    });
    
    // Webhook必须返回200，否则Shopify会重试
    return new Response(null, { status: 200 });
  }
};