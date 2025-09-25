import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { getOrCreateShop } from "../services/database.server.js";
import { performIncrementalScan } from "../services/incremental-translation.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

async function parseScanPayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      return typeof body === "object" && body !== null ? body : {};
    } catch (error) {
      console.warn("解析JSON负载失败，回退到空对象", error);
      return {};
    }
  }

  const formData = await request.formData();
  const payload = {};

  for (const [key, value] of formData.entries()) {
    payload[key] = value;
  }

  return payload;
}

function normalizeScanPayload(rawPayload = {}) {
  const language = typeof rawPayload.language === "string" && rawPayload.language.trim()
    ? rawPayload.language.trim()
    : "zh-CN";

  const resourceType = typeof rawPayload.resourceType === "string" && rawPayload.resourceType.trim()
    ? rawPayload.resourceType.trim()
    : null;

  const includeDetails = rawPayload.includeDetails === true || rawPayload.includeDetails === "true";

  const limitCandidate = Number.parseInt(rawPayload.limit, 10);
  const limit = Number.isFinite(limitCandidate) && limitCandidate > 0 ? limitCandidate : 200;

  let resourceIds = [];
  if (Array.isArray(rawPayload.resourceIds)) {
    resourceIds = rawPayload.resourceIds.filter((value) => typeof value === "string" && value.trim() !== "");
  } else if (typeof rawPayload.resourceIds === "string" && rawPayload.resourceIds.trim()) {
    try {
      const parsed = JSON.parse(rawPayload.resourceIds);
      if (Array.isArray(parsed)) {
        resourceIds = parsed.filter((value) => typeof value === "string" && value.trim() !== "");
      }
    } catch (error) {
      console.warn("解析resourceIds失败，忽略该字段", error);
    }
  }

  return {
    language,
    resourceType,
    includeDetails,
    limit,
    resourceIds
  };
}

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const rawPayload = await parseScanPayload(request);
  const payload = normalizeScanPayload(rawPayload);

  return withErrorHandling(async () => {
    const shop = await getOrCreateShop(session.shop, session.accessToken);

    const report = await performIncrementalScan({
      shopId: shop.id,
      language: payload.language,
      resourceType: payload.resourceType,
      includeDetails: payload.includeDetails,
      limit: payload.limit,
      resourceIds: payload.resourceIds
    });

    return json({
      success: true,
      message: "增量翻译覆盖扫描完成",
      data: report
    });
  }, "增量翻译扫描", session.shop, {
    requiredParams: ["language"],
    payload
  });
};
