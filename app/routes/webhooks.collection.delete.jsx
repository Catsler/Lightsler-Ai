import { authenticate } from "../shopify.server";
import { processWebhookEvent } from "../services/webhook-manager.server";
import { logger } from "../utils/logger.server";

/**
 * 处理集合删除webhook
 */
export const action = async ({ request }) => {
  try {
    const { shop, session, topic, payload } = await authenticate.webhook(request);

    logger.info(`收到集合删除webhook`, {
      shop,
      collectionId: payload.id
    });

    // 处理webhook事件
    const result = await processWebhookEvent(shop, topic, payload);

    logger.info(`集合删除webhook处理完成`, {
      shop,
      collectionId: payload.id,
      result
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error('处理集合删除webhook失败', {
      error: error.message,
      stack: error.stack
    });

    return new Response(null, { status: 200 });
  }
};