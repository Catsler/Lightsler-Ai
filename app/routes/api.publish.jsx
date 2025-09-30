import { collectError, ERROR_TYPES } from "../services/error-collector.server.js";
import prisma from "../db.server.js";
import { updateResourceTranslation } from "../services/shopify-graphql.server.js";
import { ensureValidResourceGid } from "../services/resource-gid-resolver.server.js";
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 发布API - 将pending状态的翻译同步到Shopify
 * 支持单个翻译发布和批量发布
 */
async function handlePublish({ request, admin }) {
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
      throw new Error('请指定要发布的翻译ID、语言、资源ID或选择发布全部');
    }

    if (translationsToPublish.length === 0) {
      return {
        message: '没有找到待发布的翻译',
        published: 0,
        errors: []
      };
    }

    console.log(`🚀 准备发布 ${translationsToPublish.length} 个翻译`);

    const results = {
      published: 0,
      errors: [],
      details: []
    };

    const resourceResolutionCache = new Map();

    // 逐个发布翻译
    for (const translation of translationsToPublish) {
      try {
        const resource = translation.resource;
        const cacheKey = resource?.id || translation.resourceId;
        let resolution = cacheKey ? resourceResolutionCache.get(cacheKey) : null;

        if (!resolution) {
          resolution = await ensureValidResourceGid(admin, resource);
          if (cacheKey) {
            resourceResolutionCache.set(cacheKey, resolution);
          }

          if (resolution.success && resource) {
            resource.gid = resolution.gid;
          }
        }

        if (!resolution?.success || !resolution.gid) {
          const reason = resolution?.reason || 'RESOURCE_GID_RESOLUTION_FAILED';
          console.warn('⚠️ 无法解析资源GID，跳过发布', {
            translationId: translation.id,
            resourceTitle: resource?.title,
            resourceType: resource?.resourceType,
            reason,
            details: resolution?.details || {}
          });

          results.errors.push({
            translationId: translation.id,
            resourceTitle: resource?.title,
            language: translation.language,
            error: `资源标识解析失败: ${reason}`
          });

          await collectError({
            errorType: ERROR_TYPES.SYNC,
            errorCategory: 'PUBLISH_ERROR',
            errorCode: 'RESOURCE_GID_UNRESOLVED',
            message: `Unable to resolve gid for resource ${translation.resourceId}: ${reason}`,
            stack: null,
            operation: 'api.publish',
            resourceId: translation.resourceId,
            resourceType: resource?.resourceType,
            language: translation.language,
            shopId: translation.shopId
          });

          continue;
        }

        const resolvedGid = resolution.gid;

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
          resolvedGid,
          translationData,
          translation.language,
          (translation.resource.resourceType || '').toUpperCase()
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

    return {
      message,
      published: results.published,
      total: translationsToPublish.length,
      errors: results.errors,
      details: results.details
    };
}

export const action = createApiRoute(handlePublish, {
  requireAuth: true,
  operationName: '发布翻译'
});
