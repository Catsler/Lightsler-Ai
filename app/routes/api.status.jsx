import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, getAllResources, getTranslationStats } from "../services/database.server.js";
import { getJobStatus, getQueueStats } from "../services/queue.server.js";
import { getTranslationServiceStatus, getTranslationStats as getTranslationServiceStats } from "../services/translation.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";
import { getResourceCategory } from "../config/resource-categories.js";

/**
 * 状态查询API - 支持GET和POST请求
 */

// GET请求：获取总体状态
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { session } = await authenticate.admin(request);
    
    // 获取URL参数
    const url = new URL(request.url);
    const resourceTypeFilter = url.searchParams.get('resourceType');
    
    // 获取店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 获取数据库统计
    const dbStats = await getTranslationStats(shop.id);
    
    // 获取队列统计
    const queueStats = await getQueueStats();
    
    // 获取翻译服务状态和统计
    const translationServiceStatus = await getTranslationServiceStatus();
    const translationServiceStats = getTranslationServiceStats();
    
    // 获取资源列表（根据类型过滤）
    const resources = await getAllResources(shop.id, resourceTypeFilter);
    
    // 按资源类型分组资源
    const resourcesByType = {};
    const processedResources = resources.map(r => {
      const categoryInfo = getResourceCategory(r.resourceType);
      
      // 将资源添加到对应类型的数组中
      if (!resourcesByType[r.resourceType]) {
        resourcesByType[r.resourceType] = [];
      }
      
      const resourceData = {
        id: r.id,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        title: r.title,
        handle: r.handle,
        name: r.name,
        status: r.status,
        translationCount: r.translations?.length || 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        // 添加产品特定字段
        vendor: r.vendor,
        productType: r.productType,
        tags: r.tags,
        category: categoryInfo ? {
          categoryKey: categoryInfo.categoryKey,
          categoryName: categoryInfo.categoryName,
          categoryIcon: categoryInfo.categoryIcon,
          subcategoryKey: categoryInfo.subcategoryKey,
          subcategoryName: categoryInfo.subcategoryName
        } : null
      };
      
      resourcesByType[r.resourceType].push(resourceData);
      return resourceData;
    });
    
    return successResponse({
      shop: {
        id: shop.id,
        domain: shop.domain
      },
      stats: {
        database: dbStats,
        queue: queueStats
      },
      translationService: {
        ...translationServiceStatus,
        stats: translationServiceStats
      },
      resources: processedResources, // 保持向后兼容
      resourcesByType: resourcesByType, // 新增：按类型分组的资源
      resourceTypeCounts: Object.keys(resourcesByType).reduce((acc, type) => {
        acc[type] = resourcesByType[type].length;
        return acc;
      }, {})
    }, "状态查询成功");
    
  }, "获取状态", request.headers.get("shopify-shop-domain") || "", { silent: true });
};;;

// POST请求：查询特定任务状态
export const action = async ({ request }) => {
  return withErrorHandling(async () => {
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