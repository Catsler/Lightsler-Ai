/**
 * 缓存统计API端点
 */

import { json } from "@remix-run/node";
import { getMemoryCache } from "../services/memory-cache.server.js";

export const loader = async ({ request }) => {
  try {
    const cache = getMemoryCache();
    const stats = cache.getStats();
    
    return json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  const method = request.method;
  
  if (method === "DELETE") {
    // 清空缓存
    try {
      const cache = getMemoryCache();
      cache.clear();
      
      return json({
        success: true,
        message: "缓存已清空"
      });
    } catch (error) {
      return json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
  }
  
  return json({
    success: false,
    error: "Method not allowed"
  }, { status: 405 });
};