import { prisma } from '../db.server.js';
import { getMemoryCache } from './memory-cache.server.js';
import COVERAGE_CONFIG from '../utils/coverage-config.server.js';
import { logger } from '../utils/logger.server.js';

const SKIP_DENOMINATOR_REASONS = COVERAGE_CONFIG.skipReasonsExcludedFromDenominator || new Set(['USER_EXCLUDED', 'TRANSLATION_LOCKED']);

function normalizeOptions(options = {}) {
  const {
    scope = 'shop',
    scopeId = null,
    resourceType = null,
    denominatorPolicy = COVERAGE_CONFIG.defaultDenominatorPolicy,
    qualityThreshold = COVERAGE_CONFIG.qualityThreshold,
    includesSynced = COVERAGE_CONFIG.includesSynced,
    forceRefresh = false
  } = options;

  const clampedQuality = clampNumber(
    Number.isFinite(Number(qualityThreshold)) ? Number(qualityThreshold) : COVERAGE_CONFIG.qualityThreshold,
    COVERAGE_CONFIG.qualityThresholdRange?.min ?? 0,
    COVERAGE_CONFIG.qualityThresholdRange?.max ?? 1
  );

  return {
    scope,
    scopeId,
    resourceType,
    denominatorPolicy,
    qualityThreshold: clampedQuality,
    includesSynced: Boolean(includesSynced),
    forceRefresh: Boolean(forceRefresh)
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function buildCacheKey(shopId, language, options) {
  return [
    `coverage:${shopId}`,
    `lang=${language}`,
    `scope=${options.scope}`,
    `scopeId=${options.scopeId || 'all'}`,
    `resourceType=${options.resourceType || 'all'}`,
    `den=${options.denominatorPolicy}`,
    `synced=${options.includesSynced ? '1' : '0'}`,
    `quality=${options.qualityThreshold}`
  ].join('|');
}

function resolveCacheTtl(totalFields) {
  const { cacheTTL } = COVERAGE_CONFIG;
  if (!cacheTTL) return 60;
  if (totalFields <= 1000) return cacheTTL.small ?? 60;
  if (totalFields <= 10000) return cacheTTL.medium ?? 300;
  return cacheTTL.large ?? 900;
}

function normaliseTranslationFields(rawFields) {
  if (!rawFields) return {};
  if (typeof rawFields === 'string') {
    try {
      return JSON.parse(rawFields) || {};
    } catch (error) {
      logger.warn('无法解析translationFields字符串，已忽略', { error: error?.message });
      return {};
    }
  }
  return rawFields;
}

function extractFieldEntry(fields, key) {
  if (!fields || typeof fields !== 'object') return null;

  if (fields[key] !== undefined) {
    return fields[key];
  }

  if (fields.dynamicFields && fields.dynamicFields[key] !== undefined) {
    return fields.dynamicFields[key];
  }

  if (Array.isArray(fields.translatableFields)) {
    const match = fields.translatableFields.find(item => item?.key === key);
    if (match) return match;
  }

  return null;
}

function normaliseFieldSnapshot(fieldEntry, translation) {
  if (fieldEntry == null) {
    return { value: null, sourceDigest: null, quality: null, translatedAt: null };
  }

  if (typeof fieldEntry === 'string') {
    return {
      value: fieldEntry,
      sourceDigest: translation?.sourceDigest || null,
      quality: translation?.qualityScore ?? null,
      translatedAt: translation?.updatedAt || translation?.createdAt || null
    };
  }

  if (fieldEntry && typeof fieldEntry === 'object') {
    const quality = Number.isFinite(fieldEntry.quality) ? fieldEntry.quality : translation?.qualityScore ?? null;
    const sourceDigest = fieldEntry.sourceDigest || fieldEntry.digest || translation?.sourceDigest || null;
    return {
      value: fieldEntry.value ?? fieldEntry.translation ?? null,
      sourceDigest,
      quality,
      translatedAt: fieldEntry.translatedAt || translation?.updatedAt || translation?.createdAt || null
    };
  }

  return { value: null, sourceDigest: null, quality: null, translatedAt: null };
}

function ensureBreakdownBucket(breakdown, resourceType) {
  if (!breakdown[resourceType]) {
    breakdown[resourceType] = {
      total: 0,
      upToDate: 0,
      stale: 0,
      missing: 0,
      lowQuality: 0,
      unsynced: 0
    };
  }
  return breakdown[resourceType];
}

function buildExplanation() {
  return {
    total: '可翻译字段总数（根据分母口径过滤）',
    upToDate: '译文与源内容指纹一致且质量达标',
    stale: '译文存在但源内容已变更',
    missing: '无译文或译文质量不足，含待同步项目',
    lowQuality: '译文存在但质量分低于阈值',
    unsynced: '译文已更新但尚未同步上线'
  };
}

async function fetchResources(shopId, options, language) {
  const where = {
    shopId,
    ...(options.resourceType ? { resourceType: options.resourceType } : {}),
    ...(options.scope === 'resource' && options.scopeId ? { resourceId: options.scopeId } : {})
  };

  return prisma.resource.findMany({
    where,
    select: {
      id: true,
      resourceId: true,
      resourceType: true,
      contentDigests: true,
      translations: {
        where: { language },
        select: {
          id: true,
          language: true,
          skipReason: true,
          syncStatus: true,
          qualityScore: true,
          translationFields: true,
          updatedAt: true,
          createdAt: true
        }
      }
    }
  });
}

export async function calculateLanguageCoverage(shopId, language, rawOptions = {}) {
  if (!shopId) {
    throw new Error('缺少 shopId 参数');
  }
  if (!language) {
    throw new Error('缺少 language 参数');
  }

  const options = normalizeOptions(rawOptions);
  const cacheKey = buildCacheKey(shopId, language, options);
  const cache = getMemoryCache();
  const startTime = Date.now();

  if (!options.forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      logger.debug('语言覆盖率缓存命中', {
        shopId,
        language,
        scope: options.scope,
        cacheKey,
        duration,
        cacheHitRate: cache.getStats().hitRate
      });
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cacheHit: true
        }
      };
    }
  }

  const resources = await fetchResources(shopId, options, language);
  const totals = {
    total: 0,
    upToDate: 0,
    stale: 0,
    missing: 0,
    lowQuality: 0,
    unsynced: 0
  };
  const breakdown = {};

  for (const resource of resources) {
    const digestMap = resource.contentDigests || {};
    const digestKeys = Object.keys(digestMap);
    if (digestKeys.length === 0) {
      continue;
    }

    const translation = resource.translations?.[0] || null;
    if (options.denominatorPolicy === 'effective' && translation?.skipReason && SKIP_DENOMINATOR_REASONS.has(translation.skipReason)) {
      continue;
    }

    const translationFields = normaliseTranslationFields(translation?.translationFields);
    const bucket = ensureBreakdownBucket(breakdown, resource.resourceType || 'UNKNOWN');

    for (const key of digestKeys) {
      const digest = digestMap[key];
      if (digest == null) {
        continue;
      }

      totals.total++;
      bucket.total++;

      const fieldEntry = extractFieldEntry(translationFields, key);
      const snapshot = normaliseFieldSnapshot(fieldEntry, translation);
      const hasValue = snapshot.value != null && `${snapshot.value}`.trim() !== '';
      const sourceDigest = snapshot.sourceDigest || null;
      const quality = Number.isFinite(Number(snapshot.quality)) ? Number(snapshot.quality) : null;
      const qualityOk = quality == null ? false : quality >= options.qualityThreshold;
      const isSynced = translation?.syncStatus === 'synced';

      if (!translation || !hasValue || !sourceDigest) {
        totals.missing++;
        bucket.missing++;
        if (hasValue && !qualityOk) {
          totals.lowQuality++;
          bucket.lowQuality++;
        }
        continue;
      }

      if (sourceDigest !== digest) {
        totals.stale++;
        bucket.stale++;
        continue;
      }

      if (!qualityOk) {
        totals.missing++;
        bucket.missing++;
        totals.lowQuality++;
        bucket.lowQuality++;
        continue;
      }

      if (options.includesSynced && !isSynced) {
        totals.missing++;
        bucket.missing++;
        totals.unsynced++;
        bucket.unsynced++;
        continue;
      }

      totals.upToDate++;
      bucket.upToDate++;
    }
  }

  const percentages = {
    coverage: totals.total > 0 ? Number((totals.upToDate / totals.total * 100).toFixed(2)) : 0,
    stale: totals.total > 0 ? Number((totals.stale / totals.total * 100).toFixed(2)) : 0,
    missing: totals.total > 0 ? Number((totals.missing / totals.total * 100).toFixed(2)) : 0
  };

  const ttlSeconds = resolveCacheTtl(totals.total);
  const metadata = {
    calculatedAt: new Date().toISOString(),
    cacheExpiry: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    denominatorPolicy: options.denominatorPolicy,
    qualityThreshold: options.qualityThreshold,
    includesSynced: options.includesSynced,
    totalFields: totals.total,
    lowQuality: totals.lowQuality,
    unsynced: totals.unsynced,
    cacheHit: false,
    explanation: buildExplanation()
  };

  const result = {
    language,
    scope: options.scope,
    scopeId: options.scopeId,
    resourceType: options.resourceType,
    counts: totals,
    percentages,
    breakdown,
    metadata,
    trends: {
      available: false,
      hourly: []
    }
  };

  cache.set(cacheKey, result, ttlSeconds);
  const duration = Date.now() - startTime;
  const staleRatio = totals.total > 0 ? totals.stale / totals.total : 0;
  logger.debug('语言覆盖率已计算', {
    shopId,
    language,
    scope: options.scope,
    duration,
    cacheKey,
    cacheTtlSeconds: ttlSeconds,
    cacheHitRate: cache.getStats().hitRate,
    staleRatio: Number(staleRatio.toFixed(4))
  });

  const staleThreshold = COVERAGE_CONFIG.alertThresholds?.staleRatio ?? 0.1;
  if (staleRatio > staleThreshold) {
    logger.warn('语言覆盖率中需重译比率偏高', {
      shopId,
      language,
      scope: options.scope,
      staleRatio: Number((staleRatio * 100).toFixed(2))
    });
  }

  return result;
}

export function invalidateCoverageCache(shopId, options = {}) {
  if (!shopId) return;

  const cache = getMemoryCache();
  const keys = typeof cache.getKeys === 'function' ? cache.getKeys() : [];
  const prefix = `coverage:${shopId}`;

  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    if (options.language && !key.includes(`lang=${options.language}`)) continue;
    if (options.scope && !key.includes(`scope=${options.scope}`)) continue;
    if (options.scopeId && !key.includes(`scopeId=${options.scopeId}`)) continue;
    if (options.resourceType && !key.includes(`resourceType=${options.resourceType}`)) continue;
    cache.delete(key);
  }
}

export async function getResourceCoverage(shopId, resourceId, language, rawOptions = {}) {
  if (!shopId) throw new Error('缺少 shopId 参数');
  if (!resourceId) throw new Error('缺少 resourceId 参数');
  if (!language) throw new Error('缺少 language 参数');

  const options = normalizeOptions({ ...rawOptions, scope: 'resource', scopeId: resourceId });

  const resource = await prisma.resource.findFirst({
    where: {
      shopId,
      OR: [{ resourceId }, { id: resourceId }]
    },
    select: {
      id: true,
      resourceId: true,
      resourceType: true,
      contentDigests: true,
      translations: {
        where: { language },
        select: {
          id: true,
          language: true,
          skipReason: true,
          syncStatus: true,
          qualityScore: true,
          translationFields: true,
          updatedAt: true,
          createdAt: true
        }
      }
    }
  });

  if (!resource) {
    throw new Error('未找到指定资源');
  }

  const digestMap = resource.contentDigests || {};
  const digestKeys = Object.keys(digestMap);
  const translation = resource.translations?.[0] || null;
  const translationFields = normaliseTranslationFields(translation?.translationFields);
  const fields = [];
  const totals = {
    total: 0,
    upToDate: 0,
    stale: 0,
    missing: 0,
    lowQuality: 0,
    unsynced: 0
  };

  for (const key of digestKeys) {
    const digest = digestMap[key];
    if (digest == null) continue;
    totals.total++;

    const fieldEntry = extractFieldEntry(translationFields, key);
    const snapshot = normaliseFieldSnapshot(fieldEntry, translation);
    const hasValue = snapshot.value != null && `${snapshot.value}`.trim() !== '';
    const sourceDigest = snapshot.sourceDigest || null;
    const quality = Number.isFinite(Number(snapshot.quality)) ? Number(snapshot.quality) : null;
    const qualityOk = quality != null && quality >= options.qualityThreshold;
    const isSynced = translation?.syncStatus === 'synced';

    let status = 'MISSING';

    if (!translation || !hasValue || !sourceDigest) {
      status = 'MISSING';
      totals.missing++;
      if (hasValue && !qualityOk) {
        totals.lowQuality++;
      }
    } else if (sourceDigest !== digest) {
      status = 'STALE';
      totals.stale++;
    } else if (!qualityOk) {
      status = 'LOW_QUALITY';
      totals.missing++;
      totals.lowQuality++;
    } else if (options.includesSynced && !isSynced) {
      status = 'UNSYNCED';
      totals.missing++;
      totals.unsynced++;
    } else {
      status = 'UP_TO_DATE';
      totals.upToDate++;
    }

    const syncStatus = translation?.syncStatus || 'unknown';
    const canRetranslate = ['MISSING', 'STALE', 'LOW_QUALITY', 'UNSYNCED'].includes(status);
    fields.push({
      key,
      status,
      sourceDigest: digest,
      translationDigest: sourceDigest,
      quality,
      translatedAt: snapshot.translatedAt,
      hasValue,
      synced: isSynced,
      syncStatus,
      valuePreview: snapshot.value ? String(snapshot.value).slice(0, 80) : null,
      canRetranslate
    });
  }

  const percentages = {
    coverage: totals.total > 0 ? Number((totals.upToDate / totals.total * 100).toFixed(2)) : 0,
    stale: totals.total > 0 ? Number((totals.stale / totals.total * 100).toFixed(2)) : 0,
    missing: totals.total > 0 ? Number((totals.missing / totals.total * 100).toFixed(2)) : 0
  };
  const retriableKeys = fields.filter(field => field.canRetranslate).map(field => field.key);

  return {
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
    language,
    counts: totals,
    percentages,
    fields,
    retriableKeys,
    metadata: {
      calculatedAt: new Date().toISOString(),
      denominatorPolicy: options.denominatorPolicy,
      qualityThreshold: options.qualityThreshold,
      includesSynced: options.includesSynced,
      retriableCount: retriableKeys.length
    }
  };
}

export default {
  calculateLanguageCoverage,
  invalidateCoverageCache,
  getResourceCoverage
};
