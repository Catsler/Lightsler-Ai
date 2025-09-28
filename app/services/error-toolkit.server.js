/**
 * 错误工具包 - 统一错误处理转发层
 * 基于KISS原则，提供简化的错误处理接口
 */

import { collectError } from './error-collector.server.js';
import { captureError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';

/**
 * 统一错误收集接口
 * @param {string} operation 操作名称
 * @param {Error|Object} error 错误对象或错误信息
 * @param {Object} context 上下文信息
 */
export async function recordError(operation, error, context = {}) {
  try {
    // 标准化错误格式
    const standardError = normalizeError(error);
    
    // 构建错误负载
    const errorPayload = {
      errorType: 'SYSTEM',
      errorCategory: determineErrorCategory(standardError),
      errorCode: standardError.code || 'UNKNOWN_ERROR',
      message: standardError.message,
      stack: standardError.stack,
      operation,
      ...extractContextInfo(context)
    };

    // 同时记录到两个系统
    await Promise.allSettled([
      collectError(errorPayload, { operation }),
      captureError(operation, standardError, context)
    ]);

    logger.error('错误已记录', {
      operation,
      errorCode: errorPayload.errorCode,
      category: errorPayload.errorCategory
    });

  } catch (recordingError) {
    // 错误记录失败时的降级处理
    logger.error('错误记录失败', {
      operation,
      originalError: error.message,
      recordingError: recordingError.message
    });
  }
}

/**
 * 标准化错误对象
 */
function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }
  
  if (typeof error === 'string') {
    return new Error(error);
  }
  
  if (error && typeof error === 'object') {
    const err = new Error(error.message || 'Unknown error');
    err.code = error.code;
    err.stack = error.stack;
    return err;
  }
  
  return new Error('Unknown error occurred');
}

/**
 * 确定错误类别
 */
function determineErrorCategory(error) {
  const message = error.message?.toLowerCase() || '';
  const code = error.code?.toLowerCase() || '';
  
  if (message.includes('network') || message.includes('fetch') || code.includes('econnreset')) {
    return 'NETWORK';
  }
  
  if (message.includes('timeout') || code.includes('timeout')) {
    return 'TIMEOUT';
  }
  
  if (message.includes('rate limit') || message.includes('quota')) {
    return 'RATE_LIMIT';
  }
  
  if (message.includes('auth') || message.includes('permission') || message.includes('unauthorized')) {
    return 'AUTH';
  }
  
  if (message.includes('validation') || message.includes('invalid')) {
    return 'VALIDATION';
  }
  
  return 'ERROR';
}

/**
 * 提取上下文信息
 */
function extractContextInfo(context) {
  const extracted = {};
  
  // 标准字段提取
  if (context.shopId) extracted.shopId = context.shopId;
  if (context.resourceType) extracted.resourceType = context.resourceType;
  if (context.resourceId) extracted.resourceId = context.resourceId;
  if (context.translationSessionId) extracted.translationSessionId = context.translationSessionId;
  
  // 其他上下文放入context字段
  const remainingContext = { ...context };
  delete remainingContext.shopId;
  delete remainingContext.resourceType;
  delete remainingContext.resourceId;
  delete remainingContext.translationSessionId;
  
  if (Object.keys(remainingContext).length > 0) {
    extracted.context = remainingContext;
  }
  
  return extracted;
}

/**
 * API错误处理 - 用于路由层
 */
export function withErrorRecording(operation) {
  return async (handler) => {
    return async (...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        await recordError(operation, error, {
          route: args[0]?.request?.url
        });
        throw error;
      }
    };
  };
}

/**
 * 服务错误处理 - 用于服务层
 */
export async function executeWithErrorRecording(operation, fn, context = {}) {
  try {
    return await fn();
  } catch (error) {
    await recordError(operation, error, context);
    throw error;
  }
}

// 向后兼容的别名
export const withApiError = withErrorRecording;
export const withServiceError = executeWithErrorRecording;

export default {
  recordError,
  withErrorRecording,
  executeWithErrorRecording,
  withApiError,
  withServiceError
};