/**
 * 翻译服务结构化日志工具
 * 提供统一的日志记录格式和分级管理
 */

import { config } from './config.server.js';

/**
 * 日志级别定义
 */
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * 日志级别名称映射
 */
const LOG_LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG'
};

/**
 * 获取当前配置的日志级别
 */
function getCurrentLogLevel() {
  const level = config.logging?.level || 'info';
  switch (level.toLowerCase()) {
    case 'error': return LOG_LEVELS.ERROR;
    case 'warn': return LOG_LEVELS.WARN;
    case 'info': return LOG_LEVELS.INFO;
    case 'debug': return LOG_LEVELS.DEBUG;
    default: return LOG_LEVELS.INFO;
  }
}

/**
 * 格式化日志消息
 * @param {number} level - 日志级别
 * @param {string} category - 日志分类
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 * @returns {Object} 格式化的日志对象
 */
function formatLogMessage(level, category, message, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: LOG_LEVEL_NAMES[level],
    category,
    message,
    ...data
  };
}

/**
 * 输出日志到控制台
 * @param {number} level - 日志级别
 * @param {Object} logData - 日志数据
 */
function outputToConsole(level, logData) {
  if (level > getCurrentLogLevel()) {
    return;
  }

  const { timestamp, level: levelName, category, message, ...rest } = logData;
  const prefix = `[${timestamp}] [${levelName}] [${category}]`;
  
  switch (level) {
    case LOG_LEVELS.ERROR:
      console.error(prefix, message, rest);
      break;
    case LOG_LEVELS.WARN:
      console.warn(prefix, message, rest);
      break;
    case LOG_LEVELS.INFO:
      console.log(prefix, message, rest);
      break;
    case LOG_LEVELS.DEBUG:
      console.log(prefix, message, rest);
      break;
  }
}

/**
 * 翻译日志记录器类
 */
export class TranslationLogger {
  constructor(category = 'TRANSLATION') {
    this.category = category;
  }

  /**
   * 记录错误日志
   * @param {string} message - 错误消息
   * @param {Object} data - 附加数据
   */
  error(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.ERROR, this.category, message, data);
    outputToConsole(LOG_LEVELS.ERROR, logData);
  }

  /**
   * 记录警告日志
   * @param {string} message - 警告消息
   * @param {Object} data - 附加数据
   */
  warn(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.WARN, this.category, message, data);
    outputToConsole(LOG_LEVELS.WARN, logData);
  }

  /**
   * 记录信息日志
   * @param {string} message - 信息消息
   * @param {Object} data - 附加数据
   */
  info(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.INFO, this.category, message, data);
    outputToConsole(LOG_LEVELS.INFO, logData);
  }

  /**
   * 记录调试日志
   * @param {string} message - 调试消息
   * @param {Object} data - 附加数据
   */
  debug(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.DEBUG, this.category, message, data);
    outputToConsole(LOG_LEVELS.DEBUG, logData);
  }

  /**
   * 记录翻译开始
   * @param {string} text - 原文
   * @param {string} targetLang - 目标语言
   * @param {Object} options - 翻译选项
   */
  logTranslationStart(text, targetLang, options = {}) {
    this.info('开始翻译', {
      textLength: text.length,
      textPreview: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      targetLang,
      strategy: options.strategy || 'default',
      ...options
    });
  }

  /**
   * 记录翻译成功
   * @param {string} originalText - 原文
   * @param {string} translatedText - 译文
   * @param {Object} metrics - 翻译指标
   */
  logTranslationSuccess(originalText, translatedText, metrics = {}) {
    this.info('翻译成功', {
      originalLength: originalText.length,
      translatedLength: translatedText.length,
      compressionRatio: (translatedText.length / originalText.length).toFixed(2),
      processingTime: metrics.processingTime,
      strategy: metrics.strategy || 'default',
      tokenUsage: metrics.tokenUsage
    });
  }

  /**
   * 记录翻译失败
   * @param {string} text - 原文
   * @param {string} error - 错误信息
   * @param {Object} context - 错误上下文
   */
  logTranslationFailure(text, error, context = {}) {
    this.error('翻译失败', {
      textLength: text.length,
      textPreview: text.substring(0, 50) + '...',
      error: error.message || error,
      errorCode: error.code,
      attempt: context.attempt,
      maxRetries: context.maxRetries,
      strategy: context.strategy
    });
  }

  /**
   * 记录验证结果
   * @param {string} field - 字段名
   * @param {boolean} passed - 是否通过验证
   * @param {Object} details - 验证详情
   */
  logValidation(field, passed, details = {}) {
    const level = passed ? LOG_LEVELS.INFO : LOG_LEVELS.WARN;
    const message = `字段验证${passed ? '通过' : '失败'}: ${field}`;
    
    const logData = formatLogMessage(level, this.category, message, details);
    outputToConsole(level, logData);
  }

  /**
   * 记录性能指标
   * @param {string} operation - 操作名称
   * @param {number} duration - 耗时（毫秒）
   * @param {Object} metrics - 其他指标
   */
  logPerformance(operation, duration, metrics = {}) {
    this.info('性能指标', {
      operation,
      duration: `${duration}ms`,
      ...metrics
    });
  }

  /**
   * 记录批量操作统计
   * @param {string} operation - 操作名称
   * @param {Object} stats - 统计数据
   */
  logBatchStats(operation, stats) {
    this.info('批量操作统计', {
      operation,
      total: stats.total,
      success: stats.success,
      failed: stats.failed,
      successRate: `${((stats.success / stats.total) * 100).toFixed(1)}%`,
      totalTime: stats.totalTime ? `${stats.totalTime}ms` : undefined
    });
  }
}

/**
 * 创建翻译日志记录器
 * @param {string} category - 日志分类
 * @returns {TranslationLogger} 日志记录器实例
 */
export function createTranslationLogger(category = 'TRANSLATION') {
  return new TranslationLogger(category);
}

/**
 * 默认的翻译日志记录器
 */
export const logger = createTranslationLogger();

/**
 * API日志记录器
 */
export const apiLogger = createTranslationLogger('API');

/**
 * 验证日志记录器
 */
export const validationLogger = createTranslationLogger('VALIDATION');

/**
 * 性能日志记录器
 */
export const performanceLogger = createTranslationLogger('PERFORMANCE');

/**
 * 记录翻译会话信息
 * @param {string} sessionId - 会话ID
 * @param {Object} sessionData - 会话数据
 */
export function logTranslationSession(sessionId, sessionData) {
  logger.info('翻译会话', {
    sessionId,
    ...sessionData
  });
}

/**
 * 记录短文本翻译详情（用于调试边界情况）
 * @param {string} originalText - 原文
 * @param {string} translatedText - 译文
 * @param {string} targetLang - 目标语言
 * @param {Object} context - 上下文信息
 */
export function logShortTextTranslation(originalText, translatedText, targetLang, context = {}) {
  logger.debug('短文本翻译详情', {
    originalText: `"${originalText}"`,
    translatedText: `"${translatedText}"`,
    targetLang,
    originalLength: originalText.length,
    translatedLength: translatedText.length,
    isIdentical: originalText === translatedText,
    isBoundaryCase: originalText.length >= 15 && originalText.length <= 20,
    ...context
  });
}

/**
 * 记录关键测试点信息（用于调试截断问题）
 * @param {string} testPoint - 测试点标识
 * @param {number} position - 位置
 * @param {number} totalLength - 总长度
 * @param {boolean} found - 是否找到
 */
export function logKeyTestPoint(testPoint, position, totalLength, found) {
  logger.info('关键测试点检查', {
    testPoint,
    position,
    totalLength,
    remainingChars: totalLength - position,
    found,
    status: found ? 'FOUND' : 'NOT_FOUND'
  });
}

/**
 * 记录英文残留检测结果
 * @param {Array} englishParts - 检测到的英文部分
 * @param {number} totalLength - 总文本长度
 */
export function logEnglishRemnants(englishParts, totalLength) {
  if (englishParts.length > 0) {
    logger.warn('检测到英文残留', {
      count: englishParts.length,
      totalLength,
      examples: englishParts.slice(0, 3).map(part => part.substring(0, 50) + '...')
    });
  } else {
    logger.info('未检测到英文残留');
  }
}

/**
 * 记录翻译质量分析
 * @param {Object} qualityMetrics - 质量指标
 */
export function logTranslationQuality(qualityMetrics) {
  const {
    chineseRatio,
    englishRatio,
    compressionRatio,
    isComplete,
    hasRemnants
  } = qualityMetrics;
  
  const status = isComplete && !hasRemnants ? 'EXCELLENT' : 
                isComplete ? 'GOOD' : 'NEEDS_IMPROVEMENT';
  
  logger.info('翻译质量分析', {
    status,
    chineseRatio: `${(chineseRatio * 100).toFixed(1)}%`,
    englishRatio: `${(englishRatio * 100).toFixed(1)}%`,
    compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
    isComplete,
    hasRemnants
  });
}