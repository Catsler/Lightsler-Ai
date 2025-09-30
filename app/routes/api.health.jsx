import { getOrCreateShop, getHealthSnapshot } from "../services/database.server.js";
import { getTranslationServiceStatus } from "../services/translation.server.js";
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 健康检查处理函数
 */
async function handleHealthCheck({ session }) {
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const [snapshot, translationService] = await Promise.all([
    getHealthSnapshot(shop.id),
    getTranslationServiceStatus()
  ]);

  return {
    shop: {
      id: shop.id,
      domain: shop.domain
    },
    snapshot,
    translationService,
    timestamp: new Date().toISOString()
  };
}

export const loader = createApiRoute(handleHealthCheck, {
  requireAuth: true,
  operationName: '健康检查'
});
