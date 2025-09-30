import { errorPreventionGuard } from '../services/error-prevention-guard.server.js';
import { errorAnalyzer } from '../services/error-analyzer.server.js';
import { createApiRoute } from '../utils/base-route.server.js';

/**
 * 错误预防和分析API端点
 * 
 * 功能：
 * - 翻译风险评估
 * - 错误预防措施执行
 * - 翻译监控管理
 * - 错误分析和报告
 */

/**
 * POST请求处理函数 - 错误预防操作
 */
async function handleErrorPreventionAction({ request, session }) {
  const shopId = session.shop;
  const requestData = await request.json();
  const { operation } = requestData;

  switch (operation) {
    case 'assessRisk':
      return await handleAssessRisk(shopId, requestData);
    
    case 'executePrevention':
      return await handleExecutePrevention(shopId, requestData);
    
    case 'startMonitoring':
      return await handleStartMonitoring(requestData);
    
    case 'stopMonitoring':
      return await handleStopMonitoring(requestData);
    
    case 'analyzeErrors':
      return await handleAnalyzeErrors(shopId, requestData);
    
    case 'generateReport':
      return await handleGenerateReport(shopId, requestData);
    
    default:
      throw new Error(`不支持的操作: ${operation}. 支持的操作: assessRisk, executePrevention, startMonitoring, stopMonitoring, analyzeErrors, generateReport`);
  }
}

export const action = createApiRoute(handleErrorPreventionAction, {
  requireAuth: true,
  operationName: '错误预防操作'
});

/**
 * 处理翻译风险评估
 */
async function handleAssessRisk(shopId, requestData) {
  const {
    resourceId,
    resourceType,
    language,
    content,
    sessionId,
    translationConfig = {}
  } = requestData;

  // 验证必要参数
  if (!resourceId || !resourceType || !language || !content) {
    throw new Error('缺少必要参数：resourceId, resourceType, language, content');
  }

  const context = {
    shopId,
    resourceId,
    resourceType,
    language,
    content,
    sessionId,
    translationConfig
  };

  const riskAssessment = await errorPreventionGuard.assessTranslationRisk(context);

  return {
    message: '风险评估完成',
    data: riskAssessment,
    recommendations: riskAssessment.recommendations || []
  };
}

/**
 * 处理预防措施执行
 */
async function handleExecutePrevention(shopId, requestData) {
  const { riskAssessment, context } = requestData;

  if (!riskAssessment || !context) {
    throw new Error('缺少风险评估结果或上下文信息');
  }

  const preventionResult = await errorPreventionGuard.executePreventionMeasures(
    riskAssessment,
    { ...context, shopId }
  );

  return {
    message: `执行了${preventionResult.measuresExecuted}项预防措施`,
    data: preventionResult,
    canProceed: preventionResult.canProceed
  };
}

/**
 * 处理启动翻译监控
 */
async function handleStartMonitoring(requestData) {
  const {
    sessionId,
    monitorConfig = {}
  } = requestData;

  if (!sessionId) {
    throw new Error('缺少会话ID');
  }

  const monitor = await errorPreventionGuard.startTranslationMonitoring(sessionId, monitorConfig);

  return {
    message: '翻译监控已启动',
    data: {
      sessionId: monitor.sessionId,
      config: monitor.config,
      startTime: monitor.startTime,
      active: monitor.active
    }
  };
}

/**
 * 处理停止翻译监控
 */
async function handleStopMonitoring(requestData) {
  const { sessionId } = requestData;

  if (!sessionId) {
    throw new Error('缺少会话ID');
  }

  await errorPreventionGuard.stopTranslationMonitoring(sessionId);

  return {
    message: '翻译监控已停止',
    data: { sessionId }
  };
}

/**
 * 处理错误分析
 */
async function handleAnalyzeErrors(shopId, requestData) {
  const {
    analysisType = 'trends',
    options = {}
  } = requestData;

  let result;

  switch (analysisType) {
    case 'trends':
      result = await errorAnalyzer.analyzeTrends({ shopId, ...options });
      break;

    case 'patterns':
      result = await errorAnalyzer.predictErrorTrends({ shopId, ...options });
      break;

    case 'hotspots':
      // 先获取错误数据，然后识别热点
      const recentErrors = await getRecentErrors(shopId, options);
      result = await errorAnalyzer.identifyHotspots(recentErrors);
      break;

    case 'related':
      const { errorId } = options;
      if (!errorId) {
        throw new Error('查找相关错误需要提供errorId');
      }
      result = await errorAnalyzer.findRelatedErrors(errorId);
      break;

    default:
      throw new Error(`不支持的分析类型: ${analysisType}. 支持的类型: trends, patterns, hotspots, related`);
  }

  return {
    message: `${analysisType}分析完成`,
    data: result
  };
}

/**
 * 处理错误报告生成
 */
async function handleGenerateReport(shopId, requestData) {
  const {
    reportType = 'comprehensive',
    timeRange = '7d',
    includeDetails = false
  } = requestData;

  let report;

  switch (reportType) {
    case 'comprehensive':
      report = await errorAnalyzer.generateReport({
        shopId,
        timeRange,
        includeDetails
      });
      break;

    case 'prevention':
      report = await errorPreventionGuard.getPreventionStatistics(shopId, {
        timeRange
      });
      break;

    default:
      throw new Error(`不支持的报告类型: ${reportType}. 支持的类型: comprehensive, prevention`);
  }

  return {
    message: `${reportType}报告生成完成`,
    data: report
  };
}

/**
 * 获取最近错误数据的辅助函数
 */
async function getRecentErrors(shopId, options) {
  const { prisma } = await import('../db.server.js');
  const { timeRange = '7d' } = options;

  const timeFilter = getTimeFilter(timeRange);

  return await prisma.errorLog.findMany({
    where: {
      shopId,
      createdAt: timeFilter,
      isTranslationError: true
    },
    select: {
      id: true,
      errorType: true,
      severity: true,
      createdAt: true,
      fingerprint: true,
      occurrences: true,
      message: true
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 时间过滤器辅助函数
 */
function getTimeFilter(timeRange) {
  const now = new Date();
  const ranges = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };

  const duration = ranges[timeRange] || ranges['7d'];
  return { gte: new Date(now - duration) };
}

/**
 * GET请求处理函数 - 获取预防统计和错误分析
 */
async function handleErrorPreventionQuery({ request, admin, searchParams }) {
  const shopId = admin.rest.session.shop;
  const operation = searchParams.get('operation');

  switch (operation) {
    case 'preventionStats':
      const timeRange = searchParams.get('timeRange') || '7d';
      const stats = await errorPreventionGuard.getPreventionStatistics(shopId, { timeRange });
      
      return {
        data: stats
      };

    case 'errorTrends':
      const timeRangeTrends = searchParams.get('timeRange') || '7d';
      const groupBy = searchParams.get('groupBy') || 'hour';
      
      const trends = await errorAnalyzer.analyzeTrends({
        shopId,
        timeRange: timeRangeTrends,
        groupBy
      });
      
      return {
        data: trends
      };

    default:
      throw new Error(`不支持的查询操作: ${operation}. 支持的操作: preventionStats, errorTrends`);
  }
}

export const loader = createApiRoute(handleErrorPreventionQuery, {
  requireAuth: true,
  operationName: '错误预防查询'
});