import { json } from '@remix-run/node';
import { withErrorHandling } from '../utils/error-handler.server.js';
import { versionDetectionService } from '../services/version-detection.server.js';
import { intelligentSkipEngine } from '../services/intelligent-skip-engine.server.js';
import { shopify } from '../shopify.server.js';

/**
 * 内容变更检测API端点
 * 
 * 功能：
 * - 检测资源内容变更
 * - 增量检测新增/修改/删除的资源
 * - 批量跳过评估
 * - 版本同步
 */

export const action = withErrorHandling(async ({ request }) => {
  const { admin } = await shopify.authenticate.admin(request);
  const shopId = admin.rest.session.shop;
  const requestData = await request.json();

  const { operation } = requestData;

  switch (operation) {
    case 'detectAll':
      return await handleDetectAllChanges(shopId, requestData);
    
    case 'detectIncremental':
      return await handleDetectIncremental(shopId, requestData);
    
    case 'getResourceVersion':
      return await handleGetResourceVersion(shopId, requestData);
    
    case 'syncVersions':
      return await handleSyncVersions(shopId, requestData);
    
    case 'batchEvaluateSkip':
      return await handleBatchEvaluateSkip(shopId, requestData);
    
    case 'updateContentHash':
      return await handleUpdateContentHash(requestData);
    
    default:
      return json({
        success: false,
        error: '不支持的操作',
        code: 'INVALID_OPERATION',
        supportedOperations: [
          'detectAll', 'detectIncremental', 'getResourceVersion',
          'syncVersions', 'batchEvaluateSkip', 'updateContentHash'
        ]
      }, { status: 400 });
  }
});

/**
 * 处理全量变更检测
 */
async function handleDetectAllChanges(shopId, requestData) {
  const {
    resourceTypes = [],
    includeDeleted = true,
    batchSize = 50
  } = requestData;

  try {
    const results = await versionDetectionService.detectAllResourceChanges(shopId, {
      resourceTypes,
      includeDeleted,
      batchSize
    });

    return json({
      success: true,
      message: '全量变更检测完成',
      data: results,
      summary: {
        totalProcessed: results.summary.totalProcessed,
        totalChanges: results.summary.totalChanges,
        newResources: results.summary.newResources,
        modifiedResources: results.summary.modifiedResources,
        deletedResources: results.summary.deletedResources,
        duration: results.summary.duration
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'DETECTION_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理增量变更检测
 */
async function handleDetectIncremental(shopId, requestData) {
  const {
    since,
    resourceTypes = []
  } = requestData;

  try {
    const sinceDate = since ? new Date(since) : null;
    const results = await versionDetectionService.detectIncrementalChanges(shopId, {
      since: sinceDate,
      resourceTypes
    });

    return json({
      success: true,
      message: '增量变更检测完成',
      data: results,
      summary: results.summary
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'INCREMENTAL_DETECTION_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理获取资源版本信息
 */
async function handleGetResourceVersion(shopId, requestData) {
  const { resourceType, resourceId } = requestData;

  if (!resourceType || !resourceId) {
    return json({
      success: false,
      error: '缺少必要参数：resourceType 和 resourceId',
      code: 'MISSING_PARAMS'
    }, { status: 400 });
  }

  try {
    const versionInfo = await versionDetectionService.getResourceVersionInfo(
      shopId,
      resourceType,
      resourceId
    );

    return json({
      success: true,
      data: versionInfo
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'VERSION_INFO_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理版本同步
 */
async function handleSyncVersions(shopId, requestData) {
  const { resources } = requestData;

  if (!Array.isArray(resources) || resources.length === 0) {
    return json({
      success: false,
      error: '缺少要同步的资源列表',
      code: 'MISSING_RESOURCES'
    }, { status: 400 });
  }

  try {
    const results = await versionDetectionService.syncResourceVersions(shopId, resources);

    return json({
      success: true,
      message: '版本同步完成',
      data: results,
      summary: {
        processed: results.processed,
        updated: results.updated,
        created: results.created,
        errors: results.errors.length
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'SYNC_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理批量跳过评估
 */
async function handleBatchEvaluateSkip(shopId, requestData) {
  const {
    resourceIds = [],
    languages = [],
    concurrency = 5,
    sessionId,
    skipRules = {},
    qualityThreshold = 0.7
  } = requestData;

  if (resourceIds.length === 0 || languages.length === 0) {
    return json({
      success: false,
      error: '缺少资源ID列表或语言列表',
      code: 'MISSING_RESOURCES_OR_LANGUAGES'
    }, { status: 400 });
  }

  try {
    // 先获取资源信息
    const { prisma } = await import('../db.server.js');
    const resources = await prisma.resource.findMany({
      where: {
        id: { in: resourceIds },
        shopId
      }
    });

    if (resources.length === 0) {
      return json({
        success: false,
        error: '未找到指定的资源',
        code: 'RESOURCES_NOT_FOUND'
      }, { status: 404 });
    }

    // 执行批量跳过评估
    let processedCount = 0;
    const results = await intelligentSkipEngine.batchEvaluate(resources, languages, {
      concurrency,
      sessionId,
      skipRules,
      qualityThreshold,
      progressCallback: (processed, total) => {
        processedCount = processed;
        // 这里可以通过WebSocket等方式实时推送进度
      }
    });

    // 统计结果
    const evaluations = Array.from(results.values());
    const skipCount = evaluations.filter(e => e.shouldSkip).length;
    const skipReasons = evaluations
      .filter(e => e.shouldSkip)
      .reduce((acc, e) => {
        acc[e.reason] = (acc[e.reason] || 0) + 1;
        return acc;
      }, {});

    return json({
      success: true,
      message: '批量跳过评估完成',
      data: {
        evaluations: evaluations,
        summary: {
          totalEvaluations: evaluations.length,
          skipCount,
          proceedCount: evaluations.length - skipCount,
          skipRate: Math.round((skipCount / evaluations.length) * 100) / 100,
          skipReasons
        }
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'BATCH_EVALUATE_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理内容哈希更新
 */
async function handleUpdateContentHash(requestData) {
  const { resourceId, content } = requestData;

  if (!resourceId || !content) {
    return json({
      success: false,
      error: '缺少必要参数：resourceId 和 content',
      code: 'MISSING_PARAMS'
    }, { status: 400 });
  }

  try {
    const result = await intelligentSkipEngine.updateContentHash(resourceId, content);

    return json({
      success: true,
      message: result.hasChanged ? '内容哈希已更新，检测到变更' : '内容哈希已更新，无变更',
      data: result
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'UPDATE_HASH_FAILED'
    }, { status: 500 });
  }
}

// 支持GET请求获取跳过统计
export const loader = withErrorHandling(async ({ request }) => {
  const { admin } = await shopify.authenticate.admin(request);
  const shopId = admin.rest.session.shop;

  const url = new URL(request.url);
  const operation = url.searchParams.get('operation');

  if (operation === 'skipStatistics') {
    const timeRange = url.searchParams.get('timeRange') || '7d';
    const resourceType = url.searchParams.get('resourceType');
    const language = url.searchParams.get('language');

    try {
      const statistics = await intelligentSkipEngine.getSkipStatistics(shopId, {
        timeRange,
        resourceType,
        language
      });

      return json({
        success: true,
        data: statistics
      });
    } catch (error) {
      return json({
        success: false,
        error: error.message,
        code: 'GET_STATISTICS_FAILED'
      }, { status: 500 });
    }
  }

  return json({
    success: false,
    error: '不支持的查询操作',
    code: 'INVALID_QUERY_OPERATION'
  }, { status: 400 });
});