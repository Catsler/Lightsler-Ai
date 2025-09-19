import { authenticate } from "../shopify.server.js";
import { collectError, ERROR_TYPES } from "../services/error-collector.server.js";
import prisma from "../db.server.js";
import { updateResourceTranslation } from "../services/shopify-graphql.server.js";

// 本地工具函数
function successResponse(data) {
  return Response.json({ success: true, ...data });
}

function validationErrorResponse(errors) {
  return Response.json({
    success: false,
    error: "参数验证失败",
    errors
  }, { status: 400 });
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
 * 发布API - 将pending状态的翻译同步到Shopify
 * 支持单个翻译发布和批量发布
 */
export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

    // 参数验证
    const params = {
      translationIds: formData.get("translationIds"), // 支持单个或多个翻译ID
      language: formData.get("language"), // 可选：按语言批量发布
      resourceIds: formData.get("resourceIds"), // 可选：按资源批量发布
      publishAll: formData.get("publishAll") === "true" // 发布所有pending翻译
    };

    console.log('📤 发布请求参数:', params);

    let translationsToPublish = [];

    // 获取要发布的翻译记录
    if (params.translationIds) {
      // 发布指定的翻译ID
      const translationIds = JSON.parse(params.translationIds);
      translationsToPublish = await prisma.translation.findMany({
        where: {
          id: { in: translationIds },
          syncStatus: 'pending'
        },
        include: {
          resource: true
        }
      });

    } else if (params.language) {
      // 按语言批量发布
      translationsToPublish = await prisma.translation.findMany({
        where: {
          language: params.language,
          syncStatus: 'pending'
        },
        include: {
          resource: true
        }
      });

    } else if (params.resourceIds) {
      // 按资源ID批量发布
      const resourceIds = JSON.parse(params.resourceIds);
      translationsToPublish = await prisma.translation.findMany({
        where: {
          resourceId: { in: resourceIds },
          syncStatus: 'pending'
        },
        include: {
          resource: true
        }
      });

    } else if (params.publishAll) {
      // 发布所有pending翻译
      translationsToPublish = await prisma.translation.findMany({
        where: {
          syncStatus: 'pending'
        },
        include: {
          resource: true
        }
      });

    } else {
      return validationErrorResponse([{
        field: 'translationIds',
        message: '请指定要发布的翻译ID、语言、资源ID或选择发布全部'
      }]);
    }

    if (translationsToPublish.length === 0) {
      return successResponse({
        message: '没有找到待发布的翻译',
        published: 0,
        errors: []
      });
    }

    console.log(`🚀 准备发布 ${translationsToPublish.length} 个翻译`);

    const results = {
      published: 0,
      errors: [],
      details: []
    };

    // 逐个发布翻译
    for (const translation of translationsToPublish) {
      try {
        // 更新状态为syncing
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

        console.log(`📝 发布翻译: ${translation.resource.title} -> ${translation.language}`);

        // 调用Shopify GraphQL API同步翻译
        const updateResult = await updateResourceTranslation(
          admin,
          translation.resource.gid,
          translationData,
          translation.language,
          translation.resource.resourceType.toUpperCase()
        );

        // 更新状态为synced
        await prisma.translation.update({
          where: { id: translation.id },
          data: {
            syncStatus: 'synced',
            syncedAt: new Date()
          }
        });

        results.published++;
        results.details.push({
          translationId: translation.id,
          resourceTitle: translation.resource.title,
          language: translation.language,
          status: 'success'
        });

        console.log(`✅ 成功发布: ${translation.resource.title} -> ${translation.language}`);

      } catch (error) {
        console.error(`❌ 发布失败 ${translation.id}:`, error);

        // 将状态改回pending
        await prisma.translation.update({
          where: { id: translation.id },
          data: { syncStatus: 'pending' }
        });

        // 记录错误
        await collectError({
          errorType: ERROR_TYPES.SYNC,
          errorCategory: 'PUBLISH_ERROR',
          errorCode: 'TRANSLATION_PUBLISH_FAILED',
          message: `Failed to publish translation ${translation.id}: ${error.message}`,
          stack: error.stack,
          operation: 'api.publish',
          resourceId: translation.resourceId,
          resourceType: translation.resource.resourceType,
          language: translation.language,
          shopId: translation.shopId
        });

        results.errors.push({
          translationId: translation.id,
          resourceTitle: translation.resource.title,
          language: translation.language,
          error: error.message
        });
      }
    }

    const message = `发布完成: ${results.published}/${translationsToPublish.length} 成功`;
    console.log(`🎯 ${message}`);

    return successResponse({
      message,
      published: results.published,
      total: translationsToPublish.length,
      errors: results.errors,
      details: results.details
    });

});
