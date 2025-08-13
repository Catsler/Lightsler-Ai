import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, saveResources } from "../services/database.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";

export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    // 将服务端导入移到action函数内部，避免Vite构建错误
    const { fetchAllProducts } = await import("../services/shopify-graphql.server.js");
    
    const { admin, session } = await authenticate.admin(request);
    
    // 获取或创建店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 获取所有产品
    const products = await fetchAllProducts(admin);
    
    // 保存到数据库
    const savedResources = await saveResources(shop.id, products);
    
    return successResponse({
      count: products.length,
      resources: savedResources
    }, `成功扫描 ${products.length} 个产品`);
    
  }, "扫描产品", request.headers.get("shopify-shop-domain") || "");
};