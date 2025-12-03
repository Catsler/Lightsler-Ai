import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 已废弃的集合扫描端点处理函数
 * @deprecated 此API已弃用，请使用 /api/scan-resources
 * 计划在3周后(2025-10-19)完全移除
 */
async function handleDeprecatedScanCollections() {
  const sunsetDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

  const response = {
    deprecated: true,
    message: "此端点已弃用，请使用 /api/scan-resources",
    migration: {
      endpoint: "/api/scan-resources",
      method: "POST",
      example: {
        resourceType: "COLLECTION",
        mode: "all"
      }
    },
    sunset: sunsetDate,
    documentation: "请参考项目文档了解迁移指南"
  };

  // 直接返回Response对象以保持410状态码和特殊headers
  return new Response(JSON.stringify(response), {
    status: 410,
    headers: {
      "Content-Type": "application/json",
      "Deprecation": "true",
      "Sunset": new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toUTCString(),
      "Link": "</api/scan-resources>; rel=\"successor-version\""
    }
  });
}

export const action = createApiRoute(handleDeprecatedScanCollections, {
  requireAuth: true,
  operationName: '已废弃的集合扫描端点'
});
