import { createApiRoute } from "../utils/base-route.server.js";
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

/**
 * 资源覆盖率处理函数
 */
async function handleResourceCoverage({ request, session, routeParams }) {
  const shopId = session?.shop;
  const resourceId = routeParams.resourceId;
  
  if (!resourceId) {
    throw new Error('resourceId 参数缺失');
  }

  const url = new URL(request.url);
  const language = url.searchParams.get('language');
  if (!language) {
    throw new Error('language 参数必填');
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

  return {
    resourceId: coverage.resourceId,
    resourceType: coverage.resourceType,
    language: coverage.language,
    counts: coverage.counts,
    percentages: coverage.percentages,
    fields,
    retriableKeys,
    metadata
  };
}

export const loader = createApiRoute(handleResourceCoverage, {
  requireAuth: true,
  operationName: '获取资源覆盖率'
});