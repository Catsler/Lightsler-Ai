/**
 * 统一日志出口
 * 对外暴露与原 utils/logger.server.js 相同的 API，内部基于持久化实现
 */

import { LOG_LEVELS, TranslationLogger as BaseTranslationLogger, createTranslationLogger as createBaseLogger } from '../utils/base-logger.server.js';
import { sanitizeForJson } from '../utils/api-response.server.js';
import {
  PersistentTranslationLogger,
  persistentLogger,
  translationPersistentLogger,
  performancePersistentLogger,
  getInMemoryLogs,
  clearInMemoryLogs,
  fetchPersistentTranslationLogs,
  forceFlushLogs,
  logPersistenceSettings
} from './log-persistence.server.js';

const persistenceEnabled = logPersistenceSettings.enabled;

const LOG_CONTEXT_WHITELIST = new Set([
  'shopId',
  'resourceId',
  'resourceType',
  'language',
  'targetLanguage',
  'targetLang',
  'textLength',
  'textPreview',
  'processingTime',
  'strategy',
  'status',
  'syncStatus',
  'error',
  'errorCode',
  'retryCount',
  'queue',
  'operation'
]);

function extractLogContext(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const context = {};
  for (const key of LOG_CONTEXT_WHITELIST) {
    if (raw[key] !== undefined) {
      context[key] = raw[key];
    }
  }

  return Object.keys(context).length > 0 ? sanitizeForJson(context) : null;
}

function toLogSummary(entry) {
  const timestamp = entry.timestamp instanceof Date
    ? entry.timestamp
    : new Date(entry.timestamp || Date.now());

  const data = entry.data || {};
  const base = {
    id: String(entry.id ?? `${timestamp.getTime()}-${entry.level ?? 'INFO'}`),
    timestamp: timestamp.toISOString(),
    level: entry.level ?? 'INFO',
    category: entry.category ?? 'TRANSLATION',
    message: entry.message ?? '',
    shopId: entry.shopId ?? data.shopId ?? null,
    resourceId: entry.resourceId ?? data.resourceId ?? null,
    resourceType: data.resourceType ?? null,
    language: data.language ?? data.targetLanguage ?? data.targetLang ?? null
  };

  const context = extractLogContext(data);
  if (context) {
    return { ...base, context };
  }
  return base;
}


export { LOG_LEVELS, BaseTranslationLogger as TranslationLogger, PersistentTranslationLogger };

export function createTranslationLogger(category = 'TRANSLATION') {
  if (persistenceEnabled) {
    return new PersistentTranslationLogger(category);
  }
  return createBaseLogger(category);
}

export const logger = persistenceEnabled
  ? translationPersistentLogger
  : createBaseLogger();

export const apiLogger = persistenceEnabled
  ? new PersistentTranslationLogger('API')
  : createBaseLogger('API');

export const validationLogger = persistenceEnabled
  ? new PersistentTranslationLogger('VALIDATION')
  : createBaseLogger('VALIDATION');

export const performanceLogger = persistenceEnabled
  ? performancePersistentLogger
  : createBaseLogger('PERFORMANCE');

export const systemLogger = persistenceEnabled ? persistentLogger : createBaseLogger('SYSTEM');

export const billingLogger = persistenceEnabled
  ? new PersistentTranslationLogger('BILLING')
  : createBaseLogger('BILLING');

export function logTranslationSession(sessionId, sessionData) {
  logger.info('翻译会话', {
    sessionId,
    ...sessionData
  });
}

export function logShortTextTranslation(originalText, translatedText, targetLang, context = {}) {
  logger.debug('短文本翻译详情', {
    originalText: `"${originalText}"`,
    translatedText: `"${translatedText}"`,
    targetLang,
    originalLength: originalText.length,
    translatedLength: translatedText.length,
    isIdentical: originalText === translatedText,
    isBoundaryCase: originalText.length >= 15 && originalText.length <= 20,
    ...context
  });
}

export function logKeyTestPoint(testPoint, position, totalLength, found) {
  logger.info('关键测试点检查', {
    testPoint,
    position,
    totalLength,
    remainingChars: totalLength - position,
    found,
    status: found ? 'FOUND' : 'NOT_FOUND'
  });
}

export function logEnglishRemnants(englishParts, totalLength) {
  if (englishParts.length > 0) {
    logger.warn('检测到英文残留', {
      count: englishParts.length,
      totalLength,
      examples: englishParts.slice(0, 3).map(part => part.substring(0, 50) + '...')
    });
  } else {
    logger.info('未检测到英文残留');
  }
}

export function logTranslationQuality(qualityMetrics) {
  const {
    chineseRatio,
    englishRatio,
    compressionRatio,
    isComplete,
    hasRemnants
  } = qualityMetrics;

  const status = isComplete && !hasRemnants ? 'EXCELLENT'
    : isComplete ? 'GOOD'
    : 'NEEDS_IMPROVEMENT';

  logger.info('翻译质量分析', {
    status,
    chineseRatio: `${(chineseRatio * 100).toFixed(1)}%`,
    englishRatio: `${(englishRatio * 100).toFixed(1)}%`,
    compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
    isComplete,
    hasRemnants
  });
}

export function getRecentLogSummaries(options = {}) {
  const {
    limit = 50,
    category = 'TRANSLATION',
    levels,
    shopId,
    resourceId,
    since
  } = options;

  const normalizedLimit = Math.max(Math.min(limit, 200), 1);
  const logs = getInMemoryLogs({
    limit: normalizedLimit,
    category,
    levels,
    shopId,
    resourceId,
    since
  }) || [];

  return logs.map(toLogSummary);
}

export const memoryLogReader = {
  getRecent: getInMemoryLogs,
  clear: () => clearInMemoryLogs()
};

export const persistentLogReader = fetchPersistentTranslationLogs;
export const forceFlushPersistentLogs = forceFlushLogs;
export const persistenceConfig = logPersistenceSettings;
