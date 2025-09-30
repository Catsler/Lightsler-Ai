import { qualityErrorAnalyzer } from '../services/quality-error-analyzer.server.js';
import { autoRecoveryService } from '../services/auto-recovery.server.js';
import { createApiRoute } from '../utils/base-route.server.js';

/**
 * 翻译质量管理API端点
 * 
 * 功能：
 * - 翻译质量评估和分析
 * - 质量统计和报告
 * - 自动恢复和修复
 * - 批量质量分析
 */

async function handleQualityManagementAction({ request, session }) {
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
      throw new Error(`不支持的操作: ${operation}. 支持的操作: assessQuality, batchAnalyze, predictRisk, autoRecover, batchRecover, healthCheck`);
  }
}

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
    throw new Error('缺少必要参数：resourceId, language, originalText, translatedText');
  }

  const assessment = await qualityErrorAnalyzer.assessTranslationQuality({
    resourceId,
    language,
    originalText,
    translatedText,
    resourceType,
    shopId,
    sessionId
  });

  return {
    message: '翻译质量评估完成',
    data: assessment
  };
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

  const analysis = await qualityErrorAnalyzer.batchQualityAnalysis(shopId, {
    sessionId,
    resourceType,
    language,
    timeRange,
    minTranslations
  });

  return {
    message: '批量质量分析完成',
    data: analysis
  };
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
    throw new Error('缺少必要参数：shopId, resourceType, language');
  }

  const prediction = await qualityErrorAnalyzer.predictQualityRisk({
    shopId,
    resourceType,
    language,
    contentLength,
    sessionId
  });

  return {
    message: '质量风险预测完成',
    data: prediction
  };
}

/**
 * 处理自动恢复
 */
async function handleAutoRecovery(shopId, requestData) {
  const { error, context } = requestData;

  if (!error || !context) {
    throw new Error('缺少错误信息或上下文');
  }

  const recoveryResult = await autoRecoveryService.diagnoseAndRecover(error, {
    ...context,
    shopId
  });

  return {
    message: '自动恢复处理完成',
    data: recoveryResult
  };
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

  const recoveryResult = await autoRecoveryService.batchRecoverFailedTranslations(shopId, {
    sessionId,
    maxBatchSize,
    resourceType,
    language,
    minFailureAge
  });

  return {
    message: '批量恢复处理完成',
    data: recoveryResult
  };
}

/**
 * 处理系统健康检查
 */
async function handleSystemHealthCheck(shopId) {
  const healthCheck = await autoRecoveryService.performSystemHealthCheck(shopId);

  return {
    message: '系统健康检查完成',
    data: healthCheck
  };
}

/**
 * GET请求处理函数 - 获取质量统计
 */
async function handleQualityManagementQuery({ request, admin, searchParams }) {
  const shopId = admin.rest.session.shop;
  const operation = searchParams.get('operation');

  switch (operation) {
    case 'statistics':
      const timeRange = searchParams.get('timeRange') || '7d';
      const resourceType = searchParams.get('resourceType');
      const language = searchParams.get('language');

      const statistics = await qualityErrorAnalyzer.getQualityStatistics(shopId, {
        timeRange,
        resourceType,
        language
      });

      return {
        data: statistics
      };

    case 'healthSummary':
      const healthCheck = await autoRecoveryService.performSystemHealthCheck(shopId);

      // 返回简化的健康摘要
      return {
        data: {
          overallHealth: healthCheck.overallHealth,
          issueCount: healthCheck.issues.length,
          lastCheck: healthCheck.checkTime,
          recommendations: healthCheck.recommendations.slice(0, 3) // 只返回前3个建议
        }
      };

    default:
      throw new Error(`不支持的查询操作: ${operation}. 支持的操作: statistics, healthSummary`);
  }
}

export const action = createApiRoute(handleQualityManagementAction, {
  requireAuth: true,
  operationName: '翻译质量管理操作'
});

export const loader = createApiRoute(handleQualityManagementQuery, {
  requireAuth: true,
  operationName: '查询翻译质量统计'
});