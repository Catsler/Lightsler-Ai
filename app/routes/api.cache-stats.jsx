/**
 * 缓存统计API端点
 */

import { getMemoryCache } from "../services/memory-cache.server.js";
import { createApiRoute } from "../utils/base-route.server.js";
import { json } from "@remix-run/node";

/**
 * GET请求处理函数：获取缓存统计
 */
async function handleGetCacheStats() {
  const cache = getMemoryCache();
  const stats = cache.getStats();

  return {
    stats,
    timestamp: new Date().toISOString()
  };
}

/**
 * POST/DELETE请求处理函数：缓存操作
 */
async function handleCacheAction({ request }) {
  const method = request.method;

  if (method === "DELETE") {
    // 清空缓存
    const cache = getMemoryCache();
    cache.clear();

    return {
      message: "缓存已清空"
    };
  }

  return json({
    success: false,
    error: "Method not allowed"
  }, { status: 405 });
}

export const loader = createApiRoute(handleGetCacheStats, {
  requireAuth: true,
  operationName: '获取缓存统计'
});

export const action = createApiRoute(handleCacheAction, {
  requireAuth: true,
  operationName: '缓存操作'
});
