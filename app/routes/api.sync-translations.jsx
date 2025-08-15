/**
 * API端点：同步翻译到Shopify
 * 从数据库读取缓存的翻译并批量提交到Shopify
 */

import { json } from "@remix-run/node";
import { 
  syncTranslationsToShopify, 
  getSyncStatusStats,
  retryFailedSync,
  clearSyncErrors 
} from "../services/sync-to-shopify.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

/**
 * GET请求：获取同步状态
 */
export async function loader({ request }) {
  return withErrorHandling(async () => {
    const { authenticate } = await import("../shopify.server.js");
    const { admin, session } = await authenticate.admin(request);
    
    const shopId = session.shop;
    const stats = await getSyncStatusStats(shopId);
    
    return json({
      success: true,
      stats,
      message: `待同步: ${stats.pending}, 已同步: ${stats.synced}, 失败: ${stats.failed}`
    });
  });
}

/**
 * POST请求：执行同步操作
 */
export async function action({ request }) {
  return withErrorHandling(async () => {
    const { authenticate } = await import("../shopify.server.js");
    const { admin, session } = await authenticate.admin(request);
    
    const formData = await request.formData();
    const action = formData.get("action");
    const shopId = session.shop;
    
    switch (action) {
      case "sync": {
        // 执行同步
        const options = {};
        
        // 获取筛选条件
        const resourceType = formData.get("resourceType");
        const language = formData.get("language");
        const limit = formData.get("limit");
        
        if (resourceType) options.resourceType = resourceType;
        if (language) options.language = language;
        if (limit) options.limit = parseInt(limit);
        
        console.log('开始同步翻译到Shopify:', options);
        const result = await syncTranslationsToShopify(admin, shopId, options);
        
        return json({
          success: true,
          message: `同步完成：成功 ${result.successCount}，失败 ${result.failedCount}`,
          result
        });
      }
      
      case "syncByCategory": {
        // 按分类同步
        const categoryKey = formData.get("categoryKey");
        const subcategoryKey = formData.get("subcategoryKey");
        const language = formData.get("language");
        const resourceIds = formData.get("resourceIds");
        
        if (!categoryKey) {
          return json(
            { success: false, error: "分类键值不能为空" },
            { status: 400 }
          );
        }
        
        const options = {
          categoryKey,
          language: language || 'zh-CN'
        };
        
        if (subcategoryKey) options.subcategoryKey = subcategoryKey;
        if (resourceIds) {
          try {
            options.resourceIds = JSON.parse(resourceIds);
          } catch (e) {
            console.error('解析resourceIds失败:', e);
          }
        }
        
        console.log('开始按分类同步翻译到Shopify:', options);
        const { syncCategoryResources } = await import("../services/sync-to-shopify.server.js");
        const result = await syncCategoryResources(admin, shopId, options);
        
        return json({
          success: true,
          message: `分类同步完成：成功 ${result.successCount}，失败 ${result.failedCount}`,
          result
        });
      }
      
      case "retry": {
        // 重试失败的同步
        console.log('重试失败的同步');
        const result = await retryFailedSync(admin, shopId);
        
        return json({
          success: true,
          message: `重试完成：成功 ${result.successCount}，失败 ${result.failedCount}`,
          result
        });
      }
      
      case "clearErrors": {
        // 清理同步错误
        console.log('清理同步错误');
        const count = await clearSyncErrors(shopId);
        
        return json({
          success: true,
          message: `已清理 ${count} 条错误记录`
        });
      }
      
      case "status": {
        // 获取状态（与GET相同）
        const stats = await getSyncStatusStats(shopId);
        
        return json({
          success: true,
          stats,
          message: `待同步: ${stats.pending}, 已同步: ${stats.synced}, 失败: ${stats.failed}`
        });
      }
      
      default:
        return json(
          { 
            success: false, 
            error: `未知操作: ${action}` 
          },
          { status: 400 }
        );
    }
  });
}