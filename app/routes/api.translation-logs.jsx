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
    const countParam = parseInt(url.searchParams.get('count') || '20', 10);
    const limit = Math.max(Math.min(Number.isNaN(countParam) ? 20 : countParam, 200), 1);
    const level = url.searchParams.get('level') || undefined;
    const shopId = url.searchParams.get('shopId') || undefined;
    const resourceId = url.searchParams.get('resourceId') || undefined;
    const resourceType = url.searchParams.get('resourceType') || undefined;
    const language = url.searchParams.get('language') || undefined;
    const startTime = url.searchParams.get('startTime') || undefined;
    const endTime = url.searchParams.get('endTime') || undefined;
    
    const stats = getTranslationStats();
    const logs = await getTranslationLogs({
      limit,
      level,
      shopId,
      resourceId,
      resourceType,
      language,
      startTime,
      endTime
    });
    
    return successResponse({
      stats,
      logs,
      timestamp: new Date().toISOString()
    }, "翻译日志获取成功");
    
  }, "获取翻译日志", request.headers.get("shopify-shop-domain") || "");
};