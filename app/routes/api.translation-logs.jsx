import { authenticate } from "../shopify.server.js";
import { getTranslationStats, getTranslationLogs } from "../services/translation.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";

/**
 * 翻译日志和统计API
 */
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    await authenticate.admin(request);
    
    const url = new URL(request.url);
    const count = parseInt(url.searchParams.get('count') || '20');
    
    // 获取翻译统计信息
    const stats = getTranslationStats();
    
    // 获取详细日志
    const logs = getTranslationLogs(Math.min(count, 100)); // 最多100条
    
    return successResponse({
      stats,
      logs,
      timestamp: new Date().toISOString()
    }, "翻译日志获取成功");
    
  }, "获取翻译日志", request.headers.get("shopify-shop-domain") || "");
};