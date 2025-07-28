import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, getAllResources, getTranslationStats } from "../services/database.server.js";
import { getJobStatus, getQueueStats } from "../services/queue.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";

/**
 * 状态查询API - 支持GET和POST请求
 */

// GET请求：获取总体状态
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { session } = await authenticate.admin(request);
    
    // 获取店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 获取数据库统计
    const dbStats = await getTranslationStats(shop.id);
    
    // 获取队列统计
    const queueStats = await getQueueStats();
    
    // 获取资源列表
    const resources = await getAllResources(shop.id);
    
    return successResponse({
      shop: {
        id: shop.id,
        domain: shop.domain
      },
      stats: {
        database: dbStats,
        queue: queueStats
      },
      resources: resources.map(r => ({
        id: r.id,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        title: r.title,
        status: r.status,
        translationCount: r.translations?.length || 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }))
    }, "状态查询成功");
    
  }, "获取状态", request.headers.get("shopify-shop-domain") || "");
};

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