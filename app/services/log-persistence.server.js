/**
 * 日志持久化服务
 * 将控制台日志扩展为内存+数据库的统一持久化通道
 */

import { prisma } from '../db.server.js';
import { createTranslationLogger, TranslationLogger, LOG_LEVELS } from '../utils/base-logger.server.js';
import { collectError } from './error-collector.server.js';

const consoleLogger = createTranslationLogger('LOG_PERSISTENCE');

const LEVEL_VALUE_BY_NAME = {
  ERROR: LOG_LEVELS.ERROR,
  WARN: LOG_LEVELS.WARN,
  INFO: LOG_LEVELS.INFO,
  DEBUG: LOG_LEVELS.DEBUG
};

const LEVEL_NAME_BY_VALUE = Object.entries(LEVEL_VALUE_BY_NAME).reduce((acc, [name, value]) => {
  acc[value] = name;
  return acc;
}, {});

function clampLevel(value) {
  if (value <= LOG_LEVELS.ERROR) return LOG_LEVELS.ERROR;
  if (value >= LOG_LEVELS.DEBUG) return LOG_LEVELS.DEBUG;
  return Math.round(value);
}

function toLevelName(level) {
  if (typeof level === 'string') {
    const upper = level.toUpperCase();
    if (LEVEL_VALUE_BY_NAME[upper] !== undefined) {
      return upper;
    }
  }
  if (typeof level === 'number') {
    return LEVEL_NAME_BY_VALUE[level] || 'INFO';
  }
  return 'INFO';
}

function toLevelValue(level) {
  if (typeof level === 'number') {
    return clampLevel(level);
  }
  if (typeof level === 'string') {
    const upper = level.toUpperCase();
    if (LEVEL_VALUE_BY_NAME[upper] !== undefined) {
      return LEVEL_VALUE_BY_NAME[upper];
    }
  }
  return LOG_LEVELS.INFO;
}

function parsePersistenceLevel(raw) {
  if (raw === null || raw === undefined) {
    return LEVEL_VALUE_BY_NAME.WARN;
  }

  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return clampLevel(raw);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return LEVEL_VALUE_BY_NAME.WARN;
    }

    const upper = trimmed.toUpperCase();
    if (LEVEL_VALUE_BY_NAME[upper] !== undefined) {
      return LEVEL_VALUE_BY_NAME[upper];
    }

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return clampLevel(numeric);
    }
  }

  return LEVEL_VALUE_BY_NAME.WARN;
}

function applyRetentionOverrides(overrides, defaults) {
  return {
    ERROR: overrides.ERROR ?? defaults.ERROR,
    WARN: overrides.WARN ?? defaults.WARN,
    INFO: overrides.INFO ?? defaults.INFO,
    DEBUG: overrides.DEBUG ?? defaults.DEBUG
  };
}

function parseRetentionConfig(raw, options = {}) {
  const quiet = options.quiet === true;
  const defaults = { ERROR: 30, WARN: 15, INFO: 7, DEBUG: 3 };

  if (raw === null || raw === undefined) {
    return defaults;
  }

  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    const value = Math.max(Math.floor(raw), 1);
    return { ERROR: value, WARN: value, INFO: value, DEBUG: value };
  }

  if (typeof raw !== 'string') {
    return defaults;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return defaults;
  }

  if (/^\d+$/.test(trimmed)) {
    const value = Math.max(parseInt(trimmed, 10), 1);
    return { ERROR: value, WARN: value, INFO: value, DEBUG: value };
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return applyRetentionOverrides(parsed, defaults);
      }
    } catch (error) {
      if (!quiet) {
        consoleLogger.warn('Failed to parse LOG_RETENTION_DAYS JSON config', { error: error.message });
      }
    }
    return defaults;
  }

  const overrides = {};
  for (const piece of trimmed.split(/[,|]/)) {
    const [rawKey, rawValue] = piece.split(/[:=]/);
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim().toUpperCase();
    const value = Number(rawValue.trim());
    if (LEVEL_VALUE_BY_NAME[key] !== undefined && !Number.isNaN(value)) {
      overrides[key] = Math.max(Math.floor(value), 1);
    }
  }

  if (Object.keys(overrides).length === 0) {
    return defaults;
  }

  return applyRetentionOverrides(overrides, defaults);
}

function sanitizeContext(data) {
  if (!data) {
    return null;
  }

  const visited = new WeakSet();

  const replacer = (key, value) => {
    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`;
    }

    if (typeof value === 'string' && value.length > 4000) {
      return `${value.slice(0, 4000)}...`;
    }

    if (value && typeof value === 'object') {
      if (visited.has(value)) {
        return '[Circular]';
      }
      visited.add(value);
    }

    return value;
  };

  try {
    const json = JSON.stringify(data, replacer);
    return JSON.parse(json);
  } catch (error) {
    return {
      serializationError: error.message
    };
  }
}

function extractDuration(data) {
  if (!data) {
    return null;
  }

  if (typeof data.durationMs === 'number') {
    return Math.round(data.durationMs);
  }

  if (typeof data.duration === 'number') {
    return Math.round(data.duration);
  }

  if (typeof data.duration === 'string') {
    const match = data.duration.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      return Math.round(parseFloat(match[1]));
    }
  }

  if (typeof data.metrics?.duration === 'number') {
    return Math.round(data.metrics.duration);
  }

  return null;
}

function detectTags(message, data) {
  const tags = new Set();
  const text = `${message || ''} ${data ? JSON.stringify(data) : ''}`.toLowerCase();

  if (data && (data.shopId === null || data.shopId === undefined) && text.includes('shop')) {
    tags.add('MISSING_SHOP_CONTEXT');
  }

  if (text.includes('timeout') || data?.statusCode === 504) {
    tags.add('TIMEOUT');
  }

  if (text.includes('rate limit') || data?.statusCode === 429) {
    tags.add('RATE_LIMIT');
  }

  const duration = extractDuration(data);
  if (duration !== null && duration > 30000) {
    tags.add('SLOW_OPERATION');
  }

  if (data?.retryable) {
    tags.add('RETRYABLE');
  }

  return Array.from(tags);
}

function truncateMessage(message) {
  if (!message) {
    return '';
  }
  if (message.length <= 500) {
    return message;
  }
  return `${message.slice(0, 500)}...`;
}

function chunk(items, size) {
  if (size <= 0) {
    return [items];
  }

  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

const persistenceEnabled = process.env.LOGGING_ENABLE_PERSISTENT_LOGGER !== 'false';
const persistenceLevel = parsePersistenceLevel(process.env.LOGGING_PERSISTENCE_LEVEL);
const retentionConfig = parseRetentionConfig(process.env.LOGGING_RETENTION_DAYS, { quiet: process.env.NODE_ENV === 'test' });
const bufferSize = Math.max(Number(process.env.LOGGING_BATCH_SIZE || 50), 1);
const flushInterval = Math.max(Number(process.env.LOGGING_FLUSH_INTERVAL || 5000), 1000);
const memoryLimit = Math.max(bufferSize * 10, 200);

class InMemoryLogStore {
  constructor(limit = 200) {
    this.limit = limit;
    this.logs = [];
  }

  add(entry) {
    this.logs.unshift(entry);
    if (this.logs.length > this.limit) {
      this.logs.length = this.limit;
    }
  }

  query(options = {}) {
    const {
      category,
      levels,
      shopId,
      resourceId,
      limit = 50,
      since
    } = options;

    let result = this.logs;

    if (category) {
      result = result.filter(log => log.category === category);
    }

    if (levels && levels.length > 0) {
      const normalizedLevels = new Set(levels.map(toLevelName));
      result = result.filter(log => normalizedLevels.has(log.level));
    }

    if (shopId !== undefined) {
      result = result.filter(log => log.shopId === shopId);
    }

    if (resourceId !== undefined) {
      result = result.filter(log => log.resourceId === resourceId);
    }

    if (since) {
      const sinceDate = since instanceof Date ? since : new Date(since);
      result = result.filter(log => log.timestamp >= sinceDate);
    }

    return result.slice(0, Math.max(limit, 0));
  }

  clear() {
    this.logs = [];
  }
}

class LogBuffer {
  constructor({ maxSize, flushInterval: interval, persistenceLevel: level, enabled }) {
    this.buffer = [];
    this.maxSize = maxSize;
    this.flushInterval = interval;
    this.persistenceLevel = level;
    this.enabled = enabled;
    this.flushTimer = null;
    this.isFlushing = false;
  }

  add(entry) {
    if (!this.enabled) {
      return;
    }

    const normalized = this.normalizeEntry(entry);

    if (!this.shouldPersist(normalized.levelValue)) {
      return;
    }

    this.buffer.push(normalized);

    if (this.buffer.length >= this.maxSize) {
      void this.flush();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush().catch(error => {
          consoleLogger.error('Scheduled log flush failed', { error: error.message });
        });
      }, this.flushInterval);
    }
  }

  normalizeEntry(entry) {
    const timestamp = entry.timestamp instanceof Date
      ? entry.timestamp
      : new Date(entry.timestamp || Date.now());
    const levelName = toLevelName(entry.level ?? entry.levelName);
    const levelValue = toLevelValue(entry.level ?? entry.levelName);

    return {
      ...entry,
      timestamp,
      levelName,
      levelValue,
      retries: entry.retries ?? 0
    };
  }

  shouldPersist(levelValue) {
    return levelValue <= this.persistenceLevel;
  }

  async flush(force = false) {
    if (!this.enabled) {
      return;
    }

    if (this.isFlushing && !force) {
      return;
    }

    if (this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    const logsToFlush = this.buffer.splice(0, this.buffer.length);

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      await this.persistLogs(logsToFlush);
    } catch (error) {
      consoleLogger.error('Log persistence failed', { error: error.message });
      const retriable = logsToFlush
        .filter(log => log.retries < 3)
        .map(log => ({ ...log, retries: log.retries + 1 }));
      if (retriable.length) {
        this.buffer.unshift(...retriable);
        if (!this.flushTimer) {
          this.flushTimer = setTimeout(() => {
            this.flush().catch(err => {
              consoleLogger.error('Retrying log flush failed', { error: err.message });
            });
          }, this.flushInterval);
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  async persistLogs(logs) {
    if (logs.length === 0) {
      return;
    }

    const records = logs.map(log => this.formatTranslationLog(log));
    const chunks = chunk(records, 100);

    for (const chunkRecords of chunks) {
      if (chunkRecords.length === 0) continue;
      await prisma.translationLog.createMany({
        data: chunkRecords
      });
    }

    await this.persistCriticalLogs(logs);
  }

  formatTranslationLog(log) {
    const data = log.data || {};
    const durationMs = extractDuration(data);
    const tags = detectTags(log.message, data);
    const sanitizedContext = sanitizeContext(data);

    const shopId = data.shopId ?? data.shopID ?? data.shop ?? null;
    const resourceId = data.resourceId ?? data.resourceID ?? null;
    const resourceType = data.resourceType ?? null;
    const language = data.targetLanguage ?? data.language ?? null;

    return {
      id: log.id || `${log.timestamp.getTime()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: log.timestamp,
      level: log.levelName,
      category: log.category,
      message: truncateMessage(log.message),
      shopId,
      resourceId,
      resourceType,
      language,
      durationMs,
      context: sanitizedContext,
      tags: tags.length > 0 ? tags : null,
      operation: data.operation ?? log.category,
      source: data.source ?? log.source ?? log.category,
      batchId: data.batchId ?? null,
      requestId: data.requestId ?? data.traceId ?? null,
      environment: process.env.NODE_ENV || 'development',
      errorFlag: log.levelValue <= LEVEL_VALUE_BY_NAME.WARN,
      createdAt: log.timestamp,
      updatedAt: log.timestamp
    };
  }

  async persistCriticalLogs(logs) {
    for (const log of logs) {
      if (log.levelValue > LEVEL_VALUE_BY_NAME.WARN) {
        continue;
      }

      const data = log.data || {};
      await collectError({
        errorType: data.errorType || 'TRANSLATION',
        message: log.message,
        errorCode: data.errorCode || `LOG_${log.levelName}`,
        stack: data.stack,
        statusCode: data.statusCode,
        resourceId: data.resourceId,
        resourceType: data.resourceType,
        shopId: data.shopId,
        retryable: data.retryable,
        fatal: log.levelName === 'ERROR',
        context: data
      }, {
        operation: data.operation || log.category,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        shopId: data.shopId,
        requestUrl: data.requestUrl
      });
    }
  }
}

class LogRotationService {
  constructor(retentionByLevel) {
    this.retentionByLevel = retentionByLevel;
    this.rotationInterval = 6 * 60 * 60 * 1000;
    this.timer = null;
  }

  start() {
    this.rotate().catch(error => {
      consoleLogger.error('Initial log rotation failed', { error: error.message });
    });

    this.timer = setInterval(() => {
      this.rotate().catch(error => {
        consoleLogger.error('Scheduled log rotation failed', { error: error.message });
      });
    }, this.rotationInterval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async rotate() {
    const now = Date.now();
    const BATCH_SIZE = 100;
    const BATCH_DELAY_MS = 100;

    for (const [level, days] of Object.entries(this.retentionByLevel)) {
      if (!days || days <= 0) {
        continue;
      }

      const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);

      // 🆕 检查表是否存在（防止首次运行报错）
      try {
        await prisma.translationLog.findFirst();
      } catch (error) {
        if (error.code === 'P2021') {
          consoleLogger.warn('TranslationLog table does not exist, skipping rotation');
          continue;
        }
        throw error;
      }

      // 🆕 分批删除（避免一次性删除过多记录）
      let totalDeleted = 0;
      let batchCount = 0;

      while (true) {
        // 先查询获取ID列表
        const logsToDelete = await prisma.translationLog.findMany({
          where: {
            level,
            timestamp: { lt: cutoff }
          },
          select: { id: true },
          take: BATCH_SIZE
        });

        if (logsToDelete.length === 0) {
          break;
        }

        // 批量删除
        const ids = logsToDelete.map(log => log.id);
        const result = await prisma.translationLog.deleteMany({
          where: {
            id: { in: ids }
          }
        });

        totalDeleted += result.count;
        batchCount++;

        // 🆕 批次间延迟，避免数据库压力
        if (logsToDelete.length === BATCH_SIZE) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        } else {
          // 最后一批，无需延迟
          break;
        }
      }

      if (totalDeleted > 0) {
        consoleLogger.info('Log rotation summary', {
          level,
          deleted: totalDeleted,
          batches: batchCount,
          cutoff: cutoff.toISOString()
        });

        // 🆕 [METRICS] 结构化日志
        console.log('[METRICS]', {
          type: 'log_rotation',
          level,
          deleted_count: totalDeleted,
          batch_count: batchCount,
          cutoff_date: cutoff.toISOString(),
          timestamp: Date.now()
        });
      }
    }
  }
}

const inMemoryLogStore = new InMemoryLogStore(memoryLimit);
const logBufferInstance = new LogBuffer({
  maxSize: bufferSize,
  flushInterval,
  persistenceLevel,
  enabled: persistenceEnabled
});
const logRotationService = new LogRotationService(retentionConfig);

if (persistenceEnabled && process.env.NODE_ENV !== 'test') {
  logRotationService.start();
}

export class PersistentTranslationLogger extends TranslationLogger {
  constructor(category = 'TRANSLATION') {
    super(category);
  }

  log(level, message, data = {}) {
    const normalized = toLevelName(level);
    if (normalized === 'ERROR') {
      this.error(message, data);
      return;
    }
    if (normalized === 'WARN') {
      this.warn(message, data);
      return;
    }
    if (normalized === 'DEBUG') {
      this.debug(message, data);
      return;
    }
    this.info(message, data);
  }

  error(message, data = {}) {
    this.write('ERROR', message, data);
  }

  warn(message, data = {}) {
    this.write('WARN', message, data);
  }

  info(message, data = {}) {
    this.write('INFO', message, data);
  }

  debug(message, data = {}) {
    this.write('DEBUG', message, data);
  }

  write(levelName, message, data = {}) {
    const timestamp = new Date();

    if (levelName === 'ERROR') {
      super.error(message, data);
    } else if (levelName === 'WARN') {
      super.warn(message, data);
    } else if (levelName === 'INFO') {
      super.info(message, data);
    } else {
      super.debug(message, data);
    }

    const entry = {
      category: this.category,
      level: levelName,
      message,
      data,
      timestamp,
      source: data.source || this.category
    };

    inMemoryLogStore.add({
      id: `${timestamp.getTime()}-${Math.random().toString(16).slice(2)}`,
      timestamp,
      level: levelName,
      message,
      category: this.category,
      data,
      shopId: data.shopId ?? null,
      resourceId: data.resourceId ?? null
    });

    logBufferInstance.add(entry);
  }
}

if (persistenceEnabled) {
  process.on('beforeExit', async () => {
    await logBufferInstance.flush(true);
  });

  process.on('SIGTERM', async () => {
    await logBufferInstance.flush(true);
    logRotationService.stop();
  });

  process.on('SIGINT', async () => {
    await logBufferInstance.flush(true);
    logRotationService.stop();
  });
}

export function getInMemoryLogs(filter = {}) {
  return inMemoryLogStore.query(filter);
}

export function clearInMemoryLogs() {
  inMemoryLogStore.clear();
}

export async function forceFlushLogs() {
  await logBufferInstance.flush(true);
}

export async function fetchPersistentTranslationLogs(options = {}) {
  const {
    limit = 100,
    offset = 0,
    level,
    shopId,
    resourceId,
    resourceType,
    category,
    language,
    startTime,
    endTime
  } = options;

  const where = {};

  if (level) {
    where.level = toLevelName(level);
  }
  if (category) {
    where.category = category;
  }
  if (shopId) {
    where.shopId = shopId;
  }
  if (resourceId) {
    where.resourceId = resourceId;
  }
  if (resourceType) {
    where.resourceType = resourceType;
  }
  if (language) {
    where.language = language;
  }
  if (startTime || endTime) {
    where.timestamp = {};
    if (startTime) where.timestamp.gte = new Date(startTime);
    if (endTime) where.timestamp.lte = new Date(endTime);
  }

  const logs = await prisma.translationLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: Math.max(Math.min(limit, 500), 1),
    skip: Math.max(offset, 0)
  });

  return logs;
}

export const logPersistenceSettings = {
  enabled: persistenceEnabled,
  persistenceLevel,
  retentionConfig,
  bufferSize,
  flushInterval
};

export {
  InMemoryLogStore,
  LogBuffer,
  LogRotationService,
  inMemoryLogStore,
  logBufferInstance,
  logRotationService
};

export const persistentLogger = new PersistentTranslationLogger('SYSTEM');
export const translationPersistentLogger = new PersistentTranslationLogger('TRANSLATION');
export const performancePersistentLogger = new PersistentTranslationLogger('PERFORMANCE');
