/**
 * 性能监控服务
 * 收集和分析系统性能指标
 */

import { prisma } from '../db.server.js';
import { logger } from '../utils/logger.server.js';

// 性能指标类型
export const METRIC_TYPES = {
  TRANSLATION_TIME: 'TRANSLATION_TIME',
  API_RESPONSE_TIME: 'API_RESPONSE_TIME',
  DB_QUERY_TIME: 'DB_QUERY_TIME',
  QUEUE_PROCESSING_TIME: 'QUEUE_PROCESSING_TIME',
  MEMORY_USAGE: 'MEMORY_USAGE',
  CPU_USAGE: 'CPU_USAGE',
  THROUGHPUT: 'THROUGHPUT'
};

// 性能追踪器
class PerformanceTracker {
  constructor(name, type = METRIC_TYPES.TRANSLATION_TIME) {
    this.name = name;
    this.type = type;
    this.startTime = null;
    this.endTime = null;
    this.metadata = {};
  }
  
  start(metadata = {}) {
    this.startTime = process.hrtime.bigint();
    this.metadata = metadata;
    return this;
  }
  
  end() {
    if (!this.startTime) {
      throw new Error('Performance tracker not started');
    }
    
    this.endTime = process.hrtime.bigint();
    const duration = Number(this.endTime - this.startTime) / 1000000; // 转换为毫秒
    
    // 记录性能数据
    performanceMonitor.record(this.type, this.name, duration, this.metadata);
    
    return duration;
  }
  
  async measure(fn, metadata = {}) {
    this.start(metadata);
    try {
      const result = await fn();
      const duration = this.end();
      return { result, duration };
    } catch (error) {
      this.end();
      throw error;
    }
  }
}

// 性能监控器
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.aggregateInterval = 60000; // 1分钟聚合一次
    this.aggregateTimer = null;
    this.bufferSize = 1000;
    this.thresholds = this.initializeThresholds();
  }
  
  initializeThresholds() {
    return {
      [METRIC_TYPES.TRANSLATION_TIME]: {
        warning: 3000,
        critical: 5000
      },
      [METRIC_TYPES.API_RESPONSE_TIME]: {
        warning: 2000,
        critical: 4000
      },
      [METRIC_TYPES.DB_QUERY_TIME]: {
        warning: 500,
        critical: 1000
      },
      [METRIC_TYPES.QUEUE_PROCESSING_TIME]: {
        warning: 10000,
        critical: 30000
      }
    };
  }
  
  // 记录性能指标
  record(type, name, value, metadata = {}) {
    const key = `${type}:${name}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        type,
        name,
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        metadata: []
      });
    }
    
    const metric = this.metrics.get(key);
    
    // 更新统计数据
    metric.values.push(value);
    metric.count++;
    metric.sum += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.metadata.push({
      value,
      timestamp: new Date(),
      ...metadata
    });
    
    // 限制缓冲区大小
    if (metric.values.length > this.bufferSize) {
      metric.values.shift();
      metric.metadata.shift();
    }
    
    // 检查阈值
    this.checkThreshold(type, name, value);
    
    // 记录到日志
    logger.debug(`性能指标: ${name}`, {
      type,
      value,
      metadata
    });
  }
  
  // 检查阈值
  checkThreshold(type, name, value) {
    const threshold = this.thresholds[type];
    if (!threshold) return;
    
    if (value > threshold.critical) {
      logger.error(`性能严重下降: ${name}`, {
        type,
        value,
        threshold: threshold.critical,
        severity: 'critical'
      });
    } else if (value > threshold.warning) {
      logger.warn(`性能下降: ${name}`, {
        type,
        value,
        threshold: threshold.warning,
        severity: 'warning'
      });
    }
  }
  
  // 获取统计数据
  getStats(type = null, name = null) {
    const results = [];
    
    for (const [key, metric] of this.metrics.entries()) {
      if (type && metric.type !== type) continue;
      if (name && metric.name !== name) continue;
      
      const avg = metric.count > 0 ? metric.sum / metric.count : 0;
      const p50 = this.calculatePercentile(metric.values, 50);
      const p95 = this.calculatePercentile(metric.values, 95);
      const p99 = this.calculatePercentile(metric.values, 99);
      
      results.push({
        type: metric.type,
        name: metric.name,
        count: metric.count,
        avg: Math.round(avg),
        min: Math.round(metric.min),
        max: Math.round(metric.max),
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
        recent: metric.values.slice(-10).map(v => Math.round(v))
      });
    }
    
    return results;
  }
  
  // 计算百分位数
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  
  // 启动聚合
  startAggregation() {
    this.aggregateTimer = setInterval(() => {
      this.aggregate();
    }, this.aggregateInterval);
  }
  
  // 停止聚合
  stopAggregation() {
    if (this.aggregateTimer) {
      clearInterval(this.aggregateTimer);
      this.aggregateTimer = null;
    }
  }
  
  // 聚合并持久化指标
  async aggregate() {
    const stats = this.getStats();
    
    for (const stat of stats) {
      // 保存到日志系统
      logger.info('性能指标聚合', stat);
      
      // 如果性能异常，创建告警
      if (stat.p95 > (this.thresholds[stat.type]?.critical || Infinity)) {
        await this.createPerformanceAlert(stat);
      }
    }
    
    // 清理旧数据
    this.cleanup();
  }
  
  // 创建性能告警
  async createPerformanceAlert(stat) {
    logger.error('性能告警', {
      type: stat.type,
      name: stat.name,
      p95: stat.p95,
      p99: stat.p99,
      max: stat.max,
      message: `${stat.name} P95响应时间 ${stat.p95}ms，超过阈值`
    });
  }
  
  // 清理旧数据
  cleanup() {
    const maxAge = 60 * 60 * 1000; // 1小时
    const now = Date.now();
    
    for (const metric of this.metrics.values()) {
      metric.metadata = metric.metadata.filter(m => 
        now - m.timestamp.getTime() < maxAge
      );
      
      // 如果没有最近的数据，重置统计
      if (metric.metadata.length === 0) {
        metric.values = [];
        metric.count = 0;
        metric.sum = 0;
        metric.min = Infinity;
        metric.max = -Infinity;
      }
    }
  }
  
  // 创建追踪器
  createTracker(name, type = METRIC_TYPES.TRANSLATION_TIME) {
    return new PerformanceTracker(name, type);
  }
  
  // 测量异步函数性能
  async measure(name, fn, type = METRIC_TYPES.TRANSLATION_TIME, metadata = {}) {
    const tracker = this.createTracker(name, type);
    return await tracker.measure(fn, metadata);
  }
  
  // 测量数据库查询
  async measureDbQuery(name, queryFn) {
    return await this.measure(name, queryFn, METRIC_TYPES.DB_QUERY_TIME);
  }
  
  // 测量API调用
  async measureApiCall(name, apiFn) {
    return await this.measure(name, apiFn, METRIC_TYPES.API_RESPONSE_TIME);
  }
  
  // 获取系统资源使用情况
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000), // ms
        system: Math.round(cpuUsage.system / 1000)
      },
      uptime: Math.round(process.uptime()),
      pid: process.pid
    };
  }
  
  // 获取吞吐量统计
  async getThroughputStats(duration = 60000) {
    const since = new Date(Date.now() - duration);
    
    const [
      translationsCount,
      apiCallsCount,
      dbQueriesCount
    ] = await Promise.all([
      prisma.translation.count({
        where: { createdAt: { gte: since } }
      }),
      prisma.errorLog.count({
        where: {
          createdAt: { gte: since },
          errorType: 'API'
        }
      }),
      // 模拟数据库查询计数
      Promise.resolve(100)
    ]);
    
    const durationInSeconds = duration / 1000;
    
    return {
      translations: {
        count: translationsCount,
        perSecond: (translationsCount / durationInSeconds).toFixed(2)
      },
      apiCalls: {
        count: apiCallsCount,
        perSecond: (apiCallsCount / durationInSeconds).toFixed(2)
      },
      dbQueries: {
        count: dbQueriesCount,
        perSecond: (dbQueriesCount / durationInSeconds).toFixed(2)
      }
    };
  }
  
  // 获取性能报告
  async getPerformanceReport() {
    const stats = this.getStats();
    const systemMetrics = this.getSystemMetrics();
    const throughput = await this.getThroughputStats();
    
    return {
      timestamp: new Date(),
      metrics: stats,
      system: systemMetrics,
      throughput,
      summary: this.generateSummary(stats, systemMetrics, throughput)
    };
  }
  
  // 生成性能摘要
  generateSummary(stats, systemMetrics, throughput) {
    const issues = [];
    const recommendations = [];
    
    // 检查响应时间
    const slowOperations = stats.filter(s => s.p95 > 3000);
    if (slowOperations.length > 0) {
      issues.push(`${slowOperations.length} 个操作响应缓慢`);
      recommendations.push('考虑优化慢查询或增加缓存');
    }
    
    // 检查内存使用
    if (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal > 0.8) {
      issues.push('内存使用率过高');
      recommendations.push('检查内存泄漏或增加内存配置');
    }
    
    // 检查吞吐量
    if (parseFloat(throughput.translations.perSecond) < 1) {
      issues.push('翻译吞吐量较低');
      recommendations.push('考虑增加并发处理数');
    }
    
    return {
      healthStatus: issues.length === 0 ? 'healthy' : issues.length < 3 ? 'warning' : 'critical',
      issues,
      recommendations,
      score: Math.max(0, 100 - issues.length * 20)
    };
  }
}

// 创建全局性能监控器实例
export const performanceMonitor = new PerformanceMonitor();

// 启动聚合
if (process.env.NODE_ENV === 'production') {
  performanceMonitor.startAggregation();
}

// 进程退出时停止
process.on('beforeExit', () => {
  performanceMonitor.stopAggregation();
});

// 导出便捷函数
export function createPerformanceTracker(name, type) {
  return performanceMonitor.createTracker(name, type);
}

export async function measurePerformance(name, fn, metadata = {}) {
  return await performanceMonitor.measure(name, fn, METRIC_TYPES.TRANSLATION_TIME, metadata);
}

export async function getPerformanceReport() {
  return await performanceMonitor.getPerformanceReport();
}

export default performanceMonitor;