import { authenticate } from "../shopify.server";
import {
  GDPR_REQUEST_TYPES,
  softDeleteShopData,
} from "../services/gdpr-compliance.server.js";
import { logger } from "../utils/logger.server.js";

export const action = async ({ request }) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    const retentionDays = Number(process.env.UNINSTALL_PURGE_DAYS || 2); // 默认48小时硬删

    const result = await softDeleteShopData({
      shopId: shop,
      requestType: GDPR_REQUEST_TYPES.SHOP_REDACT,
      customerId: null,
      payload,
      retentionDays,
    });

    logger.info(`处理 ${topic} webhook 完成，已安排硬删除`, {
      shop,
      deletionToken: result.deletionToken,
      scheduledPurgeAt: result.scheduledPurgeAt,
      retentionDays,
    });
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("处理 app/uninstalled webhook 失败", {
      error: error.message,
      stack: error.stack,
    });
    return new Response(null, { status: 200 });
  }
};
