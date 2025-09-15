import { authenticate } from "../shopify.server.js";
import { collectError, ERROR_TYPES } from "../services/error-collector.server.js";
import prisma from "../db.server.js";
import { updateResourceTranslation } from "../services/shopify-graphql.server.js";

// 本地工具函数
function successResponse(data) {
  return Response.json({ success: true, ...data });
}

function withErrorHandling(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('API Error:', error);
      return Response.json({
        success: false,
        error: error.message || '服务器内部错误'
      }, { status: 500 });
    }
  };
}

/**
 * 批量发布API - 支持更高级的批量发布功能
 * 包含进度跟踪、部分失败处理等高级功能
 */
export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
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
      return successResponse({
        message: '没有找到符合条件的待发布翻译',
        total: 0,
        processed: 0,
        published: 0,
        errors: []
      });
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
      errors: [],
      batches: []
    };

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
            translation.resource.gid,
            translationData,
            translation.language,
            translation.resource.resourceType.toUpperCase()
          );

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

          const errorInfo = {
            translationId: translation.id,
            resourceTitle: translation.resource.title,
            language: translation.language,
            error: error.message
          };

          batchResult.errors.push(errorInfo);
          results.errors.push(errorInfo);

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

    return successResponse({
      message,
      ...results,
      successRate: `${successRate}%`,
      processingTime: new Date() - (results.batches[0]?.startTime || new Date())
    });

  });
};