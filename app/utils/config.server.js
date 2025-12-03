/**
 * 环境变量配置和验证工具
 */

// 加载环境变量文件
import dotenv from 'dotenv';
import { logger } from './logger.server.js';
dotenv.config();

/**
 * 获取环境变量，支持默认值和类型转换
 * @param {string} key - 环境变量键名
 * @param {*} defaultValue - 默认值
 * @param {string} type - 数据类型: 'string', 'number', 'boolean'
 * @returns {*} 环境变量值
 */
function getEnvVar(key, defaultValue = null, type = 'string') {
  const value = process.env[key];
  
  if (value === undefined || value === '') {
    return defaultValue;
  }
  
  switch (type) {
    case 'number':
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    case 'boolean':
      return value.toLowerCase() === 'true';
    case 'string':
    default:
      return value;
  }
}

/**
 * 应用配置对象
 */
export const config = {
  // 基础配置
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  port: getEnvVar('PORT', 3000, 'number'),
  shopPrefix: getEnvVar('SHOP_PREFIX', 'default'),
  
  // Shopify配置
  shopify: {
    apiKey: getEnvVar('SHOPIFY_API_KEY'),
    apiSecret: getEnvVar('SHOPIFY_API_SECRET'),
  },
  
  // 数据库配置
  database: {
    url: getEnvVar('DATABASE_URL', 'file:dev.sqlite'),
  },
  
  // Redis配置
  redis: {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvVar('REDIS_PORT', 6379, 'number'),
    password: getEnvVar('REDIS_PASSWORD'),
    url: getEnvVar('REDIS_URL'),
    enabled: getEnvVar('REDIS_ENABLED', 'true', 'boolean'),
  },
  
  // GPT翻译API配置
  translation: {
    apiUrl: getEnvVar('GPT_API_URL', 'https://api.cursorai.art/v1'),
    apiKey: getEnvVar('GPT_API_KEY'),
    model: getEnvVar('GPT_MODEL', 'gpt-4o'),
    timeout: getEnvVar('TRANSLATION_TIMEOUT', 45000, 'number'), // 增加到45秒
    longTextTimeout: getEnvVar('LONG_TEXT_TIMEOUT', 60000, 'number'), // 长文本60秒超时
    batchSize: getEnvVar('TRANSLATION_BATCH_SIZE', 10, 'number'),
    delayMs: getEnvVar('TRANSLATION_DELAY_MS', 1000, 'number'),
    maxRetries: getEnvVar('TRANSLATION_MAX_RETRIES', 3, 'number'),
    maxChunkSize: getEnvVar('MAX_CHUNK_SIZE', 1000, 'number'), // 最大分块大小 - 减小以确保翻译完整
    longTextThreshold: getEnvVar('LONG_TEXT_THRESHOLD', 1500, 'number'), // 长文本阈值 - 更早触发分块
    modelTokenLimit: getEnvVar('TRANSLATION_MODEL_TOKEN_LIMIT', 6000, 'number'),
    tokenSafetyMargin: getEnvVar('TRANSLATION_TOKEN_SAFETY_MARGIN', 512, 'number'),
    minResponseTokens: getEnvVar('TRANSLATION_MIN_RESPONSE_TOKENS', 256, 'number'),
    maxRequestsPerMinute: getEnvVar('TRANSLATION_MAX_REQUESTS_PER_MINUTE', 20, 'number'),
    minRequestIntervalMs: getEnvVar('TRANSLATION_MIN_REQUEST_INTERVAL_MS', 3000, 'number'),
    skipEnabled: getEnvVar('ENABLE_TRANSLATION_SKIP', 'false') === 'true',
    skipOnlyWithHash: getEnvVar('TRANSLATION_SKIP_ONLY_WITH_HASH', 'true') !== 'false',
  },
  
  // 队列配置
  queue: {
    concurrency: getEnvVar('QUEUE_CONCURRENCY', 2, 'number'),
    maxAttempts: getEnvVar('QUEUE_MAX_ATTEMPTS', 3, 'number'),
    removeOnComplete: getEnvVar('QUEUE_REMOVE_ON_COMPLETE', 10, 'number'),
    removeOnFail: getEnvVar('QUEUE_REMOVE_ON_FAIL', 5, 'number'),
  },
  
  // 日志配置
  logging: {
    level: getEnvVar('LOG_LEVEL', 'info'),
    fileEnabled: getEnvVar('LOG_FILE_ENABLED', false, 'boolean'),
    persistenceLevel: getEnvVar('LOG_PERSISTENCE_LEVEL', 'warn'),
    retentionDays: getEnvVar('LOG_RETENTION_DAYS', '30', 'string'),
    batchSize: getEnvVar('LOG_BATCH_SIZE', 50, 'number'),
    flushInterval: getEnvVar('LOG_FLUSH_INTERVAL', 5000, 'number'),
    enablePersistentLogger: getEnvVar('ENABLE_PERSISTENT_LOGGER', true, 'boolean'),
  },

  // API 监控配置
  apiMonitoring: {
    enabled: getEnvVar('API_MONITORING_ENABLED', 'true', 'boolean'),
    operations: (getEnvVar('API_MONITORING_OPERATIONS', '', 'string') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    failureWarn: getEnvVar('API_MONITOR_FAILURE_WARN', 0.001, 'number'),
    failureError: getEnvVar('API_MONITOR_FAILURE_ERROR', 0.005, 'number'),
    minSample: getEnvVar('API_MONITOR_MIN_SAMPLE', 20, 'number'),
    p95WarnRatio: getEnvVar('API_MONITOR_P95_WARN_RATIO', 1.05, 'number'),
    p95ErrorRatio: getEnvVar('API_MONITOR_P95_ERROR_RATIO', 1.1, 'number')
  },

  // Translation Hooks 灰度配置
  translationHooks: {
    enabled: getEnvVar('TRANSLATION_HOOKS_ENABLED', 'false', 'boolean'),
    enabledResourceTypes: getEnvVar('TRANSLATION_HOOKS_RESOURCE_TYPES', '').split(',').filter(Boolean),
    rolloutPercentage: getEnvVar('TRANSLATION_HOOKS_ROLLOUT_PERCENTAGE', 0, 'number'), // 0-100
    timeoutMs: getEnvVar('TRANSLATION_HOOKS_TIMEOUT', 5000, 'number'),
    monitoringEnabled: getEnvVar('TRANSLATION_HOOKS_MONITORING', 'true', 'boolean'),
    enableShopIdFilter: getEnvVar('TRANSLATION_HOOKS_SHOP_FILTER', '').split(',').filter(Boolean)
  },

  // 链接转换配置
  linkConversion: {
    enabled: getEnvVar('LINK_CONVERSION_ENABLED', false, 'boolean'),
    strategy: getEnvVar('LINK_CONVERSION_STRATEGY', 'conservative', 'string')
  },
};

/**
 * 获取应用配置对象
 * @returns {Object} 配置对象
 */
export function getConfig() {
  return config;
}

/**
 * 验证必需的环境变量
 * @returns {Array} 缺失的环境变量列表
 */
export function validateRequiredEnvVars() {
  const required = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
  ];
  
  const missing = [];
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  return missing;
}

/**
 * 验证可选但推荐的环境变量
 * @returns {Array} 缺失的推荐环境变量列表
 */
export function validateRecommendedEnvVars() {
  const recommended = [
    'GPT_API_KEY',
    'REDIS_URL',
  ];
  
  const missing = [];
  
  for (const key of recommended) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  return missing;
}

/**
 * 初始化配置验证
 */
export function initializeConfig() {
  const missing = validateRequiredEnvVars();
  const recommended = validateRecommendedEnvVars();
  
  if (missing.length > 0) {
    logger.error('❌ 缺失必需的环境变量', { missing });
    logger.error('请参考 .env.example 文件配置环境变量');
    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
  }

  if (recommended.length > 0) {
    logger.warn('⚠️  缺失推荐的环境变量', { recommended });
    logger.warn('这些配置缺失可能影响某些功能的正常使用');
  }

  // 显示配置摘要
  logger.info('📋 应用配置摘要');
  logger.info('配置详情', {
    environment: config.nodeEnv,
    port: config.port,
    database: config.database.url,
    redis: config.redis.enabled ? '已启用' : '已禁用',
    translationApi: config.translation.apiUrl,
    translationModel: config.translation.model,
    apiKeyConfigured: config.translation.apiKey ? '已配置' : '未配置',
    queueConcurrency: config.queue.concurrency
  });
  
  return {
    valid: missing.length === 0,
    missing,
    recommended
  };
}

/**
 * 获取运行时配置信息
 * @returns {Object} 配置信息
 */
export function getConfigInfo() {
  return {
    environment: config.nodeEnv,
    features: {
      redis: config.redis.enabled && (config.redis.url || config.redis.host),
      translation: !!config.translation.apiUrl,
      queue: config.redis.enabled,
    },
    limits: {
      translationBatchSize: config.translation.batchSize,
      queueConcurrency: config.queue.concurrency,
      maxRetries: config.translation.maxRetries,
    }
  };
}
