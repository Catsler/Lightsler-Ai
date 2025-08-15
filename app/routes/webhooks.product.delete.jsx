import { authenticate } from "../shopify.server";
import { processWebhookEvent } from "../services/webhook-manager.server";
import { logger } from "../utils/logger.server";

/**
 * 处理产品删除webhook
 */
export const action = async ({ request }) => {
  try {
    const { shop, session, topic, payload } = await authenticate.webhook(request);
    
    logger.info(`收到产品删除webhook`, {
      shop,
      productId: payload.id
    });
    
    // 处理webhook事件
    const result = await processWebhookEvent(shop, topic, payload);
    
    logger.info(`产品删除webhook处理完成`, {
      shop,
      productId: payload.id,
      result
    });
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error('处理产品删除webhook失败', {
      error: error.message,
      stack: error.stack
    });
    
    return new Response(null, { status: 200 });
  }
};