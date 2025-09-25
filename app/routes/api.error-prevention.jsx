import { json } from '@remix-run/node';
import { withErrorHandling } from '../utils/error-handler.server.js';
import { errorPreventionGuard } from '../services/error-prevention-guard.server.js';
import { errorAnalyzer } from '../services/error-analyzer.server.js';
import { authenticate } from '../shopify.server.js';

/**
 * 错误预防和分析API端点
 * 
 * 功能：
 * - 翻译风险评估
 * - 错误预防措施执行
 * - 翻译监控管理
 * - 错误分析和报告
 */

export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
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
      return json({
        success: false,
        error: '不支持的操作',
        code: 'INVALID_OPERATION',
        supportedOperations: [
          'assessRisk', 'executePrevention', 'startMonitoring',
          'stopMonitoring', 'analyzeErrors', 'generateReport'
        ]
      }, { status: 400 });
  }
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
    return json({
      success: false,
      error: '缺少必要参数：resourceId, resourceType, language, content',
      code: 'MISSING_PARAMS'
    }, { status: 400 });
  }

  try {
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

    return json({
      success: true,
      message: '风险评估完成',
      data: riskAssessment,
      recommendations: riskAssessment.recommendations || []
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'RISK_ASSESSMENT_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理预防措施执行
 */
async function handleExecutePrevention(shopId, requestData) {
  const { riskAssessment, context } = requestData;

  if (!riskAssessment || !context) {
    return json({
      success: false,
      error: '缺少风险评估结果或上下文信息',
      code: 'MISSING_RISK_DATA'
    }, { status: 400 });
  }

  try {
    const preventionResult = await errorPreventionGuard.executePreventionMeasures(
      riskAssessment,
      { ...context, shopId }
    );

    return json({
      success: true,
      message: `执行了${preventionResult.measuresExecuted}项预防措施`,
      data: preventionResult,
      canProceed: preventionResult.canProceed
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'PREVENTION_EXECUTION_FAILED'
    }, { status: 500 });
  }
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
    return json({
      success: false,
      error: '缺少会话ID',
      code: 'MISSING_SESSION_ID'
    }, { status: 400 });
  }

  try {
    const monitor = await errorPreventionGuard.startTranslationMonitoring(sessionId, monitorConfig);

    return json({
      success: true,
      message: '翻译监控已启动',
      data: {
        sessionId: monitor.sessionId,
        config: monitor.config,
        startTime: monitor.startTime,
        active: monitor.active
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'START_MONITORING_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理停止翻译监控
 */
async function handleStopMonitoring(requestData) {
  const { sessionId } = requestData;

  if (!sessionId) {
    return json({
      success: false,
      error: '缺少会话ID',
      code: 'MISSING_SESSION_ID'
    }, { status: 400 });
  }

  try {
    await errorPreventionGuard.stopTranslationMonitoring(sessionId);

    return json({
      success: true,
      message: '翻译监控已停止',
      data: { sessionId }
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'STOP_MONITORING_FAILED'
    }, { status: 500 });
  }
}

/**
 * 处理错误分析
 */
async function handleAnalyzeErrors(shopId, requestData) {
  const {
    analysisType = 'trends',
    options = {}
  } = requestData;

  try {
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
          return json({
            success: false,
            error: '查找相关错误需要提供errorId',
            code: 'MISSING_ERROR_ID'
          }, { status: 400 });
        }
        result = await errorAnalyzer.findRelatedErrors(errorId);
        break;

      default:
        return json({
          success: false,
          error: '不支持的分析类型',
          code: 'INVALID_ANALYSIS_TYPE',
          supportedTypes: ['trends', 'patterns', 'hotspots', 'related']
        }, { status: 400 });
    }

    return json({
      success: true,
      message: `${analysisType}分析完成`,
      data: result
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'ERROR_ANALYSIS_FAILED'
    }, { status: 500 });
  }
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

  try {
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
        return json({
          success: false,
          error: '不支持的报告类型',
          code: 'INVALID_REPORT_TYPE',
          supportedTypes: ['comprehensive', 'prevention']
        }, { status: 400 });
    }

    return json({
      success: true,
      message: `${reportType}报告生成完成`,
      data: report
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'REPORT_GENERATION_FAILED'
    }, { status: 500 });
  }
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

// 支持GET请求获取预防统计和错误分析
export const loader = withErrorHandling(async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const shopId = admin.rest.session.shop;

  const url = new URL(request.url);
  const operation = url.searchParams.get('operation');

  switch (operation) {
    case 'preventionStats':
      try {
        const timeRange = url.searchParams.get('timeRange') || '7d';
        const stats = await errorPreventionGuard.getPreventionStatistics(shopId, { timeRange });
        
        return json({
          success: true,
          data: stats
        });
      } catch (error) {
        return json({
          success: false,
          error: error.message,
          code: 'GET_PREVENTION_STATS_FAILED'
        }, { status: 500 });
      }

    case 'errorTrends':
      try {
        const timeRange = url.searchParams.get('timeRange') || '7d';
        const groupBy = url.searchParams.get('groupBy') || 'hour';
        
        const trends = await errorAnalyzer.analyzeTrends({
          shopId,
          timeRange,
          groupBy
        });
        
        return json({
          success: true,
          data: trends
        });
      } catch (error) {
        return json({
          success: false,
          error: error.message,
          code: 'GET_ERROR_TRENDS_FAILED'
        }, { status: 500 });
      }

    default:
      return json({
        success: false,
        error: '不支持的查询操作',
        code: 'INVALID_QUERY_OPERATION',
        supportedOperations: ['preventionStats', 'errorTrends']
      }, { status: 400 });
  }
});