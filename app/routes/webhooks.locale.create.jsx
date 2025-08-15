import { authenticate } from "../shopify.server";
import { processWebhookEvent } from "../services/webhook-manager.server";
import { logger } from "../utils/logger.server";

/**
 * 处理语言创建webhook
 * 当店铺添加新语言时触发
 */
export const action = async ({ request }) => {
  try {
    const { shop, session, topic, payload } = await authenticate.webhook(request);
    
    logger.info(`收到语言创建webhook`, {
      shop,
      locale: payload.locale,
      enabled: payload.enabled,
      published: payload.published
    });
    
    // 处理webhook事件
    const result = await processWebhookEvent(shop, topic, payload);
    
    // 新语言添加是重要事件，可能需要特殊处理
    if (payload.enabled && payload.published) {
      logger.info(`店铺${shop}添加了新语言${payload.locale}，可能需要触发全站翻译`);
    }
    
    logger.info(`语言创建webhook处理完成`, {
      shop,
      locale: payload.locale,
      result
    });
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error('处理语言创建webhook失败', {
      error: error.message,
      stack: error.stack
    });
    
    return new Response(null, { status: 200 });
  }
};