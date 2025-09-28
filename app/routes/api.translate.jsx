import { authenticate } from "../shopify.server.js";
import { translateResource, getTranslationStats } from "../services/translation.server.js";
import { getRecentLogSummaries } from "../utils/logger.server.js";
import { translateThemeResource } from "../services/theme-translation.server.js";
import { clearTranslationCache } from "../services/memory-cache.server.js";
import { getOrCreateShop, saveTranslation, updateResourceStatus, getAllResources } from "../services/database.server.js";
import { successResponse, withErrorHandling as withApiError, validateRequiredParams, validationErrorResponse } from "../utils/api-response.server.js";

export const action = async ({ request }) => {
  return withApiError(async () => {
    // 将服务端导入移到action函数内部，避免Vite构建错误
    const { updateResourceTranslation } = await import("../services/shopify-graphql.server.js");
    
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    
    // 参数验证
    const params = {
      language: formData.get("language") || "zh-CN",
      resourceIds: formData.get("resourceIds") || "[]",
      clearCache: formData.get("clearCache") === "true",
      forceRelatedTranslation: formData.get("forceRelatedTranslation") === "true",
      userRequested: formData.get("userRequested") === "true"
    };
    
    const validationErrors = validateRequiredParams(params, ['language']);
    if (validationErrors.length > 0) {
      return validationErrorResponse(validationErrors);
    }
    
    const targetLanguage = params.language;
    const clearCache = params.clearCache;
    let resourceIds;
    try {
      resourceIds = JSON.parse(params.resourceIds);
    } catch (error) {
      return validationErrorResponse([{
        field: 'resourceIds',
        message: 'resourceIds 必须是有效的JSON格式'
      }]);
    }
    
    // 获取店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 获取所有资源
    const allResources = await getAllResources(shop.id);
    
    // 筛选要翻译的资源 - 必须明确指定资源ID
    if (resourceIds.length === 0) {
      return validationErrorResponse([{
        field: 'resourceIds',
        message: '请选择要翻译的资源，不能为空'
      }]);
    }
    
    const resourcesToTranslate = allResources.filter(r => resourceIds.includes(r.id));

    const OPTION_RESOURCE_TYPES = new Set(['PRODUCT_OPTION', 'product_option', 'PRODUCT_OPTION_VALUE', 'product_option_value']);
    const METAFIELD_RESOURCE_TYPES = new Set(['PRODUCT_METAFIELD', 'product_metafield']);

    const collectRelatedResourceIds = (product) => {
      if (!product || product.resourceType !== 'PRODUCT') {
        return [];
      }

      const productId = product.id || '';
      const productResourceId = product.resourceId || '';
      const productGid = product.gid || '';

      return allResources
        .filter((candidate) => {
          const candidateType = candidate.resourceType || '';
          if (!OPTION_RESOURCE_TYPES.has(candidateType) && !METAFIELD_RESOURCE_TYPES.has(candidateType)) {
            return false;
          }

          const candidateResourceId = candidate.resourceId || '';
          const contentFields = candidate.contentFields || {};

          const matchesByResourceId =
            (productId && (candidateResourceId.startsWith(`${productId}-`) || candidateResourceId.endsWith(`-${productId}`))) ||
            (productResourceId && candidateResourceId.startsWith(`${productResourceId}-`));

          const matchesByContent =
            (contentFields.productId && contentFields.productId === productId) ||
            (contentFields.productGid && contentFields.productGid === productGid) ||
            (contentFields.parentProductId && contentFields.parentProductId === productId);

          return matchesByResourceId || matchesByContent;
        })
        .map((candidate) => candidate.id);
    };

    const clearedResourceIds = new Set();

    console.log('翻译请求详情:', {
      targetLanguage,
      selectedResourceIds: resourceIds,
      foundResources: resourcesToTranslate.map(r => ({ id: r.id, title: r.title, status: r.status })),
      clearCache
    });
    
    if (resourcesToTranslate.length === 0) {
      return successResponse({
        results: [],
        stats: { total: 0, success: 0, failure: 0 }
      }, "没有找到需要翻译的资源");
    }
    
    // 如果需要清除缓存，先删除现有的翻译记录
    if (clearCache) {
      console.log('清除缓存：删除现有翻译记录');
      const { deleteTranslations } = await import("../services/database.server.js");

      for (const resource of resourcesToTranslate) {
        const targetIds = [resource.id];

        if (resource.resourceType === 'PRODUCT') {
          const relatedIds = collectRelatedResourceIds(resource);
          targetIds.push(...relatedIds);
        }

        for (const targetId of targetIds) {
          if (!targetId || clearedResourceIds.has(targetId)) {
            continue;
          }

          try {
            await deleteTranslations(targetId, targetLanguage);
            clearedResourceIds.add(targetId);
            try {
              await clearTranslationCache(targetId);
            } catch (cacheError) {
              console.warn(`清除资源 ${targetId} 内存缓存失败:`, cacheError);
            }
            console.log(`已清除资源 ${targetId} 的 ${targetLanguage} 翻译缓存`);
          } catch (error) {
            console.error(`清除资源 ${targetId} 缓存失败:`, error);
          }
        }
      }
    }
    
    const results = [];
    
    for (const resource of resourcesToTranslate) {
      try {
        // 更新资源状态为处理中
        await updateResourceStatus(resource.id, 'processing');
        
        // 翻译资源内容（根据资源类型选择合适的翻译函数）
        let translations;
        
        // Theme相关资源和其他新资源类型使用专门的翻译函数
        const themeResourceTypes = [
          'ONLINE_STORE_THEME',
          'ONLINE_STORE_THEME_APP_EMBED',
          'ONLINE_STORE_THEME_JSON_TEMPLATE',
          'ONLINE_STORE_THEME_LOCALE_CONTENT',
          'ONLINE_STORE_THEME_SECTION_GROUP',
          'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
          'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS',
          'PRODUCT_OPTION',
          'PRODUCT_OPTION_VALUE',
          'SELLING_PLAN',
          'SELLING_PLAN_GROUP',
          'SHOP',
          'SHOP_POLICY'
        ];
        
        const resourceInput = resource.resourceType === 'PRODUCT'
          ? {
              ...resource,
              userRequested: params.userRequested || clearCache,
              forceRelatedTranslation: params.forceRelatedTranslation || clearCache,
              admin  // 传递admin用于GraphQL回退
            }
          : resource;

        if (themeResourceTypes.includes(resource.resourceType)) {
          console.log(`使用Theme资源翻译函数处理: ${resource.resourceType}`);
          const themeTranslations = await translateThemeResource(resourceInput, targetLanguage);
          translations = { skipped: false, translations: themeTranslations };
        } else {
          // 使用标准翻译函数，传递admin参数以支持产品关联翻译
          translations = await translateResource(resourceInput, targetLanguage, { admin });
        }
        
        if (translations.skipped) {
          await updateResourceStatus(resource.id, 'pending');
          console.log(`ℹ️ 跳过资源翻译（内容未变化）: ${resource.title}`);
          results.push({
            resourceId: resource.id,
            resourceType: resource.resourceType,
            title: resource.title,
            success: true,
            skipped: true,
            skipReason: translations.skipReason
          });
          continue;
        }

        // 防御性检查：确保传递正确的数据结构给 saveTranslation
        // translateResource 可能返回 { translations: {...} } 或直接返回翻译数据
        const translationData = translations.translations || translations;
        await saveTranslation(resource.id, shop.id, targetLanguage, translationData);

        console.log(`✅ 翻译完成，状态设为pending等待发布: ${resource.title} -> ${targetLanguage}`);

        await updateResourceStatus(resource.id, 'completed');
        
        results.push({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          title: resource.title,
          success: true,
          translations: translations.translations
        });
        
      } catch (error) {
        console.error(`翻译资源 ${resource.id} 失败:`, error);
        
        // 更新资源状态为待处理
        await updateResourceStatus(resource.id, 'pending');
        
        results.push({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          title: resource.title,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success && !r.skipped).length;
    const failureCount = results.filter(r => !r.success).length;
    const skippedCount = results.filter(r => r.skipped).length;
    
    // 获取翻译统计和日志
    const translationStats = getTranslationStats();
    const recentLogs = getRecentLogSummaries({ limit: 10 });

    const responseData = {
      results,
      stats: {
        total: results.length,
        success: successCount,
        failure: failureCount,
        skipped: skippedCount
      },
      translationStats,
      recentLogs
    };

    return successResponse(
      responseData,
      `翻译完成: ${successCount} 成功, ${failureCount} 失败, ${skippedCount} 跳过`
    );
    
  }, "批量翻译", request.headers.get("shopify-shop-domain") || "");
};