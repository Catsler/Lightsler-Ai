import { authenticate } from "../shopify.server";
import { processWebhookEvent } from "../services/webhook-manager.server";
import { logger } from "../utils/logger.server";

/**
 * 处理主题更新 webhook
 * 最小实现：鉴权、记录、交给通用处理器
 */
export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);

    logger.info("收到主题更新 webhook", {
      shop,
      themeId: payload.id,
      name: payload.name,
      role: payload.role,
    });

    await processWebhookEvent(shop, topic, payload);
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("处理主题更新 webhook 失败", {
      error: error.message,
      stack: error.stack,
    });
    return new Response(null, { status: 200 });
  }
};
