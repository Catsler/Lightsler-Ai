import { memoryLogReader, persistentLogReader, persistenceConfig } from '../../utils/logger.server.js';
import { getTranslationMetrics } from './metrics.server.js';
import { placeholderFallbackStats } from './post-processor-rules.server.js';

function normalizeMemoryLog(entry) {
  const context = entry.data ?? null;
  let durationMs = null;

  if (typeof context?.durationMs === 'number') {
    durationMs = Math.round(context.durationMs);
  } else if (typeof context?.duration === 'number') {
    durationMs = Math.round(context.duration);
  } else if (typeof context?.duration === 'string') {
    const match = context.duration.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      durationMs = Math.round(parseFloat(match[1]));
    }
  }

  return {
    id: entry.id || `mem-${entry.timestamp.getTime()}-${Math.random().toString(16).slice(2, 6)}`,
    timestamp: entry.timestamp,
    level: entry.level,
    category: entry.category || 'TRANSLATION',
    message: entry.message,
    shopId: entry.shopId ?? context?.shopId ?? null,
    resourceId: entry.resourceId ?? context?.resourceId ?? null,
    resourceType: context?.resourceType ?? null,
    language: context?.targetLanguage ?? context?.language ?? null,
    durationMs,
    context,
    tags: [],
    source: 'memory'
  };
}

function normalizePersistentLog(entry) {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    category: entry.category,
    message: entry.message,
    shopId: entry.shopId,
    resourceId: entry.resourceId,
    resourceType: entry.resourceType,
    language: entry.language,
    durationMs: entry.durationMs ?? null,
    context: entry.context ?? null,
    tags: Array.isArray(entry.tags) ? entry.tags : entry.tags ? [entry.tags].flat() : [],
    source: 'database'
  };
}

function mergeLogs(memoryLogs, persistentLogs, limit) {
  const combined = [];
  const seen = new Set();

  const add = (log) => {
    const timestampValue = log.timestamp instanceof Date
      ? log.timestamp.getTime()
      : new Date(log.timestamp).getTime();
    const key = `${timestampValue}-${log.level}-${log.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    combined.push(log);
  };

  memoryLogs.forEach(add);
  persistentLogs.forEach(add);

  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (combined.length > limit) {
    return combined.slice(0, limit);
  }
  return combined;
}

export function getTranslationStats() {
  const memoryLogs = memoryLogReader.getRecent({
    category: 'TRANSLATION',
    limit: 200
  });

  const stats = {
    totalTranslations: 0,
    successfulTranslations: 0,
    failedTranslations: 0,
    averageDuration: 0,
    recentErrors: [],
    recentActivity: []
  };

  let totalDuration = 0;
  let durationCount = 0;

  memoryLogs.forEach(rawLog => {
    const log = normalizeMemoryLog(rawLog);
    const context = log.context || {};

    if (log.message.includes('翻译完成')) {
      stats.totalTranslations++;
      if (context.success) {
        stats.successfulTranslations++;
      }

      if (typeof log.durationMs === 'number') {
        totalDuration += log.durationMs;
        durationCount++;
      }
    } else if (log.message.includes('翻译失败')) {
      stats.failedTranslations++;
      stats.recentErrors.push({
        timestamp: log.timestamp,
        message: log.message,
        error: context?.error || context
      });
    }

    if (stats.recentActivity.length < 10) {
      stats.recentActivity.push({
        timestamp: log.timestamp,
        level: log.level,
        message: log.message
      });
    }
  });

  if (durationCount > 0) {
    stats.averageDuration = Math.round(totalDuration / durationCount);
  }

  stats.recentErrors = stats.recentErrors.slice(0, 5);
  stats.apiMetrics = getTranslationMetrics();

  return stats;
}

export function getPlaceholderErrorStats() {
  const stats = {};
  for (const [language, count] of placeholderFallbackStats.entries()) {
    stats[language] = count;
  }
  return {
    byLanguage: stats,
    total: Array.from(placeholderFallbackStats.values()).reduce((sum, count) => sum + count, 0),
    timestamp: new Date().toISOString()
  };
}

export async function getTranslationLogs(input = {}) {
  const options = typeof input === 'number' ? { limit: input } : input || {};
  const limit = Math.max(Math.min(options.limit ?? options.count ?? 50, 500), 1);
  const levelFilter = options.level ? [options.level] : undefined;

  const memoryLogs = memoryLogReader.getRecent({
    category: 'TRANSLATION',
    levels: levelFilter,
    shopId: options.shopId,
    resourceId: options.resourceId,
    limit,
    since: options.startTime
  });

  const persistentLogs = persistenceConfig.enabled
    ? await persistentLogReader({
        limit,
        level: options.level,
        shopId: options.shopId,
        resourceId: options.resourceId,
        resourceType: options.resourceType,
        language: options.language,
        startTime: options.startTime,
        endTime: options.endTime
      })
    : [];

  const normalizedMemoryLogs = memoryLogs.map(normalizeMemoryLog);
  const normalizedPersistentLogs = (persistentLogs || []).map(normalizePersistentLog);

  return mergeLogs(normalizedMemoryLogs, normalizedPersistentLogs, limit);
}
