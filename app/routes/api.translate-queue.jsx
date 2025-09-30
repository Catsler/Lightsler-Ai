import { getOrCreateShop, getAllResources } from "../services/database.server.js";
import { addBatchTranslationJob, addTranslationJob } from "../services/queue.server.js";
import { createApiRoute } from "../utils/base-route.server.js";
import { validateRequiredParams } from "../utils/api-response.server.js";

/**
 * 使用队列的异步翻译API
 */
async function handleTranslateQueue({ request, admin, session }) {
    const formData = await request.formData();
    
    // 参数验证
    const action = formData.get("action");
    const singleResourceId = formData.get("resourceId");
    const params = {
      language: formData.get("language") || "zh-CN",
      resourceIds: formData.get("resourceIds") || "[]",
      mode: formData.get("mode") || "batch" // batch 或 individual
    };
    
    const validationErrors = validateRequiredParams(params, ['language']);
    if (validationErrors.length > 0) {
      throw new Error(`参数验证失败: ${validationErrors.map(e => e.message).join(', ')}`);
    }
    
    const targetLanguage = params.language;
    let resourceIds;

    // 处理重新翻译按钮传递的单个资源ID
    if (action === "retranslate" && singleResourceId) {
      resourceIds = [singleResourceId];
      console.log('[重新翻译] 处理单个资源:', { action, singleResourceId, targetLanguage });
    } else {
      try {
        resourceIds = JSON.parse(params.resourceIds);
      } catch (error) {
        throw new Error('resourceIds 必须是有效的JSON格式');
      }
    }
    const mode = params.mode;
    
    const headerShopDomain = request.headers.get("shopify-shop-domain") || "";
    const shopDomain = session?.shop || headerShopDomain;

    if (!shopDomain) {
      throw new Error('缺少店铺上下文，无法创建翻译任务');
    }

    // 获取店铺记录
    const shop = await getOrCreateShop(shopDomain, session.accessToken);

    
    // 获取所有资源
    const allResources = await getAllResources(shop.id);
    
    // 筛选要翻译的资源
    const resourcesToTranslate = resourceIds.length > 0 
      ? allResources.filter(r => resourceIds.includes(r.id))
      : allResources.filter(r => r.status === 'pending');
    
    if (resourcesToTranslate.length === 0) {
      return {
        jobs: [],
        stats: { total: 0, queued: 0 },
        message: "没有找到需要翻译的资源"
      };
    }
    
    const resourceIdsToTranslate = resourcesToTranslate.map(r => r.id);
    
    let jobResult;
    
    if (mode === 'batch') {
      // 批量翻译模式
      jobResult = await addBatchTranslationJob(resourceIdsToTranslate, shop.id, targetLanguage, shopDomain);
      
      return {
        jobId: jobResult.jobId,
        mode: 'batch',
        resourceCount: jobResult.resourceCount,
        status: jobResult.status,
        message: `已创建批量翻译任务，包含 ${jobResult.resourceCount} 个资源`
      };
      
    } else {
      // 单独任务模式
      const jobs = [];
      
      for (const resourceId of resourceIdsToTranslate) {
        const jobInfo = await addTranslationJob(resourceId, shop.id, targetLanguage, shopDomain, {
          delay: jobs.length * 2000 // 每个任务间隔2秒
        });
        jobs.push(jobInfo);
      }
      
      return {
        jobs: jobs,
        mode: 'individual',
        stats: {
          total: jobs.length,
          queued: jobs.length
        },
        message: `已创建 ${jobs.length} 个翻译任务`
      };
    }
}

export const action = createApiRoute(handleTranslateQueue, {
  requireAuth: true,
  operationName: '队列翻译'
});