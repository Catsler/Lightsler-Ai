import { json } from "@remix-run/node";

export function sanitizeForJson(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  const valueType = typeof value;

  if (valueType === 'bigint') {
    return value.toString();
  }

  if (valueType === 'number' || valueType === 'string' || valueType === 'boolean') {
    return value;
  }

  if (valueType === 'symbol') {
    return value.toString();
  }

  if (valueType === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return value.map(item => sanitizeForJson(item, seen));
  }

  if (value instanceof Map) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const entries = {};
    for (const [key, mapValue] of value.entries()) {
      entries[String(key)] = sanitizeForJson(mapValue, seen);
    }
    return entries;
  }

  if (value instanceof Set) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return Array.from(value).map(item => sanitizeForJson(item, seen));
  }

  if (ArrayBuffer.isView(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return Array.from(value, item => sanitizeForJson(item, seen));
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }

  if (valueType === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const sanitized = {};
    for (const [key, innerValue] of Object.entries(value)) {
      sanitized[key] = sanitizeForJson(innerValue, seen);
    }
    return sanitized;
  }

  return value;
}


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
  const payload = {
    success: true,
    message,
    data: sanitizeForJson(data),
    timestamp: new Date().toISOString()
  };

  return json(payload, { status });
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

  const includeError = process.env.NODE_ENV === 'development';
  const payload = {
    success: false,
    message,
    error: includeError ? sanitizeForJson(error) : null,
    timestamp: new Date().toISOString()
  };

  return json(payload, { status });
}

/**
 * 参数验证错误响应
 * @param {Array} validationErrors - 验证错误列表
 * @returns {Response} JSON响应
 */
export function validationErrorResponse(validationErrors) {
  const payload = {
    success: false,
    message: "参数验证失败",
    errors: sanitizeForJson(validationErrors),
    timestamp: new Date().toISOString()
  };

  return json(payload, { status: 400 });
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
 * 创建统一的API响应
 * @param {*} data - 响应数据
 * @param {string} message - 消息
 * @param {boolean} success - 是否成功
 * @returns {Object} 响应对象
 */
export function createApiResponse(data = null, message = '', success = true) {
  return {
    success,
    message: message || (success ? '操作成功' : '操作失败'),
    data: sanitizeForJson(data),
    timestamp: new Date().toISOString()
  };
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
  const {
    silent = false,
    requiredParams = [],
    payload: validationPayload = null
  } = options;

  if (requiredParams.length > 0) {
    if (!validationPayload || typeof validationPayload !== 'object') {
      return validationErrorResponse(requiredParams.map((field) => ({
        field,
        message: `${field} 是必需参数`
      })));
    }

    const validationErrors = validateRequiredParams(validationPayload, requiredParams);
    if (validationErrors.length > 0) {
      return validationErrorResponse(validationErrors);
    }
  }

  
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
    if (/serialize|circular structure|Do not know how to serialize/i.test(errorMessage)) {
      return errorResponse("响应数据包含无法序列化的内容，请联系管理员处理", error, 500);
    }

    
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
