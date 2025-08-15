import { json } from '@remix-run/node';
import { withErrorHandling } from '../utils/error-handler.server.js';
import { qualityErrorAnalyzer } from '../services/quality-error-analyzer.server.js';
import { autoRecoveryService } from '../services/auto-recovery.server.js';
import { authenticate } from '../shopify.server.js';

/**
 * 翻译质量管理API端点
 * 
 * 功能：
 * - 翻译质量评估和分析
 * - 质量统计和报告
 * - 自动恢复和修复
 * - 批量质量分析
 */

export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopId = session.shop;
  const requestData = await request.json();

  const { operation } = requestData;

  switch (operation) {
    case 'assessQuality':
      return await handleAssessQuality(shopId, requestData);
    
    case 'batchAnalyze':
      return await handleBatchQualityAnalysis(shopId, requestData);
    
    case 'predictRisk':
      return await handlePredictQualityRisk(requestData);
    
    case 'autoRecover':
      return await handleAutoRecovery(shopId, requestData);
    
    case 'batchRecover':
      return await handleBatchRecover(shopId, requestData);
    
    case 'healthCheck':
      return await handleSystemHealthCheck(shopId);
    
    default:
      return json({
        success: false,
        error: '不支持的操作',
        code: 'INVALID_OPERATION',
        supportedOperations: [
          'assessQuality', 'batchAnalyze', 'predictRisk',
          'autoRecover', 'batchRecover', 'healthCheck'
        ]
      }, { status: 400 });
  }
});

/**
 * 处理单个翻译质量评估
 */
async function handleAssessQuality(shopId, requestData) {
  const {
    resourceId,
    language,
    originalText,
    translatedText,
    resourceType,
    sessionId
  } = requestData;

  // 验证必要参数
  if (!resourceId || !language || !originalText || !translatedText) {
    return json({
      success: false,
      error: '缺少必要参数：resourceId, language, originalText, translatedText',
      code: 'MISSING_PARAMS'
    }, { status: 400 });
  }

  try {
    const assessment = await qualityErrorAnalyzer.assessTranslationQuality({
      resourceId,
      language,
      originalText,
      translatedText,
      resourceType,
      shopId,
      sessionId
    });

    return json({
      success: true,
      message: '翻译质量评估完成',
      data: assessment
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'QUALITY_ASSESSMENT_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理批量质量分析
 */
async function handleBatchQualityAnalysis(shopId, requestData) {
  const {
    sessionId,
    resourceType,
    language,
    timeRange = '7d',
    minTranslations = 5
  } = requestData;

  try {
    const analysis = await qualityErrorAnalyzer.batchQualityAnalysis(shopId, {
      sessionId,
      resourceType,
      language,
      timeRange,
      minTranslations
    });

    return json({
      success: true,
      message: '批量质量分析完成',
      data: analysis
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'BATCH_ANALYSIS_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理质量风险预测
 */
async function handlePredictQualityRisk(requestData) {
  const {
    shopId,
    resourceType,
    language,
    contentLength,
    sessionId
  } = requestData;

  if (!shopId || !resourceType || !language) {
    return json({
      success: false,
      error: '缺少必要参数：shopId, resourceType, language',
      code: 'MISSING_PARAMS'
    }, { status: 400 });
  }

  try {
    const prediction = await qualityErrorAnalyzer.predictQualityRisk({
      shopId,
      resourceType,
      language,
      contentLength,
      sessionId
    });

    return json({
      success: true,
      message: '质量风险预测完成',
      data: prediction
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'RISK_PREDICTION_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理自动恢复
 */
async function handleAutoRecovery(shopId, requestData) {
  const { error, context } = requestData;

  if (!error || !context) {
    return json({
      success: false,
      error: '缺少错误信息或上下文',
      code: 'MISSING_ERROR_DATA'
    }, { status: 400 });
  }

  try {
    const recoveryResult = await autoRecoveryService.diagnoseAndRecover(error, {
      ...context,
      shopId
    });

    return json({
      success: true,
      message: '自动恢复处理完成',
      data: recoveryResult
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'AUTO_RECOVERY_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理批量恢复
 */
async function handleBatchRecover(shopId, requestData) {
  const {
    sessionId,
    maxBatchSize = 20,
    resourceType,
    language,
    minFailureAge = 300000
  } = requestData;

  try {
    const recoveryResult = await autoRecoveryService.batchRecoverFailedTranslations(shopId, {
      sessionId,
      maxBatchSize,
      resourceType,
      language,
      minFailureAge
    });

    return json({
      success: true,
      message: '批量恢复处理完成',
      data: recoveryResult
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'BATCH_RECOVERY_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理系统健康检查
 */
async function handleSystemHealthCheck(shopId) {
  try {
    const healthCheck = await autoRecoveryService.performSystemHealthCheck(shopId);

    return json({
      success: true,
      message: '系统健康检查完成',
      data: healthCheck
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'HEALTH_CHECK_FAILED'
    }, { status: 500 });
  }
}

// 支持GET请求获取质量统计
export const loader = withErrorHandling(async ({ request }) => {
  const { admin } = await shopify.authenticate.admin(request);
  const shopId = admin.rest.session.shop;

  const url = new URL(request.url);
  const operation = url.searchParams.get('operation');

  switch (operation) {
    case 'statistics':
      try {
        const timeRange = url.searchParams.get('timeRange') || '7d';
        const resourceType = url.searchParams.get('resourceType');
        const language = url.searchParams.get('language');

        const statistics = await qualityErrorAnalyzer.getQualityStatistics(shopId, {
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

    case 'healthSummary':
      try {
        const healthCheck = await autoRecoveryService.performSystemHealthCheck(shopId);
        
        // 返回简化的健康摘要
        return json({
          success: true,
          data: {
            overallHealth: healthCheck.overallHealth,
            issueCount: healthCheck.issues.length,
            lastCheck: healthCheck.checkTime,
            recommendations: healthCheck.recommendations.slice(0, 3) // 只返回前3个建议
          }
        });
      } catch (error) {
        return json({
          success: false,
          error: error.message,
          code: 'GET_HEALTH_SUMMARY_FAILED'
        }, { status: 500 });
      }

    default:
      return json({
        success: false,
        error: '不支持的查询操作',
        code: 'INVALID_QUERY_OPERATION',
        supportedOperations: ['statistics', 'healthSummary']
      }, { status: 400 });
  }
});