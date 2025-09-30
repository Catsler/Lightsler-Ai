import { createApiRoute } from "../utils/base-route.server.js";

/**
 * GET请求处理函数：测试API响应
 */
async function handleGetHello() {
  return {
    message: "Hello from API via GET!",
    timestamp: new Date().toISOString()
  };
}

/**
 * POST请求处理函数：测试API响应
 */
async function handlePostHello() {
  return {
    message: "Hello from API!",
    timestamp: new Date().toISOString()
  };
}

export const loader = createApiRoute(handleGetHello, {
  requireAuth: false,
  operationName: 'Hello GET测试'
});

export const action = createApiRoute(handlePostHello, {
  requireAuth: false,
  operationName: 'Hello POST测试'
});