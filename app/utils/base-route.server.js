/**
 * 基础路由处理器 - 统一API路由包装
 * 基于 KISS 原则，提供简单一致的路由处理
 */

import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { apiLogger } from "./logger.server.js";
import { recordApiCall } from "../services/api-monitor.server.js";

/**
 * @typedef {Object} RouteContext
 * @property {Request} request - 原始请求对象
 * @property {string} requestId - 当前请求的唯一标识
 * @property {object | undefined} admin - Shopify Admin API 上下文（登录态才存在）
 * @property {object | undefined} session - 当前店铺会话信息（登录态才存在）
 * @property {Record<string, any>} params - query 与 body 合并后的普通对象
 * @property {URLSearchParams} searchParams - 原始 URLSearchParams，兼容调用方对 `.get()` 的依赖
 * @property {Record<string, string>} routeParams - Remix 传入的路由参数
 */

/**
 * 解析请求参数
 * @param {Request} request - 请求对象
 * @returns {Promise<Object>} 解析后的参数
 */
async function parseParams(request) {
  try {
    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams);

    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // 使用克隆的请求读取body，保留原始请求供处理函数使用
        const body = await request.clone().json();
        return { ...searchParams, ...body };
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        // 使用克隆的请求读取formData，保留原始请求供处理函数使用
        // 支持 application/x-www-form-urlencoded 和 multipart/form-data
        const formData = await request.clone().formData();
        const formParams = Object.fromEntries(formData);
        return { ...searchParams, ...formParams };
      }
    }

    return searchParams;
  } catch (error) {
    apiLogger.warn('Failed to parse request params', {
      error: error.message,
      metric: { param_parse_failed: 1 }
    });
    return {};
  }
}

/**
 * 标准化响应格式
 * @param {any} data - 响应数据
 * @param {boolean} success - 是否成功
 * @returns {Response} JSON响应
 */
function createResponse(data, success = true) {
  return json({
    success,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * 创建统一的API路由处理器
 *
 * ⚠️ 开发建议：
 * - 推荐使用 context.params 获取解析后的参数（query + body 合并）
 * - 如需 FormData 特定方法（.getAll() 等），仍可直接访问 request.formData()
 * - 两种方式都受支持，但 context.params 更简洁一致
 *
 * @param {Function} handler - 业务处理函数
 * @param {Object} options - 选项配置
 * @returns {Function} 路由处理函数
 */
export function createApiRoute(handler, options = {}) {
  const {
    requireAuth = true,
    operationName = 'API操作',
    validateParams = null,
    timeout = 30000,
    metricKey
  } = options;

  return async ({ request, params: routeParams }) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    let timeoutId = null;

    let admin;
    let session;
    let operationKeyValue = metricKey || null;

    try {
      // 认证处理
      if (requireAuth) {
        try {
          const authResult = await authenticate.admin(request);
          admin = authResult.admin;
          session = authResult.session;
        } catch (error) {
          apiLogger.error('Authentication failed', {
            requestId,
            operationName,
            error: error.message
          });
          throw error;
        }
      }

      // URL 与查询参数（提供原生 URLSearchParams 以保持向后兼容）
      const url = new URL(request.url);
      const searchParams = url.searchParams;
      if (!operationKeyValue) {
        operationKeyValue = url.pathname;
      }

      // 参数解析（合并 query 与 body 为普通对象）
      const params = await parseParams(request);

      // 参数验证
      if (validateParams && typeof validateParams === 'function') {
        const validation = validateParams(params);
        if (!validation.valid) {
          apiLogger.warn('Parameter validation failed', {
            requestId,
            operationName,
            errors: validation.errors
          });
          const response = json({
            success: false,
            message: 'Parameter validation failed',
            errors: validation.errors,
            timestamp: new Date().toISOString()
          }, { status: 400 });
          const duration = Date.now() - startTime;
          recordApiCall({
            operation: operationKeyValue,
            success: false,
            duration,
            statusCode: response.status,
            method: request.method,
            shopDomain: session?.shop
          });
          return response;
        }
      }

      // 构建处理器上下文
      /** @type {RouteContext} */
      const context = {
        request,
        requestId,
        admin,
        session,
        params,
        searchParams, // 新增：提供原生 URLSearchParams，修复期望 searchParams.get 的调用方
        routeParams: routeParams || {}
      };

      apiLogger.info(`${operationName} started`, {
        requestId,
        operationName,
        method: request.method,
        shopDomain: session?.shop
      });

      // 执行业务逻辑（带超时保护）
      const result = await Promise.race([
        handler(context),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Request timeout')), timeout);
        })
      ]);

      const duration = Date.now() - startTime;

      apiLogger.info(`${operationName} completed`, {
        requestId,
        operationName,
        duration,
        shopDomain: session?.shop
      });

      // 标准化响应
      let response;
      if (result && typeof result === 'object' && 'success' in result) {
        // 如果处理器已经返回标准格式，直接返回
        response = json(result);
      } else {
        // 包装为标准格式
        response = createResponse(result);
      }

      recordApiCall({
        operation: operationKeyValue,
        success: true,
        duration,
        statusCode: response.status,
        method: request.method,
        shopDomain: session?.shop
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;

      apiLogger.error(`${operationName} failed`, {
        requestId,
        operationName,
        duration,
        error: error.message,
        stack: error.stack
      });

      // 返回错误响应
      if (!operationKeyValue) {
        try {
          operationKeyValue = new URL(request.url).pathname;
        } catch (_) {
          operationKeyValue = 'unknown';
        }
      }

      const response = json({
        success: false,
        message: error.message || 'An error occurred',
        timestamp: new Date().toISOString()
      }, { status: 500 });

      recordApiCall({
        operation: operationKeyValue,
        success: false,
        duration,
        statusCode: response.status,
        method: request.method,
        shopDomain: session?.shop
      });

      return response;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}

/**
 * 参数验证器工厂
 * @param {Array<string>} required - 必需参数
 * @param {Object} schema - 参数模式（可选）
 * @returns {Function} 验证函数
 */
export function createValidator(required = [], schema = {}) {
  return (params) => {
    const errors = [];

    // 检查必需参数
    for (const field of required) {
      if (!params[field]) {
        errors.push({
          field,
          message: `${field} is required`
        });
      }
    }

    // 简单的类型验证
    for (const [field, type] of Object.entries(schema)) {
      if (params[field] && typeof params[field] !== type) {
        errors.push({
          field,
          message: `${field} must be of type ${type}`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  };
}

/**
 * 常用的验证器
 */
export const validators = {
  language: createValidator(['language'], { language: 'string' }),
  resourceIds: createValidator(['resourceIds'], { resourceIds: 'object' }),
  shopId: createValidator(['shopId'], { shopId: 'string' })
};

export default createApiRoute;
