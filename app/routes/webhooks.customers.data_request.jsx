import { authenticate } from "../shopify.server";
import { handleCustomerDataRequest } from "../services/gdpr-compliance.server.js";
import { logger } from "../utils/logger.server.js";

export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    await handleCustomerDataRequest({ shop, payload });

    logger.info(`[GDPR] 已处理 ${topic} webhook`, { shop });
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      // HMAC 验证失败等认证错误需要向 Shopify 返回 401
      logger.warn("[GDPR] customers/data_request 验证失败", {
        status: error.status,
        statusText: error.statusText,
      });
      return error;
    }

    logger.error("[GDPR] 处理 customers/data_request webhook 失败", {
      error: error.message,
      stack: error.stack,
    });
    // 业务错误返回 200，避免 Shopify 重试风暴
    return new Response(null, { status: 200 });
  }
};
