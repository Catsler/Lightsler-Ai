import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, getHealthSnapshot } from "../services/database.server.js";
import { getTranslationServiceStatus } from "../services/translation.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";

export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { session } = await authenticate.admin(request);
    const shop = await getOrCreateShop(session.shop, session.accessToken);

    const [snapshot, translationService] = await Promise.all([
      getHealthSnapshot(shop.id),
      getTranslationServiceStatus()
    ]);

    return successResponse(
      {
        shop: {
          id: shop.id,
          domain: shop.domain
        },
        snapshot,
        translationService,
        timestamp: new Date().toISOString()
      },
      "健康检查成功"
    );
  }, "健康检查", request.headers.get("shopify-shop-domain") || "");
};
