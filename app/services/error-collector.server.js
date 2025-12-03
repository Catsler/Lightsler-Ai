/**
 * 错误收集服务
 * 统一的错误收集、存储和管理中心
 */

import prisma from "../db.server.js";
import { 
  generateErrorFingerprint, 
  generateErrorGroupId, 
  extractErrorFeatures 
} from "../utils/error-fingerprint.server.js";
import { createTranslationLogger } from "../utils/base-logger.server.js";

const logger = createTranslationLogger('ERROR_COLLECTOR');

/**
 * 错误类型枚举
 */
export const ERROR_TYPES = {
  API: 'API',
  DB: 'DB',
  VALIDATION: 'VALIDATION',
  NETWORK: 'NETWORK',
  UI: 'UI',
  QUEUE: 'QUEUE',
  GRAPHQL: 'GRAPHQL',
  TRANSLATION: 'TRANSLATION',
  SHOPIFY: 'SHOPIFY',
  AUTH: 'AUTH',
  SYSTEM: 'SYSTEM',
  BILLING: 'BILLING'
};

/**
 * 错误分类枚举
 */
export const ERROR_CATEGORIES = {
  FATAL: 'FATAL',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

/**
 * 错误状态枚举
 */
export const ERROR_STATUS = {
  NEW: 'new',
  ACKNOWLEDGED: 'acknowledged',
  INVESTIGATING: 'investigating',
  RESOLVED: 'resolved',
  IGNORED: 'ignored'
};

/**
 * 错误收集器类
 */
export class ErrorCollectorService {
  constructor() {
    this.batchQueue = [];
    this.batchTimer = null;
    this.batchSize = 10;
    this.batchDelay = 5000; // 5秒批量处理一次
  }

  /**
   * 收集错误
   * @param {Object} errorData - 错误数据
   * @param {Object} context - 错误上下文
   * @returns {Promise<Object>} 保存的错误记录
   */
  async collectError(errorData, context = {}) {
    try {
      // 提取错误特征
      const features = extractErrorFeatures(errorData);
      
      // 准备错误记录数据
      const errorRecord = this.prepareErrorRecord(errorData, features, context);
      
      // 检查是否是重复错误
      const existingError = await this.findExistingError(features.fingerprint);
      
      if (existingError) {
        // 更新现有错误记录
        return await this.updateExistingError(existingError.id, errorRecord);
      } else {
        // 创建新错误记录
        return await this.createNewError(errorRecord);
      }
    } catch (error) {
      // 错误收集本身出错时，只记录日志，不抛出错误
      logger.error('错误收集失败', { 
        originalError: errorData, 
        collectorError: error.message 
      });
      return null;
    }
  }

  /**
   * 批量收集错误
   * @param {Array} errors - 错误数组
   * @returns {Promise<Object>} 批量处理结果
   */
  async collectErrorBatch(errors) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const error of errors) {
      try {
        await this.collectError(error.data, error.context);
        results.success++;
      } catch (e) {
        results.failed++;
        results.errors.push({
          error: error.data,
          reason: e.message
        });
      }
    }

    return results;
  }

  /**
   * 添加错误到批处理队列
   * @param {Object} errorData - 错误数据
   * @param {Object} context - 错误上下文
   */
  addToBatch(errorData, context = {}) {
    this.batchQueue.push({ data: errorData, context });
    
    // 如果队列达到批量大小，立即处理
    if (this.batchQueue.length >= this.batchSize) {
      this.processBatch();
    } else if (!this.batchTimer) {
      // 设置定时器，延迟处理
      this.batchTimer = setTimeout(() => this.processBatch(), this.batchDelay);
    }
  }

  /**
   * 处理批量队列
   */
  async processBatch() {
    if (this.batchQueue.length === 0) return;
    
    const batch = [...this.batchQueue];
    this.batchQueue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    await this.collectErrorBatch(batch);
  }

  /**
   * 准备错误记录数据
   */
  prepareErrorRecord(errorData, features, context) {
    const now = new Date();
    
    return {
      // 基本信息
      errorType: features.errorType,
      errorCategory: this.determineCategory(errorData),
      errorCode: errorData.code || errorData.errorCode || 'UNKNOWN',
      message: errorData.message || '未知错误',
      stackTrace: errorData.stack || errorData.stackTrace || null,
      
      // 指纹和分组
      fingerprint: features.fingerprint,
      groupId: features.groupId,
      
      // 上下文
      context: this.sanitizeContext({
        ...context,
        originalError: errorData.originalError,
        features,
        timestamp: now.toISOString()
      }),
      
      // 请求信息
      requestUrl: context.requestUrl || errorData.requestUrl || null,
      requestMethod: context.requestMethod || errorData.requestMethod || null,
      requestBody: this.truncateString(
        JSON.stringify(context.requestBody || errorData.requestBody || {}), 
        1000
      ),
      responseStatus: errorData.statusCode || errorData.responseStatus || null,
      userAgent: context.userAgent || null,
      ipAddress: context.ipAddress || null,
      environment: process.env.NODE_ENV || 'development',
      
      // 资源相关
      resourceType: context.resourceType || errorData.resourceType || null,
      resourceId: context.resourceId || errorData.resourceId || null,
      operation: context.operation || errorData.operation || null,
      
      // 影响评估
      severity: this.calculateSeverity(errorData),
      businessImpact: this.assessBusinessImpact(errorData, context),
      
      // Shop相关
      shopId: context.shopId || null,
      userId: context.userId || null,
      sessionId: context.sessionId || null,
      
      // 自动分析
      suggestedFix: this.generateSuggestedFix(errorData),
      rootCause: this.analyzeRootCause(errorData),
      tags: this.generateTags(errorData, context)
    };
  }

  /**
   * 查找现有错误记录
   */
  async findExistingError(fingerprint) {
    try {
      return await prisma.errorLog.findFirst({
        where: {
          fingerprint,
          status: {
            notIn: [ERROR_STATUS.RESOLVED, ERROR_STATUS.IGNORED]
          }
        }
      });
    } catch (error) {
      logger.error('查找现有错误失败', { fingerprint, error: error.message });
      return null;
    }
  }

  /**
   * 更新现有错误记录
   */
  async updateExistingError(id, errorRecord) {
    try {
      return await prisma.errorLog.update({
        where: { id },
        data: {
          occurrences: { increment: 1 },
          lastSeenAt: new Date(),
          context: errorRecord.context,
          // 如果严重程度更高，更新严重程度
          severity: {
            set: Math.max(errorRecord.severity, 0)
          }
        }
      });
    } catch (error) {
      logger.error('更新错误记录失败', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 创建新错误记录
   */
  async createNewError(errorRecord) {
    try {
      // 计算优先级（确保有默认值）
      const priority = this.calculatePriority(errorRecord);

      // 验证外键关系，如果相关记录不存在则清空外键字段
      const sanitizedRecord = await this.validateForeignKeys(errorRecord);

      return await prisma.errorLog.create({
        data: {
          ...sanitizedRecord,
          priority: priority || 2 // 确保有默认值
        }
      });
    } catch (error) {
      logger.error('创建错误记录失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 验证并清理外键关系
   */
  async validateForeignKeys(errorRecord) {
    const sanitized = { ...errorRecord };

    // 验证 resourceId 外键
    if (sanitized.resourceId) {
      const resourceExists = await prisma.resource.findUnique({
        where: { id: sanitized.resourceId },
        select: { id: true }
      }).catch(() => null);

      if (!resourceExists) {
        sanitized.resourceId = null;
      }
    }

    // 验证 translationSessionId 外键
    if (sanitized.translationSessionId) {
      const sessionExists = await prisma.translationSession.findUnique({
        where: { id: sanitized.translationSessionId },
        select: { id: true }
      }).catch(() => null);

      if (!sessionExists) {
        sanitized.translationSessionId = null;
      }
    }

    return sanitized;
  }

  /**
   * 确定错误分类
   */
  determineCategory(errorData) {
    // 致命错误
    if (
      errorData.fatal ||
      errorData.category === 'FATAL' ||
      (errorData.statusCode && errorData.statusCode >= 500)
    ) {
      return ERROR_CATEGORIES.FATAL;
    }
    
    // 警告
    if (
      errorData.warning ||
      errorData.category === 'WARNING' ||
      errorData.retryable
    ) {
      return ERROR_CATEGORIES.WARNING;
    }
    
    // 信息
    if (
      errorData.info ||
      errorData.category === 'INFO'
    ) {
      return ERROR_CATEGORIES.INFO;
    }
    
    // 默认为错误
    return ERROR_CATEGORIES.ERROR;
  }

  /**
   * 计算错误严重程度（1-5）
   */
  calculateSeverity(errorData) {
    let severity = 2; // 默认中等
    
    // 根据错误类型调整
    if (errorData.errorType === ERROR_TYPES.FATAL || errorData.fatal) {
      severity = 5;
    } else if (errorData.errorType === ERROR_TYPES.DB) {
      severity = 4;
    } else if (errorData.errorType === ERROR_TYPES.API || errorData.errorType === ERROR_TYPES.SHOPIFY) {
      severity = 3;
    } else if (errorData.errorType === ERROR_TYPES.VALIDATION) {
      severity = 1;
    }
    
    // 根据HTTP状态码调整
    if (errorData.statusCode) {
      if (errorData.statusCode >= 500) severity = Math.max(severity, 4);
      else if (errorData.statusCode >= 400) severity = Math.max(severity, 2);
    }
    
    // 根据重试次数调整
    if (errorData.attempt && errorData.attempt > 3) {
      severity = Math.min(severity + 1, 5);
    }
    
    return severity;
  }

  /**
   * 评估业务影响
   */
  assessBusinessImpact(errorData, context) {
    const impacts = [];
    
    if (errorData.errorType === ERROR_TYPES.TRANSLATION) {
      impacts.push('翻译服务中断');
    }
    
    if (errorData.errorType === ERROR_TYPES.SHOPIFY) {
      impacts.push('Shopify API调用失败');
    }
    
    if (context.operation === 'sync') {
      impacts.push('数据同步失败');
    }
    
    if (errorData.statusCode === 429) {
      impacts.push('API限流，服务降级');
    }
    
    return impacts.length > 0 ? impacts.join(', ') : null;
  }

  /**
   * 计算优先级（0-4，0最高）
   */
  calculatePriority(errorRecord) {
    const weights = {
      severity: 0.4,
      frequency: 0.3,
      userImpact: 0.2,
      businessImpact: 0.1
    };
    
    // 归一化分数
    const severityScore = (errorRecord.severity || 2) / 5;
    const frequencyScore = Math.min((errorRecord.occurrences || 1) / 100, 1);
    const userImpactScore = Math.min((errorRecord.userImpact || 0) / 100, 1);
    const businessImpactScore = errorRecord.businessImpact ? 1 : 0;
    
    const totalScore = 
      severityScore * weights.severity +
      frequencyScore * weights.frequency +
      userImpactScore * weights.userImpact +
      businessImpactScore * weights.businessImpact;
    
    // 转换为0-4的优先级（0最高）
    const priority = Math.floor((1 - totalScore) * 4);
    return Math.max(0, Math.min(4, priority)); // 确保在0-4范围内
  }

  /**
   * 生成修复建议
   */
  generateSuggestedFix(errorData) {
    const suggestions = [];
    
    // API错误建议
    if (errorData.errorType === ERROR_TYPES.API) {
      if (errorData.statusCode === 401) {
        suggestions.push('检查API密钥配置');
        suggestions.push('验证认证令牌是否过期');
      } else if (errorData.statusCode === 429) {
        suggestions.push('实施请求限流');
        suggestions.push('增加重试延迟');
        suggestions.push('考虑使用批量API');
      } else if (errorData.statusCode >= 500) {
        suggestions.push('检查外部服务状态');
        suggestions.push('实施熔断机制');
      }
    }
    
    // 数据库错误建议
    if (errorData.errorType === ERROR_TYPES.DB) {
      suggestions.push('检查数据库连接');
      suggestions.push('验证数据库模型是否最新');
      suggestions.push('运行 npx prisma migrate dev');
    }
    
    // 网络错误建议
    if (errorData.errorType === ERROR_TYPES.NETWORK) {
      suggestions.push('检查网络连接');
      suggestions.push('增加超时时间');
      suggestions.push('实施重试机制');
    }
    
    // 验证错误建议
    if (errorData.errorType === ERROR_TYPES.VALIDATION) {
      suggestions.push('检查输入数据格式');
      suggestions.push('添加数据验证');
      suggestions.push('提供更好的错误提示');
    }
    
    return suggestions.length > 0 ? suggestions.join('\n') : null;
  }

  /**
   * 分析根本原因
   */
  analyzeRootCause(errorData) {
    // 基于错误模式分析根本原因
    if (errorData.message) {
      const message = errorData.message.toLowerCase();
      
      if (message.includes('timeout')) {
        return '请求超时，可能是网络延迟或服务器响应慢';
      }
      
      if (message.includes('connection refused')) {
        return '连接被拒绝，服务可能未启动或端口错误';
      }
      
      if (message.includes('unique constraint')) {
        return '唯一约束冲突，尝试插入重复数据';
      }
      
      if (message.includes('not found')) {
        return '资源不存在，可能已被删除或ID错误';
      }
      
      if (message.includes('permission') || message.includes('forbidden')) {
        return '权限不足，需要检查用户权限或API配置';
      }
    }
    
    return null;
  }

  /**
   * 生成标签
   */
  generateTags(errorData, context) {
    const tags = [];
    
    // 添加错误类型标签
    if (errorData.errorType) {
      tags.push(errorData.errorType.toLowerCase());
    }
    
    // 添加操作标签
    if (context.operation) {
      tags.push(`op:${context.operation}`);
    }
    
    // 添加资源类型标签
    if (context.resourceType) {
      tags.push(`resource:${context.resourceType}`);
    }
    
    // 添加环境标签
    tags.push(`env:${process.env.NODE_ENV || 'development'}`);
    
    // 添加严重程度标签
    if (errorData.fatal) {
      tags.push('fatal');
    }
    
    if (errorData.retryable) {
      tags.push('retryable');
    }
    
    return tags;
  }

  /**
   * 清理上下文数据（移除敏感信息）
   */
  sanitizeContext(context) {
    const sanitized = { ...context };
    
    // 移除敏感字段
    const sensitiveFields = [
      'password', 'token', 'secret', 'apiKey', 
      'accessToken', 'refreshToken', 'authorization'
    ];
    
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const result = Array.isArray(obj) ? [] : {};
      
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = sanitizeObject(value);
        } else {
          result[key] = value;
        }
      }
      
      return result;
    };
    
    return sanitizeObject(sanitized);
  }

  /**
   * 截断字符串
   */
  truncateString(str, maxLength) {
    if (!str) return null;
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * 获取错误统计
   */
  async getErrorStats(shopId = null, timeRange = '24h') {
    const timeFilter = this.getTimeFilter(timeRange);
    
    const where = {
      createdAt: timeFilter,
      ...(shopId && { shopId })
    };
    
    const [total, byType, byStatus, bySeverity] = await Promise.all([
      prisma.errorLog.count({ where }),
      prisma.errorLog.groupBy({
        by: ['errorType'],
        where,
        _count: true
      }),
      prisma.errorLog.groupBy({
        by: ['status'],
        where,
        _count: true
      }),
      prisma.errorLog.groupBy({
        by: ['severity'],
        where,
        _count: true
      })
    ]);
    
    return {
      total,
      byType: byType.reduce((acc, item) => {
        acc[item.errorType] = item._count;
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {}),
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[`level_${item.severity}`] = item._count;
        return acc;
      }, {})
    };
  }

  /**
   * 获取时间过滤器
   */
  getTimeFilter(timeRange) {
    const now = new Date();
    let since;
    
    switch (timeRange) {
      case '1h':
        since = new Date(now - 60 * 60 * 1000);
        break;
      case '24h':
        since = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        since = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        since = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = new Date(now - 24 * 60 * 60 * 1000);
    }
    
    return { gte: since };
  }
}

// 创建单例实例
export const errorCollector = new ErrorCollectorService();

// 便捷函数
export async function collectError(errorData, context = {}) {
  return errorCollector.collectError(errorData, context);
}

export async function collectErrorBatch(errors) {
  return errorCollector.collectErrorBatch(errors);
}

export async function getErrorStats(shopId = null, timeRange = '24h') {
  return errorCollector.getErrorStats(shopId, timeRange);
}

export default errorCollector;
