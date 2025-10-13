import { collectError, ERROR_TYPES } from "../services/error-collector.server.js";
import prisma from "../db.server.js";
import { updateResourceTranslation } from "../services/shopify-graphql.server.js";
import { ensureValidResourceGid } from "../services/resource-gid-resolver.server.js";
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 批量发布API处理函数 - 支持更高级的批量发布功能
 * 包含进度跟踪、部分失败处理等高级功能
 */
async function handleBatchPublish({ request, admin }) {
  const formData = await request.formData();

    const batchSize = parseInt(formData.get("batchSize")) || 10; // 每批处理数量
    const delayMs = parseInt(formData.get("delayMs")) || 1000; // 批次间延迟
    const filters = JSON.parse(formData.get("filters") || "{}"); // 筛选条件

    console.log('🚀 批量发布请求:', { batchSize, delayMs, filters });

    // 构建查询条件
    const whereCondition = {
      syncStatus: 'pending',
      ...filters
    };

    // 获取所有待发布的翻译
    const allTranslations = await prisma.translation.findMany({
      where: whereCondition,
      include: {
        resource: true
      },
      orderBy: [
        { language: 'asc' }, // 按语言分组
        { createdAt: 'desc' } // 最新的优先
      ]
    });

    if (allTranslations.length === 0) {
      return {
        message: '没有找到符合条件的待发布翻译',
        total: 0,
        processed: 0,
        published: 0,
        errors: []
      };
    }

    console.log(`📋 找到 ${allTranslations.length} 个待发布翻译`);

    // 分批处理
    const batches = [];
    for (let i = 0; i < allTranslations.length; i += batchSize) {
      batches.push(allTranslations.slice(i, i + batchSize));
    }

    console.log(`📦 分为 ${batches.length} 批处理，每批 ${batchSize} 个`);

    const results = {
      total: allTranslations.length,
      processed: 0,
      published: 0,
      skipped: 0,
      skippedReasons: {},
      errors: [],
      batches: [],
      byType: {}
    };

    const resourceResolutionCache = new Map();

    // 逐批处理
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchResult = {
        batchIndex: batchIndex + 1,
        batchSize: batch.length,
        published: 0,
        errors: [],
        startTime: new Date()
      };

      console.log(`🔄 处理第 ${batchIndex + 1}/${batches.length} 批，包含 ${batch.length} 个翻译`);

      // 并发处理批次内的翻译
      const batchPromises = batch.map(async (translation) => {
        try {
          const resource = translation.resource;
          const cacheKey = resource?.id || translation.resourceId;
          let resolutionPromise = cacheKey ? resourceResolutionCache.get(cacheKey) : null;

          if (!resolutionPromise) {
            resolutionPromise = ensureValidResourceGid(admin, resource);
            if (cacheKey) {
              resourceResolutionCache.set(cacheKey, resolutionPromise);
            }
          }

          const resolution = await resolutionPromise;

          if (!resolution?.success || !resolution.gid) {
            const reason = resolution?.reason || 'RESOURCE_GID_RESOLUTION_FAILED';
            const resourceType = (resource?.resourceType || '').toUpperCase();

            // 🔧 Fallback: For OPTION/METAFIELD with existing valid GID, use it directly
            const isOptionOrMetafield = resourceType === 'PRODUCT_OPTION' || resourceType === 'PRODUCT_METAFIELD';
            const hasValidGid = resource?.gid && typeof resource.gid === 'string' && resource.gid.startsWith('gid://shopify/');
            const isNullContentFieldsIssue = reason === 'PRODUCT_GID_UNAVAILABLE';

            if (isOptionOrMetafield && hasValidGid && isNullContentFieldsIssue) {
              console.warn('⚠️ GID解析失败但资源有有效GID，使用直接发布模式', {
                translationId: translation.id,
                resourceTitle: resource?.title,
                resourceType: resource?.resourceType,
                gid: resource.gid,
                reason: 'NULL_CONTENTFIELDS_FALLBACK',
                batch: batchIndex + 1
              });

              // 使用资源自身的 GID 继续发布流程
              // 不返回 false，让代码继续执行到发布逻辑
            } else {
              // 其他类型的失败仍然跳过
              console.warn('⚠️ 批量发布时资源GID解析失败，跳过该条', {
                translationId: translation.id,
                resourceTitle: resource?.title,
                resourceType: resource?.resourceType,
                reason,
                details: resolution?.details || {},
                batch: batchIndex + 1
              });

              const errorInfo = {
                translationId: translation.id,
                resourceTitle: resource?.title,
                language: translation.language,
                error: `资源标识解析失败: ${reason}`
              };

              batchResult.errors.push(errorInfo);
              results.errors.push(errorInfo);

              // 增加跳过计数和原因统计
              results.skipped++;
              const skipReason = `GID解析失败: ${reason}`;
              results.skippedReasons[skipReason] = (results.skippedReasons[skipReason] || 0) + 1;

              if (!results.byType[resourceType]) {
                results.byType[resourceType] = { success: 0, failed: 0 };
              }
              results.byType[resourceType].failed++;

              await collectError({
                errorType: ERROR_TYPES.SYNC,
                errorCategory: 'BATCH_PUBLISH_ERROR',
                errorCode: 'RESOURCE_GID_UNRESOLVED',
                message: `Unable to resolve gid for resource ${translation.resourceId}: ${reason}`,
                stack: null,
                operation: 'api.batch-publish',
                resourceId: translation.resourceId,
                resourceType: resource?.resourceType,
                language: translation.language,
                shopId: translation.shopId,
                batchIndex: batchIndex + 1
              });

              return { success: false, translationId: translation.id, error: reason };
            }
          }

          // 使用解析成功的 GID，或 fallback 到资源自身的 GID
          const finalGid = resolution?.gid || resource?.gid;
          if (resource && finalGid) {
            resource.gid = finalGid;
          }

          // 标记为处理中
          await prisma.translation.update({
            where: { id: translation.id },
            data: { syncStatus: 'syncing' }
          });

          // 构建翻译数据
          const translationData = {
            titleTrans: translation.titleTrans,
            descTrans: translation.descTrans,
            handleTrans: translation.handleTrans,
            summaryTrans: translation.summaryTrans,
            labelTrans: translation.labelTrans,
            seoTitleTrans: translation.seoTitleTrans,
            seoDescTrans: translation.seoDescTrans,
            translationFields: translation.translationFields
          };

          // 调用Shopify API
          await updateResourceTranslation(
            admin,
            resolution.gid,
            translationData,
            translation.language,
            (translation.resource.resourceType || '').toUpperCase()
          );

          const resourceType = (translation.resource?.resourceType || '').toUpperCase() || 'UNKNOWN';

          // 标记为已同步
          await prisma.translation.update({
            where: { id: translation.id },
            data: {
              syncStatus: 'synced',
              syncedAt: new Date()
            }
          });

          batchResult.published++;
          results.published++;

          if (!results.byType[resourceType]) {
            results.byType[resourceType] = { success: 0, failed: 0 };
          }
          results.byType[resourceType].success++;
          console.log(`✅ 批次${batchIndex + 1}: ${translation.resource.title} -> ${translation.language}`);

          return { success: true, translationId: translation.id };

        } catch (error) {
          console.error(`❌ 批次${batchIndex + 1}发布失败 ${translation.id}:`, error);

          // 恢复pending状态
          await prisma.translation.update({
            where: { id: translation.id },
            data: { syncStatus: 'pending' }
          });

          // 记录错误
          await collectError({
            errorType: ERROR_TYPES.SYNC,
            errorCategory: 'BATCH_PUBLISH_ERROR',
            errorCode: 'BATCH_TRANSLATION_PUBLISH_FAILED',
            message: `Batch publish failed for translation ${translation.id}: ${error.message}`,
            stack: error.stack,
            operation: 'api.batch-publish',
            resourceId: translation.resourceId,
            resourceType: translation.resource.resourceType,
            language: translation.language,
            shopId: translation.shopId,
            batchIndex: batchIndex + 1
          });

          const resourceType = (translation.resource?.resourceType || '').toUpperCase() || 'UNKNOWN';

          const errorInfo = {
            translationId: translation.id,
            resourceTitle: translation.resource.title,
            language: translation.language,
            error: error.message
          };

          batchResult.errors.push(errorInfo);
          results.errors.push(errorInfo);

          if (!results.byType[resourceType]) {
            results.byType[resourceType] = { success: 0, failed: 0 };
          }
          results.byType[resourceType].failed++;

          return { success: false, translationId: translation.id, error: error.message };
        }
      });

      // 等待当前批次完成
      await Promise.all(batchPromises);
      results.processed += batch.length;

      batchResult.endTime = new Date();
      batchResult.duration = batchResult.endTime - batchResult.startTime;
      results.batches.push(batchResult);

      console.log(`📊 批次${batchIndex + 1}完成: ${batchResult.published}/${batchResult.batchSize} 成功，耗时 ${batchResult.duration}ms`);

      // 批次间延迟（避免API限流）
      if (batchIndex < batches.length - 1 && delayMs > 0) {
        console.log(`⏳ 批次间延迟 ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    const successRate = ((results.published / results.total) * 100).toFixed(1);
    const message = `批量发布完成: ${results.published}/${results.total} 成功 (${successRate}%)`;

    console.log(`🎯 ${message}`);

    // 显示跳过统计
    if (results.skipped > 0) {
      console.log(`⏭️  跳过: ${results.skipped} 条`);
      Object.entries(results.skippedReasons).forEach(([reason, count]) => {
        console.log(`   - ${reason}: ${count}条`);
      });
    }

    // 显示失败统计（不包括已计入跳过的）
    const pureFailures = results.errors.length - results.skipped;
    if (pureFailures > 0) {
      console.log(`❌ 失败: ${pureFailures} 条（同步错误）`);
    }

    return {
      message,
      ...results,
      byType: results.byType,
      successRate: `${successRate}%`,
      skipped: results.skipped,
      skippedReasons: results.skippedReasons,
      processingTime: new Date() - (results.batches[0]?.startTime || new Date())
    };
}

export const action = createApiRoute(handleBatchPublish, {
  requireAuth: true,
  operationName: '批量发布翻译'
});
