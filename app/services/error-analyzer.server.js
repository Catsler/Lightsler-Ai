/**
 * 错误分析引擎
 * 提供错误模式识别、趋势分析、根因分析等高级分析功能
 */

import { prisma } from "../db.server";
import { areErrorsSimilar } from "../utils/error-fingerprint.server.js";
import { logger } from "../utils/logger.server.js";

/**
 * 错误分析引擎类
 */
export class ErrorAnalyzer {
  /**
   * 分析错误趋势
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 趋势分析结果
   */
  async analyzeTrends(options = {}) {
    const {
      shopId = null,
      timeRange = '7d',
      groupBy = 'hour'
    } = options;
    
    const timeFilter = this.getTimeFilter(timeRange);
    const where = {
      createdAt: timeFilter,
      ...(shopId && { shopId })
    };
    
    try {
      // 获取时间段内的所有错误
      const errors = await prisma.errorLog.findMany({
        where,
        select: {
          id: true,
          errorType: true,
          severity: true,
          createdAt: true,
          fingerprint: true,
          occurrences: true
        },
        orderBy: { createdAt: 'asc' }
      });
      
      // 按时间分组
      const timeGroups = this.groupByTime(errors, groupBy);
      
      // 计算趋势指标
      const trends = {
        timeline: timeGroups,
        totalErrors: errors.length,
        uniqueErrors: new Set(errors.map(e => e.fingerprint)).size,
        averagePerHour: this.calculateAverage(timeGroups, 'hour'),
        peakTime: this.findPeakTime(timeGroups),
        trendDirection: this.calculateTrendDirection(timeGroups),
        errorTypeDistribution: this.calculateTypeDistribution(errors),
        severityDistribution: this.calculateSeverityDistribution(errors),
        hotspots: await this.identifyHotspots(errors)
      };
      
      return trends;
    } catch (error) {
      logger.error('错误趋势分析失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 识别错误热点（频繁出现的错误）
   * @param {Array} errors - 错误列表
   * @returns {Promise<Array>} 热点错误列表
   */
  async identifyHotspots(errors) {
    // 按指纹分组计算频率
    const frequencyMap = {};
    
    for (const error of errors) {
      if (!frequencyMap[error.fingerprint]) {
        frequencyMap[error.fingerprint] = {
          fingerprint: error.fingerprint,
          count: 0,
          errorType: error.errorType,
          severity: error.severity,
          firstSeen: error.createdAt,
          lastSeen: error.createdAt
        };
      }
      
      frequencyMap[error.fingerprint].count += error.occurrences;
      frequencyMap[error.fingerprint].lastSeen = error.createdAt;
    }
    
    // 转换为数组并排序
    const hotspots = Object.values(frequencyMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // 取前10个热点
    
    // 获取详细信息
    for (const hotspot of hotspots) {
      const errorDetail = await prisma.errorLog.findFirst({
        where: { fingerprint: hotspot.fingerprint },
        select: { message: true, suggestedFix: true }
      });
      
      if (errorDetail) {
        hotspot.message = errorDetail.message;
        hotspot.suggestedFix = errorDetail.suggestedFix;
      }
    }
    
    return hotspots;
  }
  
  /**
   * 查找相关错误
   * @param {string} errorId - 错误ID
   * @returns {Promise<Array>} 相关错误列表
   */
  async findRelatedErrors(errorId) {
    try {
      // 获取原始错误
      const originalError = await prisma.errorLog.findUnique({
        where: { id: errorId }
      });
      
      if (!originalError) {
        throw new Error('错误记录不存在');
      }
      
      // 查找相关错误的策略
      const relatedErrors = [];
      
      // 1. 相同分组的错误
      if (originalError.groupId) {
        const sameGroup = await prisma.errorLog.findMany({
          where: {
            groupId: originalError.groupId,
            id: { not: errorId }
          },
          take: 5
        });
        relatedErrors.push(...sameGroup.map(e => ({
          ...e,
          relation: 'same_group'
        })));
      }
      
      // 2. 相同操作的错误
      if (originalError.operation) {
        const sameOperation = await prisma.errorLog.findMany({
          where: {
            operation: originalError.operation,
            id: { not: errorId }
          },
          take: 5
        });
        relatedErrors.push(...sameOperation.map(e => ({
          ...e,
          relation: 'same_operation'
        })));
      }
      
      // 3. 相同资源的错误
      if (originalError.resourceId) {
        const sameResource = await prisma.errorLog.findMany({
          where: {
            resourceId: originalError.resourceId,
            id: { not: errorId }
          },
          take: 5
        });
        relatedErrors.push(...sameResource.map(e => ({
          ...e,
          relation: 'same_resource'
        })));
      }
      
      // 4. 时间相近的错误（前后5分钟）
      const timeWindow = 5 * 60 * 1000; // 5分钟
      const timeBefore = new Date(originalError.createdAt.getTime() - timeWindow);
      const timeAfter = new Date(originalError.createdAt.getTime() + timeWindow);
      
      const timeRelated = await prisma.errorLog.findMany({
        where: {
          createdAt: {
            gte: timeBefore,
            lte: timeAfter
          },
          id: { not: errorId }
        },
        take: 5
      });
      relatedErrors.push(...timeRelated.map(e => ({
        ...e,
        relation: 'time_proximity'
      })));
      
      // 去重并限制数量
      const uniqueRelated = this.deduplicateErrors(relatedErrors);
      
      return uniqueRelated.slice(0, 10);
    } catch (error) {
      logger.error('查找相关错误失败', { errorId, error: error.message });
      throw error;
    }
  }
  
  /**
   * 预测错误趋势
   * @param {Object} options - 预测选项
   * @returns {Promise<Object>} 预测结果
   */
  async predictErrorTrends(options = {}) {
    const {
      shopId = null,
      lookbackDays = 7,
      predictDays = 3
    } = options;
    
    try {
      // 获取历史数据
      const historicalData = await this.getHistoricalData(shopId, lookbackDays);
      
      // 简单的线性预测
      const prediction = this.linearPrediction(historicalData, predictDays);
      
      // 识别周期性模式
      const patterns = this.identifyPatterns(historicalData);
      
      // 风险评估
      const riskAssessment = this.assessRisk(historicalData, prediction);
      
      return {
        prediction,
        patterns,
        riskAssessment,
        confidence: this.calculateConfidence(historicalData)
      };
    } catch (error) {
      logger.error('错误趋势预测失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 生成错误报告
   * @param {Object} options - 报告选项
   * @returns {Promise<Object>} 错误报告
   */
  async generateReport(options = {}) {
    const {
      shopId = null,
      timeRange = '7d',
      includeDetails = false
    } = options;
    
    try {
      const [
        stats,
        trends,
        topErrors,
        resolutionMetrics
      ] = await Promise.all([
        this.getErrorStatistics(shopId, timeRange),
        this.analyzeTrends({ shopId, timeRange }),
        this.getTopErrors(shopId, timeRange),
        this.getResolutionMetrics(shopId, timeRange)
      ]);
      
      const report = {
        generatedAt: new Date().toISOString(),
        timeRange,
        summary: {
          totalErrors: stats.total,
          uniqueErrors: stats.unique,
          resolvedErrors: stats.resolved,
          averageResolutionTime: resolutionMetrics.averageTime,
          criticalErrors: stats.critical
        },
        trends: {
          direction: trends.trendDirection,
          peakTime: trends.peakTime,
          errorRate: trends.averagePerHour
        },
        topIssues: topErrors.map(e => ({
          message: e.message,
          count: e.occurrences,
          severity: e.severity,
          status: e.status,
          suggestedFix: e.suggestedFix
        })),
        recommendations: this.generateRecommendations(stats, trends, topErrors),
        resolutionMetrics
      };
      
      if (includeDetails) {
        report.details = {
          errorTypeBreakdown: stats.byType,
          severityBreakdown: stats.bySeverity,
          statusBreakdown: stats.byStatus,
          timeline: trends.timeline
        };
      }
      
      return report;
    } catch (error) {
      logger.error('生成错误报告失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 获取错误统计
   */
  async getErrorStatistics(shopId, timeRange) {
    const timeFilter = this.getTimeFilter(timeRange);
    const where = {
      createdAt: timeFilter,
      ...(shopId && { shopId })
    };
    
    const [
      total,
      unique,
      resolved,
      critical,
      byType,
      bySeverity,
      byStatus
    ] = await Promise.all([
      prisma.errorLog.count({ where }),
      prisma.errorLog.findMany({
        where,
        distinct: ['fingerprint'],
        select: { fingerprint: true }
      }).then(r => r.length),
      prisma.errorLog.count({
        where: { ...where, status: 'resolved' }
      }),
      prisma.errorLog.count({
        where: { ...where, severity: { gte: 4 } }
      }),
      prisma.errorLog.groupBy({
        by: ['errorType'],
        where,
        _count: true
      }),
      prisma.errorLog.groupBy({
        by: ['severity'],
        where,
        _count: true
      }),
      prisma.errorLog.groupBy({
        by: ['status'],
        where,
        _count: true
      })
    ]);
    
    return {
      total,
      unique,
      resolved,
      critical,
      byType: this.groupByToObject(byType, 'errorType'),
      bySeverity: this.groupByToObject(bySeverity, 'severity'),
      byStatus: this.groupByToObject(byStatus, 'status')
    };
  }
  
  /**
   * 获取最频繁的错误
   */
  async getTopErrors(shopId, timeRange, limit = 10) {
    const timeFilter = this.getTimeFilter(timeRange);
    const where = {
      createdAt: timeFilter,
      ...(shopId && { shopId })
    };
    
    return await prisma.errorLog.findMany({
      where,
      orderBy: { occurrences: 'desc' },
      take: limit
    });
  }
  
  /**
   * 获取解决指标
   */
  async getResolutionMetrics(shopId, timeRange) {
    const timeFilter = this.getTimeFilter(timeRange);
    const where = {
      createdAt: timeFilter,
      status: 'resolved',
      ...(shopId && { shopId })
    };
    
    const resolvedErrors = await prisma.errorLog.findMany({
      where,
      select: {
        createdAt: true,
        resolvedAt: true
      }
    });
    
    if (resolvedErrors.length === 0) {
      return {
        totalResolved: 0,
        averageTime: 0,
        medianTime: 0,
        fastestResolution: 0,
        slowestResolution: 0
      };
    }
    
    const resolutionTimes = resolvedErrors
      .filter(e => e.resolvedAt)
      .map(e => e.resolvedAt.getTime() - e.createdAt.getTime());
    
    resolutionTimes.sort((a, b) => a - b);
    
    return {
      totalResolved: resolvedErrors.length,
      averageTime: resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length,
      medianTime: resolutionTimes[Math.floor(resolutionTimes.length / 2)],
      fastestResolution: resolutionTimes[0],
      slowestResolution: resolutionTimes[resolutionTimes.length - 1]
    };
  }
  
  /**
   * 生成改进建议
   */
  generateRecommendations(stats, trends, topErrors) {
    const recommendations = [];
    
    // 基于错误趋势的建议
    if (trends.trendDirection === 'increasing') {
      recommendations.push({
        priority: 'high',
        category: 'trend',
        suggestion: '错误呈上升趋势，建议立即调查最近的代码变更或系统配置更改'
      });
    }
    
    // 基于严重错误的建议
    if (stats.critical > 5) {
      recommendations.push({
        priority: 'critical',
        category: 'severity',
        suggestion: `发现${stats.critical}个严重错误，建议优先处理这些问题`
      });
    }
    
    // 基于错误类型的建议
    if (stats.byType.API > stats.total * 0.5) {
      recommendations.push({
        priority: 'high',
        category: 'type',
        suggestion: 'API错误占比超过50%，建议检查API服务状态和限流配置'
      });
    }
    
    if (stats.byType.DB > stats.total * 0.3) {
      recommendations.push({
        priority: 'medium',
        category: 'type',
        suggestion: '数据库错误较多，建议检查数据库连接和查询性能'
      });
    }
    
    // 基于解决率的建议
    const resolveRate = stats.resolved / stats.total;
    if (resolveRate < 0.5) {
      recommendations.push({
        priority: 'medium',
        category: 'resolution',
        suggestion: '错误解决率低于50%，建议加强错误处理流程'
      });
    }
    
    // 基于热点错误的建议
    for (const error of topErrors.slice(0, 3)) {
      if (error.occurrences > 100) {
        recommendations.push({
          priority: 'high',
          category: 'frequency',
          suggestion: `"${error.message.substring(0, 50)}..." 出现${error.occurrences}次，建议优先修复`,
          errorId: error.id
        });
      }
    }
    
    return recommendations;
  }
  
  // 辅助方法
  
  /**
   * 获取时间过滤器
   */
  getTimeFilter(timeRange) {
    const now = new Date();
    let since;
    
    const rangeMap = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    const duration = rangeMap[timeRange] || rangeMap['24h'];
    since = new Date(now - duration);
    
    return { gte: since };
  }
  
  /**
   * 按时间分组
   */
  groupByTime(errors, groupBy) {
    const groups = {};
    
    for (const error of errors) {
      const key = this.getTimeKey(error.createdAt, groupBy);
      if (!groups[key]) {
        groups[key] = {
          time: key,
          count: 0,
          errors: []
        };
      }
      groups[key].count += error.occurrences;
      groups[key].errors.push(error.id);
    }
    
    return Object.values(groups).sort((a, b) => 
      new Date(a.time) - new Date(b.time)
    );
  }
  
  /**
   * 获取时间键
   */
  getTimeKey(date, groupBy) {
    const d = new Date(date);
    
    switch (groupBy) {
      case 'minute':
        d.setSeconds(0, 0);
        break;
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      default:
        d.setMinutes(0, 0, 0);
    }
    
    return d.toISOString();
  }
  
  /**
   * 计算平均值
   */
  calculateAverage(timeGroups, unit) {
    if (timeGroups.length === 0) return 0;
    
    const totalCount = timeGroups.reduce((sum, g) => sum + g.count, 0);
    return totalCount / timeGroups.length;
  }
  
  /**
   * 查找峰值时间
   */
  findPeakTime(timeGroups) {
    if (timeGroups.length === 0) return null;
    
    const peak = timeGroups.reduce((max, g) => 
      g.count > max.count ? g : max
    );
    
    return {
      time: peak.time,
      count: peak.count
    };
  }
  
  /**
   * 计算趋势方向
   */
  calculateTrendDirection(timeGroups) {
    if (timeGroups.length < 2) return 'stable';
    
    // 简单的线性回归
    const n = timeGroups.length;
    const sumX = n * (n - 1) / 2;
    const sumY = timeGroups.reduce((sum, g) => sum + g.count, 0);
    const sumXY = timeGroups.reduce((sum, g, i) => sum + i * g.count, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    if (Math.abs(slope) < 0.1) return 'stable';
    return slope > 0 ? 'increasing' : 'decreasing';
  }
  
  /**
   * 计算类型分布
   */
  calculateTypeDistribution(errors) {
    const distribution = {};
    
    for (const error of errors) {
      if (!distribution[error.errorType]) {
        distribution[error.errorType] = 0;
      }
      distribution[error.errorType] += error.occurrences;
    }
    
    return distribution;
  }
  
  /**
   * 计算严重程度分布
   */
  calculateSeverityDistribution(errors) {
    const distribution = {};
    
    for (const error of errors) {
      const key = `level_${error.severity}`;
      if (!distribution[key]) {
        distribution[key] = 0;
      }
      distribution[key] += error.occurrences;
    }
    
    return distribution;
  }
  
  /**
   * 去重错误列表
   */
  deduplicateErrors(errors) {
    const seen = new Set();
    return errors.filter(error => {
      if (seen.has(error.id)) {
        return false;
      }
      seen.add(error.id);
      return true;
    });
  }
  
  /**
   * 获取历史数据
   */
  async getHistoricalData(shopId, days) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const where = {
      createdAt: { gte: since },
      ...(shopId && { shopId })
    };
    
    const errors = await prisma.errorLog.findMany({
      where,
      select: {
        createdAt: true,
        occurrences: true
      },
      orderBy: { createdAt: 'asc' }
    });
    
    // 按天分组
    const dailyData = {};
    
    for (const error of errors) {
      const day = error.createdAt.toISOString().split('T')[0];
      if (!dailyData[day]) {
        dailyData[day] = 0;
      }
      dailyData[day] += error.occurrences;
    }
    
    return Object.entries(dailyData).map(([date, count]) => ({
      date,
      count
    }));
  }
  
  /**
   * 线性预测
   */
  linearPrediction(historicalData, predictDays) {
    if (historicalData.length < 2) {
      return [];
    }
    
    // 计算平均日增长率
    const counts = historicalData.map(d => d.count);
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    
    // 简单预测：使用平均值
    const predictions = [];
    const lastDate = new Date(historicalData[historicalData.length - 1].date);
    
    for (let i = 1; i <= predictDays; i++) {
      const predictDate = new Date(lastDate);
      predictDate.setDate(predictDate.getDate() + i);
      
      predictions.push({
        date: predictDate.toISOString().split('T')[0],
        count: Math.round(avgCount),
        confidence: 0.7 - (i * 0.1) // 随时间降低置信度
      });
    }
    
    return predictions;
  }
  
  /**
   * 识别模式
   */
  identifyPatterns(historicalData) {
    const patterns = [];
    
    if (historicalData.length < 7) {
      return patterns;
    }
    
    // 检查周期性（每周模式）
    const weeklyPattern = this.checkWeeklyPattern(historicalData);
    if (weeklyPattern) {
      patterns.push(weeklyPattern);
    }
    
    // 检查趋势
    const trend = this.checkTrend(historicalData);
    if (trend) {
      patterns.push(trend);
    }
    
    return patterns;
  }
  
  /**
   * 检查每周模式
   */
  checkWeeklyPattern(data) {
    // 简化实现：检查是否有明显的周期性
    if (data.length >= 14) {
      const week1 = data.slice(0, 7).map(d => d.count);
      const week2 = data.slice(7, 14).map(d => d.count);
      
      // 计算相关性
      const correlation = this.calculateCorrelation(week1, week2);
      
      if (correlation > 0.7) {
        return {
          type: 'weekly',
          confidence: correlation,
          description: '检测到每周重复模式'
        };
      }
    }
    
    return null;
  }
  
  /**
   * 检查趋势
   */
  checkTrend(data) {
    const counts = data.map(d => d.count);
    const avgFirst = counts.slice(0, Math.floor(counts.length / 2))
      .reduce((a, b) => a + b, 0) / Math.floor(counts.length / 2);
    const avgSecond = counts.slice(Math.floor(counts.length / 2))
      .reduce((a, b) => a + b, 0) / (counts.length - Math.floor(counts.length / 2));
    
    const change = (avgSecond - avgFirst) / avgFirst;
    
    if (Math.abs(change) > 0.2) {
      return {
        type: 'trend',
        direction: change > 0 ? 'increasing' : 'decreasing',
        change: Math.abs(change),
        description: `错误率${change > 0 ? '上升' : '下降'}${(Math.abs(change) * 100).toFixed(1)}%`
      };
    }
    
    return null;
  }
  
  /**
   * 计算相关性
   */
  calculateCorrelation(arr1, arr2) {
    if (arr1.length !== arr2.length) return 0;
    
    const n = arr1.length;
    const sum1 = arr1.reduce((a, b) => a + b, 0);
    const sum2 = arr2.reduce((a, b) => a + b, 0);
    const sum1Sq = arr1.reduce((a, b) => a + b * b, 0);
    const sum2Sq = arr2.reduce((a, b) => a + b * b, 0);
    const pSum = arr1.reduce((a, b, i) => a + b * arr2[i], 0);
    
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
    
    if (den === 0) return 0;
    return num / den;
  }
  
  /**
   * 风险评估
   */
  assessRisk(historicalData, prediction) {
    const recentAvg = historicalData.slice(-3)
      .reduce((sum, d) => sum + d.count, 0) / 3;
    
    const predictedAvg = prediction.length > 0
      ? prediction.reduce((sum, p) => sum + p.count, 0) / prediction.length
      : 0;
    
    let riskLevel = 'low';
    let riskScore = 0;
    
    if (predictedAvg > recentAvg * 1.5) {
      riskLevel = 'high';
      riskScore = 3;
    } else if (predictedAvg > recentAvg * 1.2) {
      riskLevel = 'medium';
      riskScore = 2;
    } else {
      riskLevel = 'low';
      riskScore = 1;
    }
    
    return {
      level: riskLevel,
      score: riskScore,
      description: `预测错误率${riskLevel === 'high' ? '显著' : riskLevel === 'medium' ? '轻微' : ''}${predictedAvg > recentAvg ? '上升' : '稳定'}`,
      recommendation: riskLevel === 'high' ? '建议立即采取预防措施' : '继续监控'
    };
  }
  
  /**
   * 计算置信度
   */
  calculateConfidence(historicalData) {
    if (historicalData.length < 3) return 0.3;
    if (historicalData.length < 7) return 0.5;
    if (historicalData.length < 14) return 0.7;
    return 0.9;
  }
  
  /**
   * GroupBy结果转换为对象
   */
  groupByToObject(groupByResult, field) {
    return groupByResult.reduce((acc, item) => {
      acc[item[field]] = item._count;
      return acc;
    }, {});
  }
}

// 创建单例实例
export const errorAnalyzer = new ErrorAnalyzer();

// 导出便捷函数
export const analyzeTrends = (options) => errorAnalyzer.analyzeTrends(options);
export const findRelatedErrors = (errorId) => errorAnalyzer.findRelatedErrors(errorId);
export const predictErrorTrends = (options) => errorAnalyzer.predictErrorTrends(options);
export const generateErrorReport = (options) => errorAnalyzer.generateReport(options);

export default errorAnalyzer;