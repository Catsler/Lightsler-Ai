import { translateResource, getTranslationStats } from "../services/translation.server.js";
import { getRecentLogSummaries } from "../utils/logger.server.js";
import { clearTranslationCache } from "../services/memory-cache.server.js";
import { getOrCreateShop, saveTranslation, updateResourceStatus, getAllResources } from "../services/database.server.js";
import { createApiRoute } from "../utils/base-route.server.js";
import { getLocalizedErrorMessage } from "../utils/error-messages.server.js";
import { getLinkConversionConfig } from "../services/market-urls.server.js";
import { getShopLocales } from "../services/shopify-locales.server.js";
import { prisma } from "../db.server.js";

/**
 * POST请求处理函数 - 核心翻译API
 */
async function handleTranslate({ request, admin, session }) {
  const formData = await request.formData();
    
    // Parameter validation
    const params = {
      language: formData.get("language") || "zh-CN",
      resourceIds: formData.get("resourceIds") || "[]",
      clearCache: formData.get("clearCache") === "true",
      forceRelatedTranslation: formData.get("forceRelatedTranslation") === "true",
      userRequested: formData.get("userRequested") === "true"
    };
    
    if (!params.language) {
      throw new Error('Missing required parameter: language');
    }
    
    const targetLanguage = params.language;

    // Defensive: reject primary language translation
    const shopLocales = await getShopLocales(admin);
    const primaryLocale = shopLocales.find((locale) => locale.primary);

    if (primaryLocale && targetLanguage.toLowerCase() === primaryLocale.locale.toLowerCase()) {
      console.log('[TRANSLATION] Blocked primary language request:', {
        targetLanguage,
        primaryLocale: primaryLocale.locale,
        endpoint: 'api.translate',
        shopDomain: session?.shop
      });

      throw new Error(
        `Translating to primary language is not allowed ${primaryLocale.name || primaryLocale.locale}。` +
        `Primary language content is the source; please choose another target language.`
      );
    }

    const clearCache = params.clearCache;
    let resourceIds;
    try {
      resourceIds = JSON.parse(params.resourceIds);
    } catch (error) {
      throw new Error('resourceIds must be valid JSON');
    }
    
    // Fetch shop record
    const shop = await getOrCreateShop(session.shop, session.accessToken);

    // 🔒 语言数限制：若套餐有限制且当前语言已达上限，拒绝新增语言翻译
    const shopSubscription = await prisma.shopSubscription.findUnique({
      where: { shopId: shop.id },
      include: { plan: true }
    });

    const planLimit = shopSubscription?.plan?.maxLanguages;
    if (planLimit !== null && planLimit !== undefined) {
      const activeLanguages = await prisma.language.findMany({
        where: { shopId: shop.id, enabled: true, isActive: true },
        select: { code: true }
      });

      const activeCount = activeLanguages.length;
      const isTargetActive = activeLanguages.some(
        (lang) => (lang.code || '').toLowerCase() === targetLanguage.toLowerCase()
      );

      if (!isTargetActive && typeof planLimit === 'number' && activeCount >= planLimit) {
        throw new Error(
          `Language limit exceeded: plan allows ${planLimit}, active ${activeCount}. ` +
          `Please disable a language or upgrade your plan before adding ${targetLanguage}.`
        );
      }
    }
    
    // Fetch all resources
    const allResources = await getAllResources(shop.id);
    
    // Filter resources to translate - IDs required
    if (resourceIds.length === 0) {
      throw new Error('Please select resources to translate; cannot be empty');
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
        message: "No resources found to translate",
        results: [],
        stats: { total: 0, success: 0, failure: 0 }
      };
    }

    // Auto-queue redirect for large batch to avoid timeout
    const QUEUE_THRESHOLD = 10; // 超过10个资源自动使用队列
    if (resourcesToTranslate.length > QUEUE_THRESHOLD) {
      console.log(`Resource count(${resourcesToTranslate.length})exceeds threshold(${QUEUE_THRESHOLD})，自动重定向到队列模式`);

      // 导入队列服务
      const { addBatchTranslationJob } = await import("../services/queue.server.js");

      const resourceIdsToTranslate = resourcesToTranslate.map(r => r.id);
      const jobResult = await addBatchTranslationJob(
        resourceIdsToTranslate,
        shop.id,
        targetLanguage,
        session.shop,
        {
          forceRelatedTranslation: params.forceRelatedTranslation || clearCache,
          userRequested: params.userRequested || clearCache
        }
      );

      // Log queue job creation
      console.log('[METRICS]', {
        type: 'batch_translation_queued',
        resource_count: jobResult.resourceCount,
        estimated_time_min: Math.ceil(jobResult.resourceCount / 20),
        timestamp: Date.now()
      });

      // Return queue job info (frontend shows toast)
      return {
        redirected: true,
        mode: 'queue',
        jobId: jobResult.jobId,
        resourceCount: jobResult.resourceCount,
        estimatedMinutes: Math.ceil(jobResult.resourceCount / 20), // 假设20个/分钟
        message: `Queued for translation, total ${jobResult.resourceCount} resources. Please refresh the Resources page to view progress. ETA ${Math.ceil(jobResult.resourceCount / 20)}  minutes.`,
        success: true
      };
    }

    // If clearing cache, delete existing translations first
    if (clearCache) {
      console.log('Clearing cache: removing existing translations');
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

    // Long text prioritization and batching
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

    // Sort by priority: long text first
    const sortedResources = [...resourcesToTranslate].sort((a, b) => {
      const aIsLong = isLikelyLongText(a);
      const bIsLong = isLikelyLongText(b);

      if (aIsLong && !bIsLong) return -1;
      if (!aIsLong && bIsLong) return 1;
      return 0;
    });

    // Batch processing config
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

    // Fetch link conversion config once per batch loop
    const linkConversionConfig = await getLinkConversionConfig(
      session.shop,
      admin,
      targetLanguage
    ).catch(err => {
      console.warn('Failed to get link conversion config, skipping conversion', err);
      return null;  // 降级处理
    });

    // Process by batches
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

        // 🆕 构建翻译选项（统一处理）
        const translationOptions = {
          admin,
          shopId: session.shop
        };
        if (linkConversionConfig) {
          translationOptions.linkConversion = linkConversionConfig;
        }

        if (themeResourceTypes.includes(resourceTypeUpper)) {
          console.log(`Theme资源 ${resource.resourceType} 加入翻译队列以避免超时`);

          // 导入队列服务
          const { addTranslationJob } = await import("../services/queue.server.js");

          // 加入队列
          const jobResult = await addTranslationJob(
            resource.id,
            shop.id,
            targetLanguage,
            session.shop,
            {
              forceRelatedTranslation: params.forceRelatedTranslation || clearCache,
              userRequested: params.userRequested || clearCache
            }
          );

          // 返回队列结果并skipped后续同步逻辑
          results.push({
            resourceId: resource.id,
            resourceType: resource.resourceType,
            title: resource.title,
            success: true,
            queued: true,
            jobId: jobResult.jobId,
            message: `已加入翻译队列，Job ID: ${jobResult.jobId}`
          });
          continue;  // ⚠️ 关键：skipped后续同步逻辑
        } else if (resourceTypeUpper === 'PRODUCT') {
          const { translateProductWithRelated } = await import('../services/product-translation-enhanced.server.js');

          const shouldAwaitRelated = params.forceRelatedTranslation || params.userRequested || clearCache;

          if (shouldAwaitRelated) {
            translations = await translateProductWithRelated(resourceInput, targetLanguage, admin, translationOptions);
          } else {
            translations = await translateResource(resourceInput, targetLanguage, translationOptions);

            setImmediate(async () => {
              try {
                await translateProductWithRelated({ ...resourceInput, userRequested: false, forceRelatedTranslation: false }, targetLanguage, admin, translationOptions);
              } catch (relatedError) {
                console.warn('产品关联内容异步翻译失败:', relatedError);
              }
            });
          }
        } else {
          translations = await translateResource(resourceInput, targetLanguage, translationOptions);
        }
        
        if (translations.skipped) {
          await updateResourceStatus(resource.id, 'pending');
          console.log(`ℹ️ skipped资源翻译（内容未变化）: ${resource.title}`);

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
      message: `Translation completed: ${successCount} success, ${failureCount} failed, ${skippedCount} skipped`,
      ...responseData
    };
}

export const action = createApiRoute(handleTranslate, {
  requireAuth: true,
  operationName: 'batch translation',
  timeout: 60000 // 增加到60秒，支持分批处理
});
