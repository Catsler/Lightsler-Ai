/**
 * 日志搜索和过滤API
 * 提供高级日志查询功能
 */

import { prisma } from '../db.server';
import { createApiRoute } from '../utils/base-route.server.js';

/**
 * GET请求处理函数 - 搜索和过滤日志
 */
async function handleLogsSearch({ request, session, searchParams }) {
  const shop = session.shop;
  
  // 解析查询参数
  const params = {
    // 基本过滤
    type: searchParams.get('type') || null, // 日志类型
    level: searchParams.get('level') || null, // 日志级别
    category: searchParams.get('category') || null, // 日志分类
    resourceType: searchParams.get('resourceType') || null,
    resourceId: searchParams.get('resourceId') || null,
    
    // Time range
    startDate: searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate'))
      : new Date(Date.now() - 24 * 60 * 60 * 1000), // 默认24小时
    endDate: searchParams.get('endDate')
      ? new Date(searchParams.get('endDate'))
      : new Date(),
    
    // 搜索关键词
    search: searchParams.get('search') || null,
    
    // Pagination
    page: parseInt(searchParams.get('page') || '1'),
    pageSize: parseInt(searchParams.get('pageSize') || '50'),
    
    // Sorting
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: searchParams.get('sortOrder') || 'desc',
    
    // Aggregation options
    aggregate: searchParams.get('aggregate') === 'true',
    groupBy: searchParams.get('groupBy') || null
  };
  
  // Validate params
  if (params.pageSize > 200) {
    throw new Error('每页最多200条记录');
  }
  
  // Build query conditions
  const where = buildWhereClause(params, shop);
  
  // If aggregation
  if (params.aggregate && params.groupBy) {
    const aggregatedData = await getAggregatedLogs(where, params.groupBy);
    return {
      type: 'aggregated',
      groupBy: params.groupBy,
      data: aggregatedData,
      params
    };
  }
  
  // Execute query
  const [logs, total] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { [params.sortBy]: params.sortOrder },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        errorType: true,
        errorCategory: true,
        errorCode: true,
        message: true,
        resourceType: true,
        resourceId: true,
        severity: true,
        status: true,
        occurrences: true,
        createdAt: true,
        lastSeenAt: true,
        context: true,
        suggestedFix: true,
        rootCause: true
      }
    }),
    prisma.errorLog.count({ where })
  ]);
  
  // Process logs
  const formattedLogs = logs.map(log => ({
    ...log,
    level: mapSeverityToLevel(log.severity),
    tags: extractTags(log),
    summary: generateLogSummary(log)
  }));
  
  // Generate stats
  const stats = await generateLogStats(where);
  
  return {
    type: 'paginated',
    logs: formattedLogs,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.ceil(total / params.pageSize)
    },
    stats,
    params
  };
}

export const loader = createApiRoute(handleLogsSearch, {
  requireAuth: true,
  operationName: '搜索日志'
});

/**
 * POST请求处理函数 - 日志操作
 */
async function handleLogsAction({ request, session }) {
  const shop = session.shop;
  
  const formData = await request.formData();
  const action = formData.get('action');
  
  if (action === 'export') {
    return await exportLogs(formData, shop);
  } else if (action === 'analyze') {
    return await analyzeLogs(formData, shop);
  } else if (action === 'report') {
    return await generateReport(formData, shop);
  }
  
  throw new Error('无效的操作');
}

export const action = createApiRoute(handleLogsAction, {
  requireAuth: true,
  operationName: '日志操作'
});

// Build query conditions
function buildWhereClause(params, shop) {
  const where = {
    shopId: shop
  };
  
  // Time range
  where.createdAt = {
    gte: params.startDate,
    lte: params.endDate
  };
  
  // Type filter
  if (params.type) {
    where.errorType = params.type;
  }
  
  // Level filter via severity map
  if (params.level) {
    where.severity = mapLevelToSeverity(params.level);
  }
  
  // Category filter
  if (params.category) {
    where.errorCategory = params.category;
  }
  
  // Resource filter
  if (params.resourceType) {
    where.resourceType = params.resourceType;
  }
  
  if (params.resourceId) {
    where.resourceId = params.resourceId;
  }
  
  // Keyword search
  if (params.search) {
    where.OR = [
      { message: { contains: params.search, mode: 'insensitive' } },
      { errorCode: { contains: params.search, mode: 'insensitive' } },
      { suggestedFix: { contains: params.search, mode: 'insensitive' } },
      { rootCause: { contains: params.search, mode: 'insensitive' } }
    ];
  }
  
  return where;
}

// Get aggregated logs
async function getAggregatedLogs(where, groupBy) {
  const validGroupByFields = [
    'errorType', 'errorCategory', 'errorCode', 
    'resourceType', 'severity', 'status'
  ];
  
  if (!validGroupByFields.includes(groupBy)) {
    throw new Error(`无效的分组字段: ${groupBy}`);
  }
  
  const aggregated = await prisma.errorLog.groupBy({
    by: [groupBy],
    where,
    _count: {
      _all: true
    },
    _avg: {
      severity: true,
      occurrences: true
    },
    _max: {
      createdAt: true,
      lastSeenAt: true
    },
    _min: {
      createdAt: true
    }
  });
  
  return aggregated.map(group => ({
    [groupBy]: group[groupBy],
    count: group._count._all,
    avgSeverity: group._avg.severity,
    avgOccurrences: group._avg.occurrences,
    firstSeen: group._min.createdAt,
    lastSeen: group._max.lastSeenAt || group._max.createdAt
  }));
}

// Generate log stats
async function generateLogStats(where) {
  const [
    byType,
    bySeverity,
    byStatus,
    topErrors
  ] = await Promise.all([
    // 按类型统计
    prisma.errorLog.groupBy({
      by: ['errorType'],
      where,
      _count: true
    }),
    
    // 按严重度统计
    prisma.errorLog.groupBy({
      by: ['severity'],
      where,
      _count: true
    }),
    
    // 按状态统计
    prisma.errorLog.groupBy({
      by: ['status'],
      where,
      _count: true
    }),
    
    // Top错误
    prisma.errorLog.findMany({
      where,
      orderBy: { occurrences: 'desc' },
      take: 5,
      select: {
        errorCode: true,
        message: true,
        occurrences: true,
        severity: true
      }
    })
  ]);
  
  return {
    byType: byType.reduce((acc, item) => {
      acc[item.errorType] = item._count;
      return acc;
    }, {}),
    bySeverity: bySeverity.reduce((acc, item) => {
      acc[`level_${item.severity}`] = item._count;
      return acc;
    }, {}),
    byStatus: byStatus.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {}),
    topErrors
  };
}

// Export logs
async function exportLogs(formData, shop) {
  const format = formData.get('format') || 'json';
  const filters = JSON.parse(formData.get('filters') || '{}');
  
  const where = buildWhereClause(filters, shop);
  
  const logs = await prisma.errorLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10000 // 最多导出10000条
  });
  
  let exportData;
  
  switch (format) {
    case 'csv':
      exportData = convertToCSV(logs);
      break;
    case 'json':
      exportData = JSON.stringify(logs, null, 2);
      break;
    case 'summary':
      exportData = await generateSummaryReport(logs, where);
      break;
    default:
      throw new Error('不支持的导出格式');
  }
  
  return {
    format,
    data: exportData,
    count: logs.length,
    exportedAt: new Date()
  };
}

// Analyze logs
async function analyzeLogs(formData, shop) {
  const filters = JSON.parse(formData.get('filters') || '{}');
  const analysisType = formData.get('analysisType') || 'patterns';
  
  const where = buildWhereClause(filters, shop);
  
  const logs = await prisma.errorLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 1000
  });
  
  let analysis;
  
  switch (analysisType) {
    case 'patterns':
      analysis = analyzeErrorPatterns(logs);
      break;
    case 'trends':
      analysis = analyzeErrorTrends(logs);
      break;
    case 'correlations':
      analysis = analyzeCorrelations(logs);
      break;
    case 'impact':
      analysis = analyzeBusinessImpact(logs);
      break;
    default:
      throw new Error('不支持的分析类型');
  }
  
  return {
    analysisType,
    analysis,
    logsAnalyzed: logs.length,
    timestamp: new Date()
  };
}

// 生成报告
async function generateReport(formData, shop) {
  const reportType = formData.get('reportType') || 'daily';
  const date = formData.get('date') ? new Date(formData.get('date')) : new Date();
  
  let startDate, endDate;
  
  switch (reportType) {
    case 'daily':
      startDate = new Date(date.setHours(0, 0, 0, 0));
      endDate = new Date(date.setHours(23, 59, 59, 999));
      break;
    case 'weekly':
      startDate = new Date(date.setDate(date.getDate() - date.getDay()));
      endDate = new Date(date.setDate(date.getDate() + 6));
      break;
    case 'monthly':
      startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      break;
    default:
      throw new Error('不支持的报告类型');
  }
  
  const where = {
    shopId: shop,
    createdAt: { gte: startDate, lte: endDate }
  };
  
  const [stats, trends, topIssues] = await Promise.all([
    generateLogStats(where),
    generateTrendData(where),
    getTopIssues(where)
  ]);
  
  return {
    reportType,
    period: { start: startDate, end: endDate },
    stats,
    trends,
    topIssues,
    generatedAt: new Date()
  };
}

// Helper: map severity to level
function mapSeverityToLevel(severity) {
  const levels = ['debug', 'info', 'warning', 'error', 'critical'];
  return levels[severity - 1] || 'info';
}

// Helper: map level to severity
function mapLevelToSeverity(level) {
  const severityMap = {
    debug: 1,
    info: 2,
    warning: 3,
    error: 4,
    critical: 5
  };
  return severityMap[level.toLowerCase()] || 2;
}

// Helper: extract tags
function extractTags(log) {
  const tags = [];
  
  if (log.errorType) tags.push(log.errorType);
  if (log.resourceType) tags.push(`resource:${log.resourceType}`);
  if (log.severity >= 4) tags.push('high-severity');
  if (log.occurrences > 10) tags.push('frequent');
  if (log.status === 'new') tags.push('unresolved');
  
  // Extract extra tags from context
  if (log.context && typeof log.context === 'object') {
    if (log.context.tags && Array.isArray(log.context.tags)) {
      tags.push(...log.context.tags);
    }
  }
  
  return [...new Set(tags)]; // 去重
}

// Helper: generate log summary
function generateLogSummary(log) {
  const parts = [];
  
  if (log.errorCode) parts.push(`[${log.errorCode}]`);
  if (log.resourceType) parts.push(`${log.resourceType}`);
  if (log.occurrences > 1) parts.push(`(${log.occurrences}次)`);
  
  return parts.join(' ');
}

// Helper: convert to CSV
function convertToCSV(logs) {
  const headers = [
    'ID', '时间', '类型', '分类', '错误码', 
    '消息', '资源类型', '资源ID', '严重度', 
    '状态', '出现次数'
  ];
  
  const rows = logs.map(log => [
    log.id,
    log.createdAt,
    log.errorType,
    log.errorCategory,
    log.errorCode,
    log.message,
    log.resourceType || '',
    log.resourceId || '',
    log.severity,
    log.status,
    log.occurrences
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => 
      typeof cell === 'string' && cell.includes(',') 
        ? `"${cell.replace(/"/g, '""')}"` 
        : cell
    ).join(','))
  ].join('\n');
  
  return csvContent;
}

// Helper: analyze error patterns
function analyzeErrorPatterns(logs) {
  const patterns = {};
  
  logs.forEach(log => {
    const key = `${log.errorType}_${log.errorCode}`;
    if (!patterns[key]) {
      patterns[key] = {
        type: log.errorType,
        code: log.errorCode,
        count: 0,
        examples: [],
        avgSeverity: 0,
        resources: new Set()
      };
    }
    
    patterns[key].count++;
    patterns[key].avgSeverity += log.severity;
    if (patterns[key].examples.length < 3) {
      patterns[key].examples.push(log.message);
    }
    if (log.resourceType) {
      patterns[key].resources.add(log.resourceType);
    }
  });
  
  // 转换和排序
  return Object.values(patterns)
    .map(p => ({
      ...p,
      avgSeverity: p.avgSeverity / p.count,
      resources: Array.from(p.resources)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// Helper: analyze error trends
function analyzeErrorTrends(logs) {
  const hourlyTrends = {};
  
  logs.forEach(log => {
    const hour = new Date(log.createdAt).getHours();
    if (!hourlyTrends[hour]) {
      hourlyTrends[hour] = { count: 0, severity: 0 };
    }
    hourlyTrends[hour].count++;
    hourlyTrends[hour].severity += log.severity;
  });
  
  return Object.entries(hourlyTrends).map(([hour, data]) => ({
    hour: parseInt(hour),
    count: data.count,
    avgSeverity: data.severity / data.count
  }));
}

// Helper: analyze correlation
function analyzeCorrelations(logs) {
  const correlations = [];
  
  // Analyze correlation of resource type and error type
  const resourceErrorMap = {};
  logs.forEach(log => {
    if (log.resourceType && log.errorType) {
      const key = `${log.resourceType}_${log.errorType}`;
      resourceErrorMap[key] = (resourceErrorMap[key] || 0) + 1;
    }
  });
  
  Object.entries(resourceErrorMap).forEach(([key, count]) => {
    const [resourceType, errorType] = key.split('_');
    if (count > 5) {
      correlations.push({
        resourceType,
        errorType,
        correlation: count,
        strength: count > 20 ? 'strong' : count > 10 ? 'medium' : 'weak'
      });
    }
  });
  
  return correlations.sort((a, b) => b.correlation - a.correlation);
}

// Helper: analyze business impact
function analyzeBusinessImpact(logs) {
  let totalImpact = 0;
  const impactByType = {};
  const criticalErrors = [];
  
  logs.forEach(log => {
    // Calculate impact score
    const impactScore = log.severity * log.occurrences;
    totalImpact += impactScore;
    
    if (!impactByType[log.errorType]) {
      impactByType[log.errorType] = 0;
    }
    impactByType[log.errorType] += impactScore;
    
    // Collect critical errors
    if (log.severity >= 4 && log.occurrences > 5) {
      criticalErrors.push({
        message: log.message,
        impact: impactScore,
        suggestedFix: log.suggestedFix
      });
    }
  });
  
  return {
    totalImpact,
    impactByType,
    criticalErrors: criticalErrors.sort((a, b) => b.impact - a.impact).slice(0, 10),
    riskLevel: totalImpact > 1000 ? 'high' : totalImpact > 500 ? 'medium' : 'low'
  };
}

// Helper: generate trend data
async function generateTrendData(where) {
  // 获取时间范围内的日志
  const logs = await prisma.errorLog.findMany({
    where,
    select: {
      createdAt: true,
      severity: true,
      errorType: true
    }
  });
  
  // Group by day
  const dailyData = {};
  logs.forEach(log => {
    const date = new Date(log.createdAt).toISOString().split('T')[0];
    if (!dailyData[date]) {
      dailyData[date] = {
        count: 0,
        errors: 0,
        warnings: 0,
        info: 0
      };
    }
    
    dailyData[date].count++;
    if (log.severity >= 4) dailyData[date].errors++;
    else if (log.severity === 3) dailyData[date].warnings++;
    else dailyData[date].info++;
  });
  
  return Object.entries(dailyData).map(([date, data]) => ({
    date,
    ...data
  }));
}

// Helper: get top issues
async function getTopIssues(where) {
  return await prisma.errorLog.findMany({
    where,
    orderBy: [
      { severity: 'desc' },
      { occurrences: 'desc' }
    ],
    take: 10,
    select: {
      id: true,
      errorCode: true,
      message: true,
      severity: true,
      occurrences: true,
      status: true,
      suggestedFix: true
    }
  });
}

// Helper: generate summary report
async function generateSummaryReport(logs, where) {
  const stats = await generateLogStats(where);
  
  const summary = {
    period: {
      start: logs[logs.length - 1]?.createdAt,
      end: logs[0]?.createdAt
    },
    totalLogs: logs.length,
    stats,
    severityDistribution: {},
    typeDistribution: {},
    statusDistribution: {},
    topMessages: [],
    recommendations: []
  };
  
  // Analyze distribution
  logs.forEach(log => {
    // 严重度分布
    const level = mapSeverityToLevel(log.severity);
    summary.severityDistribution[level] = (summary.severityDistribution[level] || 0) + 1;
    
    // 类型分布
    summary.typeDistribution[log.errorType] = (summary.typeDistribution[log.errorType] || 0) + 1;
    
    // 状态分布
    summary.statusDistribution[log.status] = (summary.statusDistribution[log.status] || 0) + 1;
  });
  
  // Top消息
  const messageCount = {};
  logs.forEach(log => {
    const key = log.message.substring(0, 100);
    messageCount[key] = (messageCount[key] || 0) + 1;
  });
  
  summary.topMessages = Object.entries(messageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));
  
  // 生成建议
  if (summary.severityDistribution.critical > 10) {
    summary.recommendations.push('存在大量严重错误，建议立即排查');
  }
  if (summary.statusDistribution.new > logs.length * 0.5) {
    summary.recommendations.push('超过50%的错误未处理，建议及时处理');
  }
  if (summary.typeDistribution.TRANSLATION > logs.length * 0.3) {
    summary.recommendations.push('翻译错误较多，建议检查翻译服务配置');
  }
  
  return summary;
}