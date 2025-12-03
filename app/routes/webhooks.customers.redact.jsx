import { authenticate } from "../shopify.server";
import { handleCustomerRedact } from "../services/gdpr-compliance.server.js";
import { logger } from "../utils/logger.server.js";

export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    await handleCustomerRedact({ shop, payload });

    logger.info(`[GDPR] 已处理 ${topic} webhook`, { shop });
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      logger.warn("[GDPR] customers/redact 验证失败", {
        status: error.status,
        statusText: error.statusText,
      });
      return error;
    }

    logger.error("[GDPR] 处理 customers/redact webhook 失败", {
      error: error.message,
      stack: error.stack,
    });
    return new Response(null, { status: 200 });
  }
};
