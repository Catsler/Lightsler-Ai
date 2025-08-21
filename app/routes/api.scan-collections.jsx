import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, saveResources } from "../services/database.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";

export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    // 将服务端导入移到action函数内部，避免Vite构建错误
    const { fetchResourcesByType, RESOURCE_TYPES } = await import("../services/shopify-graphql.server.js");
    
    const { admin, session } = await authenticate.admin(request);
    
    // 获取或创建店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 使用通用的资源获取函数来获取集合
    const collections = await fetchResourcesByType(admin, RESOURCE_TYPES.COLLECTION);
    
    // 保存到数据库
    const savedResources = await saveResources(shop.id, collections);
    
    return successResponse({
      count: collections.length,
      resources: savedResources
    }, `成功扫描 ${collections.length} 个集合`);
    
  }, "扫描集合", request.headers.get("shopify-shop-domain") || "");
};;;