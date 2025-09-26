/**
 * 基础日志工具 - 使用 pino 实现控制台和文件输出
 * 提供结构化日志格式，支持可选的文件输出
 */

import pino from 'pino';
import { config } from './config.server.js';
import fs from 'fs';
import path from 'path';

// 确保日志目录存在
const logsDir = path.join(process.cwd(), 'logs');
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
  const level = config.logging?.level || 'info';
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
if (config.logging?.fileEnabled) {
  targets.push({
    target: 'pino/file',
    options: {
      destination: path.join(logsDir, 'app.log'),
      append: true
    }
  });
}

// 创建 pino logger 实例
const pinoLogger = pino({
  level: config.logging?.level || 'info',
  transport: {
    targets
  }
});

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
