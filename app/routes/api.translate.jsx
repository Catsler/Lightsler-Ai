import { translateResource, getTranslationStats } from "../services/translation.server.js";
import { translateThemeResource } from "../services/theme-translation.server.js";
import { getRecentLogSummaries } from "../utils/logger.server.js";
import { clearTranslationCache } from "../services/memory-cache.server.js";
import { getOrCreateShop, saveTranslation, updateResourceStatus, getAllResources } from "../services/database.server.js";
import { createApiRoute } from "../utils/base-route.server.js";
import { getLocalizedErrorMessage } from "../utils/error-messages.server.js";

/**
 * POST请求处理函数 - 核心翻译API
 */
async function handleTranslate({ request, admin, session }) {
  const formData = await request.formData();
    
    // 参数验证
    const params = {
      language: formData.get("language") || "zh-CN",
      resourceIds: formData.get("resourceIds") || "[]",
      clearCache: formData.get("clearCache") === "true",
      forceRelatedTranslation: formData.get("forceRelatedTranslation") === "true",
      userRequested: formData.get("userRequested") === "true"
    };
    
    if (!params.language) {
      throw new Error('缺少必要参数: language');
    }
    
    const targetLanguage = params.language;
    const clearCache = params.clearCache;
    let resourceIds;
    try {
      resourceIds = JSON.parse(params.resourceIds);
    } catch (error) {
      throw new Error('resourceIds 必须是有效的JSON格式');
    }
    
    // 获取店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 获取所有资源
    const allResources = await getAllResources(shop.id);
    
    // 筛选要翻译的资源 - 必须明确指定资源ID
    if (resourceIds.length === 0) {
      throw new Error('请选择要翻译的资源，不能为空');
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
      return {
        message: "没有找到需要翻译的资源",
        results: [],
        stats: { total: 0, success: 0, failure: 0 }
      };
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

    // 长文本资源优先级排序和分批处理
    const isLikelyLongText = (resource) => {
      const textFields = [
        resource.description,
        resource.descriptionHtml,
        resource.body,
        resource.bodyHtml,
        resource.content
      ].filter(Boolean);

      return textFields.some(text => text && text.length > 1500);
    };

    // 按优先级排序：长文本资源优先
    const sortedResources = [...resourcesToTranslate].sort((a, b) => {
      const aIsLong = isLikelyLongText(a);
      const bIsLong = isLikelyLongText(b);

      if (aIsLong && !bIsLong) return -1;
      if (!aIsLong && bIsLong) return 1;
      return 0;
    });

    // 分批处理配置
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < sortedResources.length; i += BATCH_SIZE) {
      batches.push(sortedResources.slice(i, i + BATCH_SIZE));
    }

    console.log('分批翻译处理:', {
      totalResources: sortedResources.length,
      batchCount: batches.length,
      batchSize: BATCH_SIZE,
      longTextCount: sortedResources.filter(isLikelyLongText).length
    });

    // 按批次处理
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchStartTime = Date.now();

      console.log(`开始处理批次 ${batchIndex + 1}/${batches.length}, 包含 ${batch.length} 个资源`);

      for (const resource of batch) {
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
        
        const resourceTypeUpper = (resource.resourceType || '').toUpperCase();

        const resourceInput = resourceTypeUpper === 'PRODUCT'
          ? {
              ...resource,
              userRequested: params.userRequested || clearCache,
              forceRelatedTranslation: params.forceRelatedTranslation || clearCache,
              admin  // 传递admin用于GraphQL回退
            }
          : resource;

        if (themeResourceTypes.includes(resourceTypeUpper)) {
          console.log(`使用Theme资源翻译函数处理: ${resource.resourceType}`);
          const themeTranslations = await translateThemeResource(resourceInput, targetLanguage);
          translations = { skipped: false, translations: themeTranslations };
        } else if (resourceTypeUpper === 'PRODUCT') {
          const { translateProductWithRelated } = await import('../services/product-translation-enhanced.server.js');

          const shouldAwaitRelated = params.forceRelatedTranslation || params.userRequested || clearCache;

          if (shouldAwaitRelated) {
            translations = await translateProductWithRelated(resourceInput, targetLanguage, admin);
          } else {
            translations = await translateResource(resourceInput, targetLanguage, { admin });

            setImmediate(async () => {
              try {
                await translateProductWithRelated({ ...resourceInput, userRequested: false, forceRelatedTranslation: false }, targetLanguage, admin);
              } catch (relatedError) {
                console.warn('产品关联内容异步翻译失败:', relatedError);
              }
            });
          }
        } else {
          translations = await translateResource(resourceInput, targetLanguage, { admin });
        }
        
        if (translations.skipped) {
          await updateResourceStatus(resource.id, 'pending');
          console.log(`ℹ️ 跳过资源翻译（内容未变化）: ${resource.title}`);

          const skipReason = translations.reason || translations.skipReason || 'skipped';
          const skipCode = skipReason === 'skipped_by_hooks'
            ? 'TRANSLATION_SKIPPED_BY_HOOK'
            : 'TRANSLATION_SKIPPED';
          const localizedMessage = getLocalizedErrorMessage(skipCode, targetLanguage);

          results.push({
            resourceId: resource.id,
            resourceType: resource.resourceType,
            title: resource.title,
            success: true,
            skipped: true,
            skipReason,
            errorCode: skipCode,
            localizedMessage
          });
          continue;
        }

        // 防御性检查：确保传递正确的数据结构给 saveTranslation
        // translateResource 可能返回 { translations: {...} } 或直接返回翻译数据
        const translationData = translations.translations || translations;
        await saveTranslation(resource.id, shop.id, targetLanguage, translationData);

        console.log(`✅ 翻译完成，状态设为pending等待发布: ${resource.title} -> ${targetLanguage}`);

        await updateResourceStatus(resource.id, 'completed');
        
        const baseResult = {
          resourceId: resource.id,
          resourceType: resource.resourceType,
          title: resource.title,
          success: true,
          translations: translations.translations
        };

        if (resourceTypeUpper === 'PRODUCT' && translations.relatedSummary) {
          const relatedSummary = translations.relatedSummary;
          if (relatedSummary && relatedSummary.status && relatedSummary.status !== 'completed') {
            relatedSummary.localizedMessage = getLocalizedErrorMessage(
              relatedSummary.status === 'partial_failure'
                ? 'RELATED_TRANSLATION_PARTIAL'
                : 'RELATED_TRANSLATION_FAILED',
              targetLanguage
            );
          }
          results.push({
            ...baseResult,
            relatedTranslation: relatedSummary
          });
        } else {
          results.push(baseResult);
        }
        
      } catch (error) {
        console.error(`翻译资源 ${resource.id} 失败:`, error);

        // 更新资源状态为待处理
        await updateResourceStatus(resource.id, 'pending');

        const errorCode = error.code || error.errorCode || 'TRANSLATION_FAILED';
        const localizedMessage = getLocalizedErrorMessage(errorCode, targetLanguage, error.message);

        results.push({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          title: resource.title,
          success: false,
          error: error.message,
          errorCode,
          localizedMessage
        });
      }
      }

      // 批次处理完成日志
      const batchDuration = Date.now() - batchStartTime;
      const batchResults = results.slice(-batch.length); // 获取当前批次的结果
      const batchSuccess = batchResults.filter(r => r.success && !r.skipped).length;
      const batchFailure = batchResults.filter(r => !r.success).length;

      console.log(`批次 ${batchIndex + 1}/${batches.length} 处理完成:`, {
        duration: `${batchDuration}ms`,
        success: batchSuccess,
        failure: batchFailure,
        resources: batch.map(r => ({ id: r.id, title: r.title?.slice(0, 30) }))
      });

      // 如果批次耗时超过25秒，发出警告
      if (batchDuration > 25000) {
        console.warn(`⚠️ 批次 ${batchIndex + 1} 耗时过长 (${batchDuration}ms)，建议调整批次大小`);
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

    return {
      message: `翻译完成: ${successCount} 成功, ${failureCount} 失败, ${skippedCount} 跳过`,
      ...responseData
    };
}

export const action = createApiRoute(handleTranslate, {
  requireAuth: true,
  operationName: '批量翻译',
  timeout: 60000 // 增加到60秒，支持分批处理
});
