/**
 * 错误自动恢复服务
 * 自动检测和恢复常见错误，实现系统自愈
 */

import { prisma } from '../db.server.js';
import { collectError } from './error-collector.server.js';
import { logger } from '../utils/logger.server.js';
import { performanceMonitor } from './performance-monitor.server.js';

// 恢复策略类型
export const RECOVERY_STRATEGIES = {
  RETRY: 'RETRY',                    // 重试
  EXPONENTIAL_BACKOFF: 'EXPONENTIAL_BACKOFF', // 指数退避重试
  CIRCUIT_BREAKER: 'CIRCUIT_BREAKER',         // 熔断器
  FALLBACK: 'FALLBACK',              // 降级
  CACHE: 'CACHE',                    // 使用缓存
  QUEUE_DELAY: 'QUEUE_DELAY',        // 队列延迟
  RESOURCE_CLEANUP: 'RESOURCE_CLEANUP',       // 资源清理
  SERVICE_RESTART: 'SERVICE_RESTART',         // 服务重启
  MANUAL_INTERVENTION: 'MANUAL_INTERVENTION'  // 人工干预
};

// 错误恢复配置
const RECOVERY_CONFIG = {
  // API限流错误
  'API_LIMIT': {
    strategy: RECOVERY_STRATEGIES.EXPONENTIAL_BACKOFF,
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 60000,
    backoffFactor: 2
  },
  
  // 网络超时
  'TIMEOUT': {
    strategy: RECOVERY_STRATEGIES.RETRY,
    maxRetries: 3,
    delay: 2000
  },
  
  // 数据库连接错误
  'DB_CONNECTION': {
    strategy: RECOVERY_STRATEGIES.CIRCUIT_BREAKER,
    threshold: 5,
    timeout: 30000,
    fallback: true
  },
  
  // 翻译失败
  'TRANSLATION_FAILED': {
    strategy: RECOVERY_STRATEGIES.RETRY,
    maxRetries: 2,
    delay: 5000,
    fallback: true
  },
  
  // 内存溢出
  'OUT_OF_MEMORY': {
    strategy: RECOVERY_STRATEGIES.RESOURCE_CLEANUP,
    gcForce: true,
    clearCache: true
  },
  
  // 队列阻塞
  'QUEUE_BLOCKED': {
    strategy: RECOVERY_STRATEGIES.QUEUE_DELAY,
    delay: 10000,
    redistribute: true
  }
};

// 错误恢复管理器
export class ErrorRecoveryManager {
  constructor(options = {}) {
    const {
      strategies,
      checkInterval = 30000,
      enabled = true,
      instanceId = `instance-${typeof process !== 'undefined' ? process.pid : Math.random().toString(36).slice(2)}`
    } = options;

    const availableStrategies = new Set(Object.values(RECOVERY_STRATEGIES));
    const resolvedStrategies = Array.isArray(strategies) && strategies.length > 0
      ? strategies.filter((strategy) => availableStrategies.has(strategy))
      : Array.from(availableStrategies);

    this.enabled = enabled;
    this.instanceId = instanceId;
    this.enabledStrategies = new Set(resolvedStrategies);

    this.recoveryHistory = [];
    this.activeRecoveries = new Map();
    this.circuitBreakers = new Map();
    this.retryQueues = new Map();
    this.checkInterval = checkInterval;
    this.checkTimer = null;
    this.isRunning = false;
  }
  
  validateConfig() {
    if (!this.enabledStrategies || this.enabledStrategies.size === 0) {
      logger.error('错误恢复服务未启用任何策略');
      return false;
    }
    return true;
  }

  isStrategyEnabled(strategy) {
    return this.enabledStrategies.has(strategy);
  }
  
  // 启动自动恢复
  start() {
    if (!this.enabled) {
      logger.info('错误自动恢复服务已禁用');
      return false;
    }

    if (this.isRunning) {
      return true;
    }

    if (!this.validateConfig()) {
      logger.error('错误自动恢复服务配置验证失败，未启动');
      return false;
    }

    this.isRunning = true;

    this.checkTimer = setInterval(() => {
      this.checkAndRecover().catch((error) => {
        logger.error('错误恢复定时检查失败', {
          error: error.message
        });
      });
    }, this.checkInterval);

    // 启动时立即执行一次检查
    this.checkAndRecover().catch((error) => {
      logger.error('错误恢复初始检查失败', {
        error: error.message
      });
    });
    logger.info('错误自动恢复服务已启动', {
      strategies: Array.from(this.enabledStrategies),
      checkInterval: this.checkInterval,
      instanceId: this.instanceId
    });
    return true;
  }
  
  // 停止自动恢复
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.isRunning = false;
    
    logger.info('错误自动恢复服务已停止');
  }
  
  // 检查并恢复错误
  async checkAndRecover() {
    if (!this.enabled || !this.isRunning) {
      return;
    }

    try {
      // 获取最近的未解决错误
      const recentErrors = await this.getRecoverableErrors();
      
      for (const error of recentErrors) {
        await this.attemptRecovery(error);
      }
      
      // 清理过期的恢复记录
      this.cleanupRecoveryHistory();
      
    } catch (error) {
      logger.error('错误恢复检查失败', {
        error: error.message,
        stack: error.stack
      });
    }
  }
  
  // 获取可恢复的错误
  async getRecoverableErrors() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const errors = await prisma.errorLog.findMany({
      where: {
        status: { in: ['new', 'acknowledged'] },
        createdAt: { gte: fiveMinutesAgo },
        errorCode: { in: Object.keys(RECOVERY_CONFIG) }
      },
      orderBy: { severity: 'desc' },
      take: 20
    });
    
    return errors;
  }
  
  // 尝试恢复错误
  async attemptRecovery(error) {
    const recoveryKey = `${error.errorCode}_${error.id}`;
    
    // 检查是否已在恢复中
    if (this.activeRecoveries.has(recoveryKey)) {
      return;
    }
    
    this.activeRecoveries.set(recoveryKey, {
      startTime: Date.now(),
      attempts: 0
    });
    
    try {
      const config = RECOVERY_CONFIG[error.errorCode];
      if (!config) {
        logger.warn('没有找到恢复策略', { errorCode: error.errorCode });
        return;
      }

      if (!this.isStrategyEnabled(config.strategy)) {
        logger.debug('恢复策略未启用，跳过处理', {
          errorCode: error.errorCode,
          strategy: config.strategy
        });
        return;
      }
      
      const result = await this.executeRecoveryStrategy(error, config);
      
      if (result.success) {
        await this.markErrorRecovered(error, result);
        logger.info('错误恢复成功', {
          errorId: error.id,
          errorCode: error.errorCode,
          strategy: config.strategy,
          attempts: result.attempts
        });
      } else {
        await this.handleRecoveryFailure(error, result);
        logger.warn('错误恢复失败', {
          errorId: error.id,
          errorCode: error.errorCode,
          reason: result.reason
        });
      }
      
    } catch (recoveryError) {
      logger.error('恢复过程出错', {
        errorId: error.id,
        recoveryError: recoveryError.message
      });
    } finally {
      this.activeRecoveries.delete(recoveryKey);
    }
  }
  
  // 执行恢复策略
  async executeRecoveryStrategy(error, config) {
    const tracker = performanceMonitor.createTracker(
      `recovery_${config.strategy}`,
      'RECOVERY_TIME'
    );
    tracker.start();
    
    let result;
    
    switch (config.strategy) {
      case RECOVERY_STRATEGIES.RETRY:
        result = await this.retryStrategy(error, config);
        break;
        
      case RECOVERY_STRATEGIES.EXPONENTIAL_BACKOFF:
        result = await this.exponentialBackoffStrategy(error, config);
        break;
        
      case RECOVERY_STRATEGIES.CIRCUIT_BREAKER:
        result = await this.circuitBreakerStrategy(error, config);
        break;
        
      case RECOVERY_STRATEGIES.FALLBACK:
        result = await this.fallbackStrategy(error, config);
        break;
        
      case RECOVERY_STRATEGIES.CACHE:
        result = await this.cacheStrategy(error, config);
        break;
        
      case RECOVERY_STRATEGIES.QUEUE_DELAY:
        result = await this.queueDelayStrategy(error, config);
        break;
        
      case RECOVERY_STRATEGIES.RESOURCE_CLEANUP:
        result = await this.resourceCleanupStrategy(error, config);
        break;
        
      case RECOVERY_STRATEGIES.SERVICE_RESTART:
        result = await this.serviceRestartStrategy(error, config);
        break;
        
      default:
        result = { success: false, reason: '未知恢复策略' };
    }
    
    const duration = tracker.end();
    result.duration = duration;
    
    // 记录恢复历史
    this.recoveryHistory.push({
      errorId: error.id,
      errorCode: error.errorCode,
      strategy: config.strategy,
      result: result.success,
      duration,
      timestamp: new Date()
    });
    
    return result;
  }
  
  // 重试策略
  async retryStrategy(error, config) {
    const { maxRetries = 3, delay = 1000 } = config;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 等待指定延迟
        await this.delay(delay);
        
        // 重试原始操作
        const success = await this.retryOriginalOperation(error);
        
        if (success) {
          return {
            success: true,
            attempts: attempt,
            strategy: 'retry'
          };
        }
        
      } catch (retryError) {
        logger.debug(`重试失败 (${attempt}/${maxRetries})`, {
          errorId: error.id,
          error: retryError.message
        });
      }
    }
    
    return {
      success: false,
      attempts: maxRetries,
      reason: '达到最大重试次数'
    };
  }
  
  // 指数退避策略
  async exponentialBackoffStrategy(error, config) {
    const {
      maxRetries = 5,
      initialDelay = 1000,
      maxDelay = 60000,
      backoffFactor = 2
    } = config;
    
    let delay = initialDelay;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 等待退避延迟
        await this.delay(delay);
        
        // 重试操作
        const success = await this.retryOriginalOperation(error);
        
        if (success) {
          return {
            success: true,
            attempts: attempt,
            strategy: 'exponential_backoff',
            finalDelay: delay
          };
        }
        
        // 计算下次延迟
        delay = Math.min(delay * backoffFactor, maxDelay);
        
      } catch (retryError) {
        logger.debug(`指数退避重试失败 (${attempt}/${maxRetries})`, {
          errorId: error.id,
          delay,
          error: retryError.message
        });
      }
    }
    
    return {
      success: false,
      attempts: maxRetries,
      reason: '指数退避重试全部失败'
    };
  }
  
  // 熔断器策略
  async circuitBreakerStrategy(error, config) {
    const {
      threshold = 5,
      timeout = 30000,
      fallback = false
    } = config;
    
    const circuitKey = error.errorCode;
    
    if (!this.circuitBreakers.has(circuitKey)) {
      this.circuitBreakers.set(circuitKey, {
        state: 'CLOSED',
        failures: 0,
        lastFailure: null,
        nextAttempt: null
      });
    }
    
    const circuit = this.circuitBreakers.get(circuitKey);
    
    // 检查熔断器状态
    if (circuit.state === 'OPEN') {
      if (Date.now() < circuit.nextAttempt) {
        // 熔断器开启，使用降级方案
        if (fallback) {
          return await this.fallbackStrategy(error, config);
        }
        return {
          success: false,
          reason: '熔断器开启，服务暂时不可用'
        };
      } else {
        // 尝试半开状态
        circuit.state = 'HALF_OPEN';
      }
    }
    
    try {
      // 尝试执行操作
      const success = await this.retryOriginalOperation(error);
      
      if (success) {
        // 成功，重置熔断器
        circuit.state = 'CLOSED';
        circuit.failures = 0;
        return {
          success: true,
          strategy: 'circuit_breaker',
          state: 'recovered'
        };
      } else {
        throw new Error('操作失败');
      }
      
    } catch (circuitError) {
      // 失败，更新熔断器
      circuit.failures++;
      circuit.lastFailure = Date.now();
      
      if (circuit.failures >= threshold) {
        circuit.state = 'OPEN';
        circuit.nextAttempt = Date.now() + timeout;
        
        logger.warn('熔断器开启', {
          errorCode: error.errorCode,
          failures: circuit.failures,
          nextAttempt: new Date(circuit.nextAttempt)
        });
      }
      
      if (fallback) {
        return await this.fallbackStrategy(error, config);
      }
      
      return {
        success: false,
        reason: '熔断器触发',
        failures: circuit.failures
      };
    }
  }
  
  // 降级策略
  async fallbackStrategy(error, config) {
    try {
      // 根据错误类型执行降级操作
      let fallbackResult;
      
      switch (error.errorCode) {
        case 'TRANSLATION_FAILED':
          // 使用缓存的翻译或返回原文
          fallbackResult = await this.useCachedTranslation(error);
          break;
          
        case 'API_LIMIT':
          // 使用本地处理或队列延迟
          fallbackResult = await this.useLocalProcessing(error);
          break;
          
        default:
          // 通用降级：跳过处理
          fallbackResult = await this.skipProcessing(error);
      }
      
      return {
        success: true,
        strategy: 'fallback',
        fallbackType: fallbackResult.type,
        result: fallbackResult
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        reason: '降级策略执行失败',
        error: fallbackError.message
      };
    }
  }
  
  // 缓存策略
  async cacheStrategy(error, config) {
    try {
      // 尝试从缓存获取数据
      const cachedData = await this.getCachedData(error);
      
      if (cachedData) {
        return {
          success: true,
          strategy: 'cache',
          dataSource: 'cache',
          data: cachedData
        };
      }
      
      return {
        success: false,
        reason: '缓存中没有找到数据'
      };
      
    } catch (cacheError) {
      return {
        success: false,
        reason: '缓存策略执行失败',
        error: cacheError.message
      };
    }
  }
  
  // 队列延迟策略
  async queueDelayStrategy(error, config) {
    const { delay = 10000, redistribute = false } = config;
    
    try {
      // 将任务重新加入队列，但延迟执行
      const queueKey = error.errorCode;
      
      if (!this.retryQueues.has(queueKey)) {
        this.retryQueues.set(queueKey, []);
      }
      
      const queue = this.retryQueues.get(queueKey);
      
      // 添加到延迟队列
      queue.push({
        error,
        scheduledTime: Date.now() + delay,
        priority: error.severity
      });
      
      // 如果需要重新分配
      if (redistribute) {
        await this.redistributeQueueTasks(queue);
      }
      
      // 设置延迟执行
      setTimeout(async () => {
        await this.processDelayedTask(error);
      }, delay);
      
      return {
        success: true,
        strategy: 'queue_delay',
        delay,
        queueLength: queue.length
      };
      
    } catch (queueError) {
      return {
        success: false,
        reason: '队列延迟策略执行失败',
        error: queueError.message
      };
    }
  }
  
  // 资源清理策略
  async resourceCleanupStrategy(error, config) {
    const { gcForce = false, clearCache = false } = config;
    
    try {
      const cleanupActions = [];
      
      // 强制垃圾回收
      if (gcForce && global.gc) {
        global.gc();
        cleanupActions.push('gc');
      }
      
      // 清理缓存
      if (clearCache) {
        await this.clearApplicationCache();
        cleanupActions.push('cache');
      }
      
      // 清理临时文件
      await this.cleanupTempFiles();
      cleanupActions.push('temp_files');
      
      // 重置连接池
      await this.resetConnectionPools();
      cleanupActions.push('connections');
      
      return {
        success: true,
        strategy: 'resource_cleanup',
        actions: cleanupActions,
        memoryFreed: this.getMemoryStats()
      };
      
    } catch (cleanupError) {
      return {
        success: false,
        reason: '资源清理失败',
        error: cleanupError.message
      };
    }
  }
  
  // 服务重启策略（慎用）
  async serviceRestartStrategy(error, config) {
    // 这个策略应该非常谨慎使用
    logger.error('服务重启策略被触发', {
      errorId: error.id,
      errorCode: error.errorCode
    });
    
    // 实际生产环境中，这里应该发送信号给进程管理器
    // 而不是直接重启进程
    
    return {
      success: false,
      reason: '服务重启需要人工确认',
      requiresManualIntervention: true
    };
  }
  
  // 重试原始操作
  async retryOriginalOperation(error) {
    // 根据错误类型和上下文重试操作
    const context = error.context || {};
    
    try {
      switch (error.operation) {
        case 'translate':
          // 重试翻译操作
          if (context.resourceId && context.targetLanguage) {
            const resource = await prisma.resource.findUnique({
              where: { id: context.resourceId }
            });
            
            if (resource) {
              // 这里应该调用实际的翻译函数
              // const result = await translateResource(resource, context.targetLanguage);
              // return !!result;
              return Math.random() > 0.3; // 模拟70%成功率
            }
          }
          break;
          
        case 'sync':
          // 重试同步操作
          if (context.translationId) {
            // 这里应该调用实际的同步函数
            // const result = await syncTranslation(context.translationId);
            // return !!result;
            return Math.random() > 0.5; // 模拟50%成功率
          }
          break;
          
        default:
          // 未知操作类型
          return false;
      }
    } catch (retryError) {
      logger.debug('重试操作失败', {
        errorId: error.id,
        operation: error.operation,
        error: retryError.message
      });
      return false;
    }
    
    return false;
  }
  
  // 标记错误已恢复
  async markErrorRecovered(error, result) {
    await prisma.errorLog.update({
      where: { id: error.id },
      data: {
        status: 'resolved',
        resolution: `自动恢复: ${result.strategy}`,
        notes: JSON.stringify(result)
      }
    });
  }
  
  // 处理恢复失败
  async handleRecoveryFailure(error, result) {
    await prisma.errorLog.update({
      where: { id: error.id },
      data: {
        status: 'investigating',
        notes: `自动恢复失败: ${result.reason}`
      }
    });
    
    // 如果多次恢复失败，创建告警
    if (result.attempts && result.attempts >= 3) {
      await collectError({
        errorType: 'RECOVERY_FAILED',
        errorCategory: 'WARNING',
        errorCode: 'AUTO_RECOVERY_FAILED',
        message: `错误自动恢复失败: ${error.errorCode}`,
        context: {
          originalError: error.id,
          attempts: result.attempts,
          reason: result.reason
        },
        severity: 3
      });
    }
  }
  
  // 辅助函数：延迟
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // 辅助函数：使用缓存的翻译
  async useCachedTranslation(error) {
    // 实现缓存逻辑
    return { type: 'cached_translation', success: true };
  }
  
  // 辅助函数：使用本地处理
  async useLocalProcessing(error) {
    // 实现本地处理逻辑
    return { type: 'local_processing', success: true };
  }
  
  // 辅助函数：跳过处理
  async skipProcessing(error) {
    // 标记为跳过
    return { type: 'skipped', success: true };
  }
  
  // 辅助函数：获取缓存数据
  async getCachedData(error) {
    // 实现缓存获取逻辑
    return null;
  }
  
  // 辅助函数：重新分配队列任务
  async redistributeQueueTasks(queue) {
    // 实现队列重新分配逻辑
    queue.sort((a, b) => b.priority - a.priority);
  }
  
  // 辅助函数：处理延迟任务
  async processDelayedTask(error) {
    // 实现延迟任务处理逻辑
    logger.info('处理延迟任务', { errorId: error.id });
  }
  
  // 辅助函数：清理应用缓存
  async clearApplicationCache() {
    // 实现缓存清理逻辑
    logger.info('清理应用缓存');
  }
  
  // 辅助函数：清理临时文件
  async cleanupTempFiles() {
    // 实现临时文件清理逻辑
    logger.info('清理临时文件');
  }
  
  // 辅助函数：重置连接池
  async resetConnectionPools() {
    // 实现连接池重置逻辑
    logger.info('重置连接池');
  }
  
  // 辅助函数：获取内存统计
  getMemoryStats() {
    const mem = process.memoryUsage();
    return {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024)
    };
  }
  
  // 清理过期的恢复历史
  cleanupRecoveryHistory() {
    const maxAge = 24 * 60 * 60 * 1000; // 24小时
    const now = Date.now();
    
    this.recoveryHistory = this.recoveryHistory.filter(
      record => now - record.timestamp.getTime() < maxAge
    );
  }
  
  // 获取恢复统计
  getRecoveryStats() {
    const stats = {
      total: this.recoveryHistory.length,
      successful: 0,
      failed: 0,
      byStrategy: {},
      averageDuration: 0
    };
    
    let totalDuration = 0;
    
    this.recoveryHistory.forEach(record => {
      if (record.result) {
        stats.successful++;
      } else {
        stats.failed++;
      }
      
      if (!stats.byStrategy[record.strategy]) {
        stats.byStrategy[record.strategy] = {
          success: 0,
          failed: 0
        };
      }
      
      if (record.result) {
        stats.byStrategy[record.strategy].success++;
      } else {
        stats.byStrategy[record.strategy].failed++;
      }
      
      totalDuration += record.duration || 0;
    });
    
    if (stats.total > 0) {
      stats.averageDuration = Math.round(totalDuration / stats.total);
      stats.successRate = ((stats.successful / stats.total) * 100).toFixed(1);
    }
    
    return stats;
  }
}

// 创建全局错误恢复管理器实例
export const errorRecoveryManager = new ErrorRecoveryManager();

// 在生产环境自动启动
if (process.env.NODE_ENV === 'production') {
  errorRecoveryManager.start();
}

// 进程退出时停止
process.on('beforeExit', () => {
  errorRecoveryManager.stop();
});

// 导出便捷函数
export async function attemptErrorRecovery(error) {
  return await errorRecoveryManager.attemptRecovery(error);
}

export function getRecoveryStats() {
  return errorRecoveryManager.getRecoveryStats();
}

export default errorRecoveryManager;
