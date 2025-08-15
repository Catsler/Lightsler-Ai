import { authenticate } from "../shopify.server";
import { processWebhookEvent } from "../services/webhook-manager.server";
import { logger } from "../utils/logger.server";

/**
 * 处理主题发布webhook
 * 当主题被发布（成为活跃主题）时触发
 */
export const action = async ({ request }) => {
  try {
    const { shop, session, topic, payload } = await authenticate.webhook(request);
    
    logger.info(`收到主题发布webhook`, {
      shop,
      themeId: payload.id,
      themeName: payload.name,
      role: payload.role
    });
    
    // 处理webhook事件
    const result = await processWebhookEvent(shop, topic, payload);
    
    logger.info(`主题发布webhook处理完成`, {
      shop,
      themeId: payload.id,
      result
    });
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error('处理主题发布webhook失败', {
      error: error.message,
      stack: error.stack
    });
    
    return new Response(null, { status: 200 });
  }
};