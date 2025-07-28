import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, clearShopData } from "../services/database.server.js";
import { cleanQueue } from "../services/queue.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";

/**
 * 清理数据API
 */
export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const clearType = formData.get("type") || "all"; // all, resources, queue, completed
    
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    let result = {};
    
    switch (clearType) {
      case "all":
        // 清理所有数据
        await clearShopData(shop.id);
        const queueCleanAll = await cleanQueue("all");
        result = {
          database: "已清理所有资源和翻译数据",
          queue: queueCleanAll
        };
        break;
        
      case "resources":
        // 只清理数据库中的资源数据
        await clearShopData(shop.id);
        result = {
          database: "已清理所有资源和翻译数据"
        };
        break;
        
      case "queue":
        // 只清理队列
        const queueCleanResult = await cleanQueue("all");
        result = {
          queue: queueCleanResult
        };
        break;
        
      case "completed":
        // 只清理已完成的任务
        const completedCleanResult = await cleanQueue("completed");
        result = {
          queue: completedCleanResult
        };
        break;
        
      default:
        throw new Error("不支持的清理类型");
    }
    
    return successResponse(result, `${clearType}数据清理完成`);
    
  }, "清理数据", request.headers.get("shopify-shop-domain") || "");
};