import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, getAllResources, getTranslationStats, getResourceStats } from "../services/database.server.js";
import { getJobStatus, getQueueStats } from "../services/queue.server.js";
import { getTranslationServiceStatus, getTranslationStats as getTranslationServiceStats } from "../services/translation.server.js";
import { successResponse, withErrorHandling as withApiError } from "../utils/api-response.server.js";
import { getResourceCategory } from "../config/resource-categories.js";

/**
 * 状态查询API - 支持GET和POST请求
 */

// GET请求：获取总体状态
export const loader = async ({ request }) => {
  return withApiError(async () => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const targetLanguage = url.searchParams.get('language');
    const filterMode = url.searchParams.get('filterMode') || 'all';  // 新增参数
    
    // 获取店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 获取数据库统计（支持语言过滤）
    const dbStats = await getTranslationStats(shop.id, targetLanguage);
    
    // 获取增强的资源统计
    const resourceStats = await getResourceStats(shop.id, targetLanguage);
    
    // 获取队列统计
    const queueStats = await getQueueStats();
    
    // 获取翻译服务状态和统计
    const translationServiceStatus = await getTranslationServiceStatus();
    const translationServiceStats = getTranslationServiceStats();
    
    // 获取资源列表（支持语言和过滤模式）
    const resources = await getAllResources(shop.id, targetLanguage, filterMode);
    
    return successResponse({
      shop: {
        id: shop.id,
        domain: shop.domain
      },
      stats: {
        database: resourceStats,  // 使用新的增强统计
        queue: queueStats,
        legacy: dbStats  // 保留旧的统计以向后兼容
      },
      filterMode,  // 返回当前过滤模式
      translationService: {
        ...translationServiceStatus,
        stats: translationServiceStats
      },
      resources: resources.map(r => {
        const categoryInfo = getResourceCategory(r.resourceType);
        const hasLang = targetLanguage
          ? (r.translations && r.translations.length > 0)
          : (r.translations?.length > 0);
        const langTranslation = targetLanguage
          ? r.translations?.find(t => t.language === targetLanguage)
          : undefined;

        // 获取总翻译数（当有语言过滤时，使用 _count；否则使用 translations 数组长度）
        const totalTranslationCount = targetLanguage
          ? (r._count?.translations || 0)
          : (r.translations?.length || 0);

        // 判断是否有其他语言的翻译
        const currentLangCount = langTranslation ? 1 : 0;
        const hasOtherLanguageTranslations = totalTranslationCount > currentLangCount;

        return {
          id: r.id,
          resourceType: r.resourceType,
          resourceId: r.resourceId,
          gid: r.gid,
          title: r.title,
          handle: r.handle,
          name: r.name,
          status: r.status,
          translationCount: r.translations?.length || 0,  // 当前查询返回的翻译数
          totalTranslationCount,  // 所有语言的翻译总数
          hasTranslationForLanguage: !!hasLang,
          hasOtherLanguageTranslations,  // 是否有其他语言的翻译
          translationStatus: langTranslation?.status || null,
          translationSyncStatus: langTranslation?.syncStatus || null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          category: categoryInfo ? {
            categoryKey: categoryInfo.categoryKey,
            categoryName: categoryInfo.categoryName,
            categoryIcon: categoryInfo.categoryIcon,
            subcategoryKey: categoryInfo.subcategoryKey,
            subcategoryName: categoryInfo.subcategoryName
          } : null
        };
      })
    }, "状态查询成功");
    
  }, "获取状态", request.headers.get("shopify-shop-domain") || "", { silent: true });
};;

// POST请求：查询特定任务状态
export const action = async ({ request }) => {
  return withApiError(async () => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const jobId = formData.get("jobId");
    const resourceId = formData.get("resourceId");
    const queryType = formData.get("type") || "job"; // job, resource, queue
    
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    let result = {};
    
    switch (queryType) {
      case "job":
        if (!jobId) {
          throw new Error("查询任务状态需要提供jobId");
        }
        result.job = await getJobStatus(jobId);
        break;
        
      case "resource":
        if (!resourceId) {
          throw new Error("查询资源状态需要提供resourceId");
        }
        
        const resource = await getAllResources(shop.id);
        const targetResource = resource.find(r => r.id === resourceId);
        
        if (!targetResource) {
          throw new Error("资源不存在");
        }
        
        result.resource = {
          id: targetResource.id,
          resourceType: targetResource.resourceType,
          title: targetResource.title,
          status: targetResource.status,
          translations: targetResource.translations,
          updatedAt: targetResource.updatedAt
        };
        break;
        
      case "queue":
        result.queue = await getQueueStats();
        break;
        
      default:
        throw new Error("不支持的查询类型");
    }
    
    return successResponse(result, `${queryType}状态查询成功`);
    
  }, "查询任务状态", request.headers.get("shopify-shop-domain") || "");
};
