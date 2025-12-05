/**
 * 基础日志工具 - 使用 pino 实现控制台和文件输出
 * 提供结构化日志格式，支持可选的文件输出
 */

import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取项目根目录的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// 确保日志目录存在（使用绝对路径）
const logsDir = path.join(PROJECT_ROOT, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LOG_LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG'
};

function getCurrentLogLevel() {
  const level = process.env.LOGGING_LEVEL || 'info';
  switch (level.toLowerCase()) {
    case 'error':
      return LOG_LEVELS.ERROR;
    case 'warn':
      return LOG_LEVELS.WARN;
    case 'info':
      return LOG_LEVELS.INFO;
    case 'debug':
      return LOG_LEVELS.DEBUG;
    default:
      return LOG_LEVELS.INFO;
  }
}

let emitRetentionWarning = (message) => {
  retentionWarningBuffer.push(message);
};

const retentionWarningBuffer = [];
let retentionParseNotified = false;

function safeParseRetentionConfig(raw) {
  const quiet = process.env.NODE_ENV === 'test';
  if (!raw || typeof raw !== 'string') return null;

  try {
    // 支持纯数字（天数）或 JSON 字符串
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const days = Number.parseInt(trimmed, 10);
      return Number.isFinite(days) ? { INFO: days } : null;
    }
    return JSON.parse(trimmed);
  } catch (error) {
    if (!quiet && !retentionParseNotified) {
      // 用 console 避免依赖 logger 尚未初始化
      console.warn(`[Logger] LOGGING_RETENTION_DAYS 配置解析失败: ${error.message}`);
      retentionParseNotified = true;
    }
    return null;
  }
}

// 配置 pino transport
const targets = [
  {
    target: 'pino-pretty',
    options: {
      destination: 1, // stdout
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
];

// 如果启用文件输出，添加文件 transport
if (process.env.LOGGING_FILE_ENABLED === 'true') {
  const retentionConfigRaw = process.env.LOGGING_RETENTION_DAYS;
  const rollingFilePath = path.join(logsDir, 'app.log');

  targets.push({
    target: 'pino/file',
    options: {
      destination: rollingFilePath,
      append: true
    }
  });

  const retention = safeParseRetentionConfig(retentionConfigRaw);
  if (retention) {
    const days = Number(retention.INFO ?? retention.default ?? 7);
    const ttlMs = Number.isFinite(days) ? days * 24 * 60 * 60 * 1000 : null;

    if (ttlMs && ttlMs > 0) {
      setInterval(() => {
        try {
          const stats = fs.statSync(rollingFilePath);
          const age = Date.now() - stats.mtimeMs;
          if (age > ttlMs) {
            const archivePath = path.join(logsDir, `app-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
            fs.renameSync(rollingFilePath, archivePath);
          }
        } catch (error) {
          emitRetentionWarning(`[Logger] 日志轮转失败: ${error.message}`);
        }
      }, Math.max(ttlMs, 6 * 60 * 60 * 1000)); // 至少每6小时检查一次
    }
  }
}

// 创建 pino logger 实例
const pinoLogger = pino({
  level: process.env.LOGGING_LEVEL || 'info',
  transport: {
    targets
  }
});

emitRetentionWarning = (message) => {
  pinoLogger.warn({ subsystem: 'LOGGER' }, message);
};

if (retentionWarningBuffer.length > 0) {
  retentionWarningBuffer.forEach((message) => emitRetentionWarning(message));
  retentionWarningBuffer.length = 0;
}

export function formatLogMessage(level, category, message, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: LOG_LEVEL_NAMES[level],
    category,
    message,
    ...data
  };
}

export function outputToConsole(level, logData) {
  if (level > getCurrentLogLevel()) {
    return;
  }

  const { timestamp, level: levelName, category, message, ...rest } = logData;

  // 使用 pino 输出
  const logMethod = levelName.toLowerCase();
  const pinoMessage = `[${category}] ${message}`;

  if (pinoLogger[logMethod]) {
    pinoLogger[logMethod](rest, pinoMessage);
  } else {
    pinoLogger.info(rest, pinoMessage);
  }
}

export class TranslationLogger {
  constructor(category = 'TRANSLATION') {
    this.category = category;
  }

  error(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.ERROR, this.category, message, data);
    outputToConsole(LOG_LEVELS.ERROR, logData);
  }

  warn(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.WARN, this.category, message, data);
    outputToConsole(LOG_LEVELS.WARN, logData);
  }

  info(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.INFO, this.category, message, data);
    outputToConsole(LOG_LEVELS.INFO, logData);
  }

  debug(message, data = {}) {
    const logData = formatLogMessage(LOG_LEVELS.DEBUG, this.category, message, data);
    outputToConsole(LOG_LEVELS.DEBUG, logData);
  }

  logTranslationStart(text, targetLang, options = {}) {
    this.info('开始翻译', {
      textLength: text.length,
      textPreview: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      targetLang,
      strategy: options.strategy || 'default',
      ...options
    });
  }

  logTranslationSuccess(originalText, translatedText, metrics = {}) {
    this.info('翻译成功', {
      originalLength: originalText.length,
      translatedLength: translatedText.length,
      compressionRatio: (translatedText.length / originalText.length).toFixed(2),
      processingTime: metrics.processingTime,
      strategy: metrics.strategy || 'default',
      tokenUsage: metrics.tokenUsage
    });
  }

  logTranslationFailure(text, error, context = {}) {
    this.error('翻译失败', {
      textLength: text.length,
      textPreview: text.substring(0, 50) + '...',
      error: error.message || error,
      errorCode: error.code,
      attempt: context.attempt,
      maxRetries: context.maxRetries,
      strategy: context.strategy
    });
  }

  logValidation(field, passed, details = {}) {
    const level = passed ? LOG_LEVELS.INFO : LOG_LEVELS.WARN;
    const message = `字段验证${passed ? '通过' : '失败'}: ${field}`;
    const logData = formatLogMessage(level, this.category, message, details);
    outputToConsole(level, logData);
  }

  logPerformance(operation, duration, metrics = {}) {
    this.info('性能指标', {
      operation,
      duration: `${duration}ms`,
      ...metrics
    });
  }

  logBatchStats(operation, stats) {
    this.info('批量操作统计', {
      operation,
      total: stats.total,
      success: stats.success,
      failed: stats.failed,
      successRate: `${((stats.success / stats.total) * 100).toFixed(1)}%`,
      totalTime: stats.totalTime ? `${stats.totalTime}ms` : undefined
    });
  }

  log(level, message, data = {}) {
    const normalized = (typeof level === 'string' ? level : '').toUpperCase();
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
}

export function createTranslationLogger(category = 'TRANSLATION') {
  return new TranslationLogger(category);
}
