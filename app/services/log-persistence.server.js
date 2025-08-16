/**
 * 日志持久化服务
 * 将内存中的日志定期保存到数据库，并提供日志轮转功能
 */

import { prisma } from '../db.server.js';
import { TranslationLogger } from '../utils/logger.server.js';
import { logger } from '../utils/logger.server.js';
import { collectError } from './error-collector.server.js';

// 日志缓冲区
class LogBuffer {
  constructor(maxSize = 1000, flushInterval = 60000) {
    this.buffer = [];
    this.maxSize = maxSize;
    this.flushInterval = flushInterval;
    this.flushTimer = null;
    this.isFlushingRunning = false;
  }
  
  add(logEntry) {
    this.buffer.push({
      ...logEntry,
      timestamp: logEntry.timestamp || new Date()
    });
    
    // 如果缓冲区满了，立即刷新
    if (this.buffer.length >= this.maxSize) {
      this.flush();
    } else if (!this.flushTimer) {
      // 设置定时刷新
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }
  
  async flush() {
    if (this.isFlushingRunning || this.buffer.length === 0) return;
    
    this.isFlushingRunning = true;
    const logsToFlush = [...this.buffer];
    this.buffer = [];
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    try {
      await this.persistLogs(logsToFlush);
    } catch (error) {
      logger.error(`Log persistence failed: ${error.message}`);
      // 失败的日志重新加入缓冲区（但限制重试次数）
      const retriableLogs = logsToFlush.filter(log => 
        (log.retryCount || 0) < 3
      ).map(log => ({
        ...log,
        retryCount: (log.retryCount || 0) + 1
      }));
      
      if (retriableLogs.length > 0) {
        this.buffer.unshift(...retriableLogs);
      }
    } finally {
      this.isFlushingRunning = false;
    }
  }
  
  async persistLogs(logs) {
    // 按类型分组日志
    const translationLogs = [];
    const errorLogs = [];
    const performanceLogs = [];
    
    logs.forEach(log => {
      switch (log.category) {
        case 'TRANSLATION':
          translationLogs.push(this.formatTranslationLog(log));
          break;
        case 'ERROR':
          errorLogs.push(this.formatErrorLog(log));
          break;
        case 'PERFORMANCE':
          performanceLogs.push(this.formatPerformanceLog(log));
          break;
      }
    });
    
    // 批量保存到数据库
    const promises = [];
    
    if (translationLogs.length > 0) {
      promises.push(this.saveTranslationLogs(translationLogs));
    }
    
    if (errorLogs.length > 0) {
      promises.push(this.saveErrorLogs(errorLogs));
    }
    
    if (performanceLogs.length > 0) {
      promises.push(this.savePerformanceLogs(performanceLogs));
    }
    
    await Promise.all(promises);
  }
  
  formatTranslationLog(log) {
    return {
      level: log.level,
      message: log.message,
      resourceId: log.data?.resourceId,
      resourceType: log.data?.resourceType,
      targetLanguage: log.data?.targetLanguage,
      duration: log.data?.duration,
      success: log.data?.success,
      metadata: log.data,
      timestamp: log.timestamp
    };
  }
  
  formatErrorLog(log) {
    return {
      errorType: log.data?.errorType || 'UNKNOWN',
      errorCategory: log.level === 'error' ? 'ERROR' : 'WARNING',
      message: log.message,
      stack: log.data?.stack,
      context: log.data,
      timestamp: log.timestamp
    };
  }
  
  formatPerformanceLog(log) {
    return {
      operation: log.data?.operation,
      duration: log.data?.duration,
      metrics: log.data?.metrics,
      timestamp: log.timestamp
    };
  }
  
  async saveTranslationLogs(logs) {
    // 创建翻译日志表（如果需要的话，可以扩展schema）
    // 这里暂时保存到通用日志表或错误表中
    const records = logs.map(log => ({
      errorType: 'TRANSLATION',
      errorCategory: 'INFO',
      errorCode: 'TRANSLATION_LOG',
      message: log.message,
      context: log.metadata,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      operation: 'translate',
      severity: log.success ? 1 : 3,
      status: 'logged',
      createdAt: log.timestamp
    }));
    
    // 批量插入
    for (const record of records) {
      await collectError(record);
    }
  }
  
  async saveErrorLogs(logs) {
    for (const log of logs) {
      await collectError({
        ...log,
        errorCode: 'LOGGED_ERROR',
        severity: log.errorCategory === 'ERROR' ? 4 : 2,
        status: 'new'
      });
    }
  }
  
  async savePerformanceLogs(logs) {
    // 保存性能日志到错误表（用于分析）
    const records = logs.map(log => ({
      errorType: 'PERFORMANCE',
      errorCategory: 'INFO',
      errorCode: 'PERFORMANCE_METRIC',
      message: `性能指标: ${log.operation}`,
      context: {
        operation: log.operation,
        duration: log.duration,
        metrics: log.metrics
      },
      severity: 1,
      status: 'logged',
      createdAt: log.timestamp
    }));
    
    for (const record of records) {
      await collectError(record);
    }
  }
}

// 日志轮转服务
class LogRotationService {
  constructor() {
    this.rotationInterval = 24 * 60 * 60 * 1000; // 24小时
    this.maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    this.rotationTimer = null;
  }
  
  start() {
    // 立即执行一次清理
    this.rotate();
    
    // 设置定期清理
    this.rotationTimer = setInterval(() => {
      this.rotate();
    }, this.rotationInterval);
  }
  
  stop() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }
  
  async rotate() {
    try {
      const cutoffDate = new Date(Date.now() - this.maxAge);
      
      // 删除旧的日志记录
      const result = await prisma.errorLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          errorCategory: 'INFO', // 只删除信息类日志
          status: 'logged' // 只删除已记录状态的
        }
      });
      
      logger.info(`Log rotation: deleted ${result.count} old logs`);
      
      // 归档重要日志（可选）
      await this.archiveImportantLogs(cutoffDate);
      
    } catch (error) {
      logger.error(`Log rotation failed: ${error.message}`);
    }
  }
  
  async archiveImportantLogs(cutoffDate) {
    // 归档重要的错误日志到文件系统或其他存储
    const importantLogs = await prisma.errorLog.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        severity: { gte: 3 }, // 严重度3及以上
        status: { notIn: ['logged', 'resolved', 'ignored'] }
      },
      take: 1000
    });
    
    if (importantLogs.length > 0) {
      // TODO: 实现归档逻辑（保存到文件或云存储）
      logger.info(`Archived ${importantLogs.length} important logs`);
    }
  }
}

// 增强的TranslationLogger（添加持久化支持）
export class PersistentTranslationLogger extends TranslationLogger {
  constructor(category = 'TRANSLATION') {
    super(category);
    this.logBuffer = logBufferInstance;
  }
  
  log(level, message, data = {}) {
    // 调用父类方法
    super[level.toLowerCase()](message, data);
    
    // 添加到持久化缓冲区
    this.logBuffer.add({
      level,
      category: this.category,
      message,
      data,
      timestamp: new Date()
    });
  }
  
  // 重写各个日志方法以支持持久化
  error(message, data = {}) {
    this.log('error', message, data);
  }
  
  warn(message, data = {}) {
    this.log('warn', message, data);
  }
  
  info(message, data = {}) {
    this.log('info', message, data);
  }
  
  debug(message, data = {}) {
    this.log('debug', message, data);
  }
}

// 全局实例
const logBufferInstance = new LogBuffer();
const logRotationService = new LogRotationService();

// 启动日志轮转服务
if (process.env.NODE_ENV === 'production') {
  logRotationService.start();
}

// 进程退出时刷新日志
process.on('beforeExit', async () => {
  await logBufferInstance.flush();
});

process.on('SIGTERM', async () => {
  await logBufferInstance.flush();
  logRotationService.stop();
});

// 导出
export {
  LogBuffer,
  LogRotationService,
  logBufferInstance,
  logRotationService
};

// 创建全局持久化日志实例
export const persistentLogger = new PersistentTranslationLogger('SYSTEM');
export const translationPersistentLogger = new PersistentTranslationLogger('TRANSLATION');
export const performancePersistentLogger = new PersistentTranslationLogger('PERFORMANCE');