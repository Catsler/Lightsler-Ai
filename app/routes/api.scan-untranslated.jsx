import { json } from "@remix-run/node";

/**
 * @deprecated 此API已弃用，请使用 /api/scan-resources
 * 计划在3周后(2025-10-19)完全移除
 */
export const action = async ({ request }) => {
  const sunsetDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

  return json({
    deprecated: true,
    message: "此端点已弃用，请使用 /api/scan-resources",
    migration: {
      endpoint: "/api/scan-resources",
      method: "POST",
      example: {
        resourceType: "PRODUCT", // 或其他资源类型
        mode: "untranslated"
      }
    },
    sunset: sunsetDate,
    documentation: "请参考项目文档了解迁移指南"
  }, {
    status: 410,
    headers: {
      "Deprecation": "true",
      "Sunset": new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toUTCString(),
      "Link": "</api/scan-resources>; rel=\"successor-version\""
    }
  });
};