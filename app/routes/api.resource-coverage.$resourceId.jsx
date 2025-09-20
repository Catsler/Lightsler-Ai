import { withErrorHandling, successResponse, errorResponse } from "../utils/api-response.server.js";
import { getResourceCoverage } from "../services/language-coverage.server.js";
import COVERAGE_CONFIG from "../utils/coverage-config.server.js";

const STATUS_FILTERS = new Set(['UP_TO_DATE', 'STALE', 'MISSING', 'LOW_QUALITY', 'UNSYNCED']);

function parseStatusFilter(raw) {
  if (!raw) return null;
  return raw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => STATUS_FILTERS.has(s));
}

export async function loader({ request, params }) {
  const { authenticate } = await import("../shopify.server.js");
  const { session } = await authenticate.admin(request);
  const shopId = session?.shop;

  return withErrorHandling(async () => {
    const resourceId = params.resourceId;
    if (!resourceId) {
      return errorResponse('resourceId 参数缺失', null, 400);
    }

    const url = new URL(request.url);
    const language = url.searchParams.get('language');
    if (!language) {
      return errorResponse('language 参数必填', null, 400);
    }

    const denominatorPolicy = url.searchParams.get('denominatorPolicy') || COVERAGE_CONFIG.defaultDenominatorPolicy;
    let qualityThreshold = Number(url.searchParams.get('qualityThreshold') ?? COVERAGE_CONFIG.qualityThreshold);
    if (!Number.isFinite(qualityThreshold)) {
      qualityThreshold = COVERAGE_CONFIG.qualityThreshold;
    }
    const minQuality = COVERAGE_CONFIG.qualityThresholdRange?.min ?? 0;
    const maxQuality = COVERAGE_CONFIG.qualityThresholdRange?.max ?? 1;
    qualityThreshold = Math.min(Math.max(qualityThreshold, minQuality), maxQuality);

    const includesSynced = /^(true|1)$/i.test(url.searchParams.get('includesSynced') || 'false');
    const filterStatuses = parseStatusFilter(url.searchParams.get('filter'));

    const coverage = await getResourceCoverage(shopId, resourceId, language, {
      denominatorPolicy,
      qualityThreshold,
      includesSynced
    });

    const fields = filterStatuses?.length
      ? coverage.fields.filter(field => filterStatuses.includes(field.status))
      : coverage.fields;
    const retriableKeys = fields.filter(field => field.canRetranslate).map(field => field.key);
    const metadata = { ...coverage.metadata, retriableCount: retriableKeys.length };

    return successResponse({
      resourceId: coverage.resourceId,
      resourceType: coverage.resourceType,
      language: coverage.language,
      counts: coverage.counts,
      percentages: coverage.percentages,
      fields,
      retriableKeys,
      metadata
    }, '获取资源覆盖率成功');
  }, '获取资源覆盖率', shopId);
}
