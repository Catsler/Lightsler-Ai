/**
 * 翻译服务错误处理工具
 * 提供统一的错误处理、重试机制和自定义错误类
 * 增强版：集成错误收集系统
 */

import { config } from './config.server.js';
import { collectError, ERROR_TYPES } from '../services/error-collector.server.js';

/**
 * 翻译服务自定义错误类
 */
export class TranslationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TranslationError';
    this.code = options.code || 'TRANSLATION_ERROR';
    this.category = options.category || 'GENERAL';
    this.retryable = options.retryable || false;
    this.context = options.context || {};
    this.originalError = options.originalError || null;
    
    // 保持错误堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TranslationError);
    }
  }

  /**
   * 转换为JSON格式
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * API相关错误
 */
export class APIError extends TranslationError {
  constructor(message, statusCode, options = {}) {
    super(message, {
      ...options,
      code: options.code || `API_ERROR_${statusCode}`,
      category: 'API'
    });
    this.statusCode = statusCode;
    this.retryable = [408, 429, 500, 502, 503, 504].includes(statusCode);
  }
}

/**
 * 验证相关错误
 */
export class ValidationError extends TranslationError {
  constructor(message, validationType, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'VALIDATION_ERROR',
      category: 'VALIDATION'
    });
    this.validationType = validationType;
    this.retryable = false;
  }
}

/**
 * 配置相关错误
 */
export class ConfigError extends TranslationError {
  constructor(message, configKey, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'CONFIG_ERROR',
      category: 'CONFIG'
    });
    this.configKey = configKey;
    this.retryable = false;
  }
}

/**
 * 网络相关错误
 */
export class NetworkError extends TranslationError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'NETWORK_ERROR',
      category: 'NETWORK',
      retryable: true
    });
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends TranslationError {
  constructor(message, duration, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'TIMEOUT_ERROR',
      category: 'TIMEOUT',
      retryable: true
    });
    this.duration = duration;
  }
}

/**
 * 错误分类器 - 将原始错误分类为特定错误类型
 * @param {Error} error - 原始错误
 * @param {Object} context - 错误上下文，用于提供更多信息
 * @param {boolean} collectToDatabase - 是否收集到数据库
 * @returns {TranslationError} 分类后的错误
 */
export function classifyError(error, context = {}, collectToDatabase = true) {
  if (error instanceof TranslationError) {
    // 如果需要收集到数据库
    if (collectToDatabase) {
      collectErrorToDatabase(error, context);
    }
    return error;
  }

  const message = error.message || '未知错误';
  const errorContext = {
    originalMessage: message,
    originalName: error.name,
    ...context
  };

  // 网络错误
  if (error.name === 'AbortError') {
    return new TimeoutError('请求超时', context.timeout, {
      context: errorContext,
      originalError: error
    });
  }

  if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || message.includes('fetch failed')) {
    return new NetworkError('网络连接失败', {
      context: errorContext,
      originalError: error
    });
  }

  // API错误
  if (message.includes('401') || message.includes('403')) {
    return new APIError('API认证失败', 401, {
      context: errorContext,
      originalError: error
    });
  }

  if (message.includes('429')) {
    return new APIError('API调用频率限制', 429, {
      context: errorContext,
      originalError: error
    });
  }

  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return new APIError('服务器内部错误', 500, {
      context: errorContext,
      originalError: error
    });
  }

  // JSON解析错误
  if (error instanceof SyntaxError && message.includes('JSON')) {
    return new ValidationError('API响应格式错误', 'JSON_PARSE', {
      context: errorContext,
      originalError: error
    });
  }

  // 配置错误
  if (message.includes('密钥') || message.includes('API') && message.includes('配置')) {
    return new ConfigError('API配置错误', 'API_KEY', {
      context: errorContext,
      originalError: error
    });
  }

  // 默认翻译错误
  const translationError = new TranslationError(message, {
    context: errorContext,
    originalError: error
  });
  
  // 收集错误到数据库
  if (collectToDatabase) {
    collectErrorToDatabase(translationError, context);
  }
  
  return translationError;
}

/**
 * 高阶函数：为函数添加统一的错误处理
 * @param {Function} fn - 要包装的异步函数
 * @param {Object} options - 错误处理选项
 * @returns {Function} 包装后的函数
 */
export function withErrorHandling(fn, options = {}) {
  const {
    context = {},
    logger = console,
    rethrow = true,
    defaultReturnValue = null
  } = options;

  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      const translationError = classifyError(error, {
        ...context,
        functionName: fn.name,
        args: args.length > 0 ? args.map(arg => 
          typeof arg === 'string' ? arg.substring(0, 100) + '...' : typeof arg
        ) : []
      });

      // 记录错误
      logger.error(`${fn.name}函数执行错误:`, translationError.toJSON());

      if (rethrow) {
        throw translationError;
      }

      // KISS 保障：默认不要返回 null，返回一个标准化的错误对象，避免调用方空引用崩溃
      // 如果调用方提供了 defaultReturnValue，则优先使用之
      return defaultReturnValue ?? createErrorResponse(translationError);
    }
  };
}

/**
 * 创建重试处理器
 * @param {Object} options - 重试配置
 * @returns {Function} 重试处理器函数
 */
export function createRetryHandler(options = {}) {
  const {
    maxRetries = config.translation.maxRetries,
    baseDelay = 1000,
    maxDelay = 10000,
    exponentialBackoff = true,
    retryCondition = (error) => error.retryable
  } = options;

  return async function(fn, context = {}) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const translationError = classifyError(error, {
          ...context,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1
        });
        
        lastError = translationError;
        
        // 检查是否应该重试
        const shouldRetry = attempt < maxRetries && retryCondition(translationError);
        
        if (!shouldRetry) {
          break;
        }
        
        // 计算延迟时间
        const delay = exponentialBackoff 
          ? Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
          : baseDelay;
        
        // 记录重试信息
        console.log(`函数执行失败，${delay}ms后进行第${attempt + 2}次尝试... (${translationError.message})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  };
}

/**
 * 标准化错误响应格式
 * @param {Error} error - 错误对象
 * @param {string} defaultText - 默认返回文本
 * @returns {Object} 标准化的错误响应
 */
export function createErrorResponse(error, defaultText = '') {
  const translationError = classifyError(error);
  
  return {
    success: false,
    text: defaultText,
    error: translationError.message,
    errorCode: translationError.code,
    errorCategory: translationError.category,
    retryable: translationError.retryable,
    isOriginal: true,
    context: translationError.context
  };
}

/**
 * 异步函数的安全执行器
 * 提供统一的错误处理和日志记录
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 执行结果
 */
export async function safeExecute(fn, options = {}) {
  const {
    context = {},
    logger = console,
    defaultReturnValue = { success: false, error: '执行失败' },
    logLevel = 'error'
  } = options;

  try {
    const result = await fn();
    return result;
  } catch (error) {
    const translationError = classifyError(error, context);
    
    // 根据日志级别记录错误
    if (logger[logLevel]) {
      logger[logLevel](`安全执行失败:`, translationError.toJSON());
    }
    
    return {
      ...defaultReturnValue,
      error: translationError.message,
      errorCode: translationError.code,
      originalError: translationError
    };
  }
}

/**
 * 批量操作的错误收集器
 */
export class ErrorCollector {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 添加错误
   * @param {Error|string} error - 错误信息
   * @param {Object} context - 错误上下文
   */
  addError(error, context = {}) {
    const translationError = typeof error === 'string' 
      ? new TranslationError(error, { context })
      : classifyError(error, context);
    
    this.errors.push(translationError);
  }

  /**
   * 添加警告
   * @param {string} message - 警告信息
   * @param {Object} context - 警告上下文
   */
  addWarning(message, context = {}) {
    this.warnings.push({
      message,
      context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 检查是否有错误
   */
  hasErrors() {
    return this.errors.length > 0;
  }

  /**
   * 检查是否有警告
   */
  hasWarnings() {
    return this.warnings.length > 0;
  }

  /**
   * 获取错误摘要
   */
  getSummary() {
    return {
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      errors: this.errors.map(e => e.toJSON()),
      warnings: this.warnings
    };
  }

  /**
   * 清空所有收集的错误和警告
   */
  clear() {
    this.errors = [];
    this.warnings = [];
  }
}

/**
 * 收集错误到数据库（异步，不阻塞主流程）
 * @param {Error} error - 错误对象
 * @param {Object} context - 错误上下文
 */
export function collectErrorToDatabase(error, context = {}) {
  // 异步收集错误，不等待结果
  Promise.resolve().then(async () => {
    try {
      // 确定错误类型
      let errorType = ERROR_TYPES.SYSTEM;
      
      if (error instanceof APIError) {
        errorType = ERROR_TYPES.API;
      } else if (error instanceof ValidationError) {
        errorType = ERROR_TYPES.VALIDATION;
      } else if (error instanceof NetworkError) {
        errorType = ERROR_TYPES.NETWORK;
      } else if (error instanceof TimeoutError) {
        errorType = ERROR_TYPES.NETWORK;
      } else if (error instanceof ConfigError) {
        errorType = ERROR_TYPES.SYSTEM;
      } else if (error.category === 'TRANSLATION') {
        errorType = ERROR_TYPES.TRANSLATION;
      }
      
      // 准备错误数据
      const errorData = {
        errorType,
        errorCategory: error.category || 'ERROR',
        errorCode: error.code || 'UNKNOWN',
        message: error.message,
        stack: error.stack,
        stackTrace: error.stack,
        retryable: error.retryable || false,
        statusCode: error.statusCode || null,
        ...error.context
      };
      
      // 收集错误
      await collectError(errorData, {
        ...context,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      });
      
    } catch (collectError) {
      // 收集错误本身失败，只记录日志，不影响主流程
      console.error('错误收集失败:', collectError);
    }
  });
}

// captureError 是 collectErrorToDatabase 的别名，用于向后兼容
export const captureError = collectErrorToDatabase;
