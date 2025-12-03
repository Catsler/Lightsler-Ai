import { authenticate } from "../shopify.server";
import { billingLogger as logger } from "../utils/logger.server";
import { subscriptionManager } from "../services/subscription-manager.server.js";

export const action = async ({ request }) => {
  try {
    const { shop, topic, admin } = await authenticate.webhook(request);

    logger.info('[Billing] 收到订阅更新 webhook', {
      shop,
      topic
    });

    await subscriptionManager.syncSubscriptionFromShopify({
      admin,
      shopId: shop
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error('[Billing] 处理订阅更新 webhook 失败', {
      error: error.message
    });
    return new Response(null, { status: 500 });
  }
};
