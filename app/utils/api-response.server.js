import { json } from "@remix-run/node";

/**
 * 统一API响应格式处理
 */

/**
 * 成功响应格式
 * @param {*} data - 响应数据
 * @param {string} message - 成功消息
 * @param {number} status - HTTP状态码
 * @returns {Response} JSON响应
 */
export function successResponse(data, message = "操作成功", status = 200) {
  return json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  }, { status });
}

/**
 * 错误响应格式
 * @param {string} message - 错误消息
 * @param {*} error - 错误详情
 * @param {number} status - HTTP状态码
 * @returns {Response} JSON响应
 */
export function errorResponse(message = "操作失败", error = null, status = 500) {
  console.error("API错误:", { message, error, timestamp: new Date().toISOString() });
  
  return json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : null,
    timestamp: new Date().toISOString()
  }, { status });
}

/**
 * 参数验证错误响应
 * @param {Array} validationErrors - 验证错误列表
 * @returns {Response} JSON响应
 */
export function validationErrorResponse(validationErrors) {
  return json({
    success: false,
    message: "参数验证失败",
    errors: validationErrors,
    timestamp: new Date().toISOString()
  }, { status: 400 });
}

/**
 * 记录API操作日志
 * @param {string} operation - 操作名称
 * @param {string} shopDomain - 店铺域名
 * @param {*} details - 操作详情
 * @param {boolean} success - 是否成功
 */
export function logApiOperation(operation, shopDomain, details = {}, success = true, silent = false) {
  // 对于状态查询等频繁操作，可以设置为静默模式
  if (silent) return;
  
  const logLevel = success ? 'info' : 'error';
  const logData = {
    operation,
    shopDomain,
    details,
    success,
    timestamp: new Date().toISOString()
  };
  
  console[logLevel](`API操作 - ${operation}:`, logData);
}

/**
 * 验证必需参数
 * @param {Object} params - 参数对象
 * @param {Array} requiredFields - 必需字段列表
 * @returns {Array} 验证错误列表
 */
export function validateRequiredParams(params, requiredFields) {
  const errors = [];
  
  for (const field of requiredFields) {
    if (!params[field] || (typeof params[field] === 'string' && params[field].trim() === '')) {
      errors.push({
        field,
        message: `${field} 是必需参数`
      });
    }
  }
  
  return errors;
}

/**
 * 异步操作包装器，统一错误处理
 * @param {Function} operation - 异步操作函数
 * @param {string} operationName - 操作名称
 * @param {string} shopDomain - 店铺域名
 * @returns {Promise<Response>} 响应结果
 */
export async function withErrorHandling(operation, operationName, shopDomain = '', options = {}) {
  const { silent = false } = options;
  
  try {
    // 对于频繁的状态查询操作，减少日志输出
    const shouldLogFrequentOps = operationName !== '获取状态' || !silent;
    
    if (shouldLogFrequentOps) {
      logApiOperation(operationName, shopDomain, { status: 'started' });
    }
    
    const result = await operation();
    
    if (shouldLogFrequentOps) {
      logApiOperation(operationName, shopDomain, { status: 'completed' }, true);
    }
    
    return result;
    
    return result;
    
  } catch (error) {
    // 处理Response对象类型的错误
    let errorMessage = "未知错误";
    
    if (error instanceof Response) {
      try {
        const errorData = await error.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (e) {
        errorMessage = `HTTP ${error.status} ${error.statusText}`;
      }
    } else if (error?.message) {
      errorMessage = error.message;
    } else if (error?.toString && typeof error.toString === 'function') {
      errorMessage = error.toString();
    }
    
    // 错误日志总是输出，因为错误比较重要
    logApiOperation(operationName, shopDomain, { 
      status: 'failed', 
      error: errorMessage
    }, false);
    
    // 区分不同类型的错误
    
    if (errorMessage.includes('GraphQL错误') || errorMessage.includes('更新') || errorMessage.includes('用户错误')) {
      return errorResponse(`${operationName}失败: ${errorMessage}`, errorMessage, 400);
    }
    
    if (errorMessage.includes('翻译API')) {
      return errorResponse("翻译服务暂时不可用，请稍后重试", errorMessage, 503);
    }
    
    if (errorMessage.includes('数据库') || errorMessage.includes('Prisma')) {
      return errorResponse("数据库操作失败，请稍后重试", errorMessage, 500);
    }
    
    return errorResponse(`${operationName}失败: ${errorMessage}`, errorMessage, 500);
  }
}