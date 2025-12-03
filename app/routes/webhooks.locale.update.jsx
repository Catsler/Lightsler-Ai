import { authenticate } from "../shopify.server";
import { processWebhookEvent } from "../services/webhook-manager.server";
import { logger } from "../utils/logger.server";

/**
 * 处理语言更新 webhook
 * 最小实现：鉴权、记录、交给通用处理器
 */
export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);

    logger.info("收到语言更新 webhook", {
      shop,
      locale: payload.locale,
      published: payload.published,
      enabled: payload.enabled,
    });

    await processWebhookEvent(shop, topic, payload);
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("处理语言更新 webhook 失败", {
      error: error.message,
      stack: error.stack,
    });
    return new Response(null, { status: 200 });
  }
};
