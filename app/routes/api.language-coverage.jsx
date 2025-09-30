import { createApiRoute } from "../utils/base-route.server.js";
import { calculateLanguageCoverage } from "../services/language-coverage.server.js";
import COVERAGE_CONFIG from "../utils/coverage-config.server.js";

const ALLOWED_SCOPES = new Set(['shop', 'type', 'resource']);

function parseBoolean(value, defaultValue = false) {
  if (value === null || value === undefined) return defaultValue;
  const lowered = String(value).toLowerCase();
  return lowered === 'true' || lowered === '1';
}

/**
 * 语言覆盖率处理函数
 */
async function handleLanguageCoverage({ request, session }) {
  const shopId = session?.shop;
  const url = new URL(request.url);
  const language = url.searchParams.get('language');
  const scope = url.searchParams.get('scope') || 'shop';
  const scopeId = url.searchParams.get('resourceId') || url.searchParams.get('scopeId');
  const resourceType = url.searchParams.get('resourceType');
  const denominatorPolicy = url.searchParams.get('denominatorPolicy') || COVERAGE_CONFIG.defaultDenominatorPolicy;
  const includesSynced = parseBoolean(url.searchParams.get('includesSynced'), COVERAGE_CONFIG.includesSynced);
  const forceRefresh = parseBoolean(url.searchParams.get('forceRefresh'), false);

  let qualityThreshold = Number(url.searchParams.get('qualityThreshold') ?? COVERAGE_CONFIG.qualityThreshold);
  if (!Number.isFinite(qualityThreshold)) {
    qualityThreshold = COVERAGE_CONFIG.qualityThreshold;
  }

  if (!language) {
    throw new Error('language 参数必填');
  }

  if (!ALLOWED_SCOPES.has(scope)) {
    throw new Error('scope 参数无效，只支持 shop/type/resource');
  }

  if (scope === 'resource' && !scopeId) {
    throw new Error('scope=resource 时必须提供 scopeId 或 resourceId 参数');
  }

  const minQuality = COVERAGE_CONFIG.qualityThresholdRange?.min ?? 0;
  const maxQuality = COVERAGE_CONFIG.qualityThresholdRange?.max ?? 1;
  qualityThreshold = Math.min(Math.max(qualityThreshold, minQuality), maxQuality);

  const coverageResult = await calculateLanguageCoverage(shopId, language, {
    scope,
    scopeId,
    resourceType,
    denominatorPolicy,
    qualityThreshold,
    includesSynced,
    forceRefresh
  });

  return {
    language: coverageResult.language,
    scope: coverageResult.scope,
    scopeId: coverageResult.scopeId,
    resourceType: coverageResult.resourceType,
    coverage: {
      percentage: coverageResult.percentages.coverage,
      counts: coverageResult.counts,
      breakdown: coverageResult.breakdown,
      percentages: coverageResult.percentages
    },
    metadata: coverageResult.metadata,
    trends: coverageResult.trends
  };
}

export const loader = createApiRoute(handleLanguageCoverage, {
  requireAuth: true,
  operationName: '获取语言覆盖率'
});