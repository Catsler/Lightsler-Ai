import Bull from 'bull';
import Redis from 'ioredis';
import { translateResourceWithLogging } from './translation.server.js';
import shopify from '../shopify.server.js';
import { updateResourceTranslation } from './shopify-graphql.server.js';
import { saveTranslation, updateResourceStatus, prisma } from './database.server.js';
// import { authenticate } from '../shopify.server.js'; // 只在需要时导入
import { config } from '../utils/config.server.js';
import { MemoryQueue } from './memory-queue.server.js';
import { collectError, ERROR_TYPES } from './error-collector.server.js';
import { createShopRedisConfig, parseRedisUrl } from '../utils/redis-parser.server.js';

/**
 * Redis任务队列服务
 * 支持Railway、Upstash等云Redis服务
 * 实现多店铺数据隔离和自动降级
 */

// 获取当前店铺ID（从环境变量）
const SHOP_ID = process.env.SHOP_ID || 'default';

// Redis连接配置
let redisConfig = null;
if (config.redis.enabled && process.env.REDIS_URL) {
  // 使用解析器创建店铺隔离的Redis配置
  redisConfig = createShopRedisConfig(process.env.REDIS_URL, SHOP_ID, {
    // 针对云Redis服务的优化
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,

    // 队列专用优化
    enableOfflineQueue: false,
    retryDelayOnFailover: 500,

    // 错误处理
    reconnectOnError: (err) => {
      console.warn(`Redis连接错误 [Shop: ${SHOP_ID}]:`, err.message);
      const retryableErrors = ['READONLY', 'ECONNRESET', 'EPIPE', 'ENOTFOUND', 'TIMEOUT'];
      return retryableErrors.some(e => err.message.includes(e));
    }
  });
} else if (config.redis.enabled && config.redis.host) {
  // 传统配置方式（向后兼容）
  redisConfig = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: getShopRedisDb(SHOP_ID),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  };
}

/**
 * 根据店铺ID获取Redis数据库索引
 * @param {string} shopId - 店铺ID
 * @returns {number} 数据库索引 (0-15)
 */
function getShopRedisDb(shopId) {
  if (!shopId || shopId === 'default') return 0;

  // 简单映射：shop1->1, shop2->2, 等等
  const match = shopId.match(/shop(\d+)/);
  if (match) {
    const num = parseInt(match[1]);
    return Math.min(num, 15); // Redis最多16个数据库 (0-15)
  }

  // 如果不是标准格式，使用哈希
  let hash = 0;
  for (let i = 0; i < shopId.length; i++) {
    hash = ((hash << 5) - hash) + shopId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % 16;
}

// 创建Redis连接
let redis;
let redisConnectionAttempts = 0;
const MAX_REDIS_ATTEMPTS = 3;

const QUEUE_NAME = SHOP_ID !== 'default' ? `translation_${SHOP_ID}` : 'translation';
const FALLBACK_CONCURRENCY = Math.max(1, Math.min(config.queue?.concurrency || 1, 4));
const REQUIRED_JOB_FIELDS = ['resourceId', 'shopId', 'shopDomain', 'language'];

function assertJobPayload(payload) {
  const missing = REQUIRED_JOB_FIELDS.filter((field) => !payload?.[field]);
  if (missing.length > 0) {
    const error = new Error(`Missing required job fields: ${missing.join(', ')}`);
    error.code = 'QUEUE_JOB_VALIDATION';
    throw error;
  }
}

function assertBatchJobPayload(payload) {
  const baseMissing = ['shopId', 'shopDomain', 'language'].filter((field) => !payload?.[field]);
  const listMissing = !Array.isArray(payload?.resourceIds) || payload.resourceIds.length === 0;

  if (baseMissing.length > 0 || listMissing) {
    const parts = [];
    if (baseMissing.length > 0) {
      parts.push(`missing fields: ${baseMissing.join(', ')}`);
    }
    if (listMissing) {
      parts.push('resourceIds must be a non-empty array');
    }
    const error = new Error(`Invalid batch job payload (${parts.join('; ')})`);
    error.code = 'QUEUE_BATCH_JOB_VALIDATION';
    throw error;
  }
}

function createAdminClient(shopDomain, accessToken) {
  if (!shopDomain) {
    throw new Error('缺少 shopDomain，无法创建 Shopify Admin 客户端');
  }
  if (!accessToken) {
    throw new Error(`店铺 ${shopDomain} 缺少 accessToken，无法创建 Shopify Admin 客户端`);
  }

  const configuredScopes = Array.isArray(shopify.api?.config?.scopes)
    ? shopify.api.config.scopes.join(',')
    : (shopify.api?.config?.scopes || process.env.SCOPES || '');

  const session = {
    id: `offline_${shopDomain}`,
    shop: shopDomain,
    state: 'offline',
    isOnline: false,
    scope: configuredScopes,
    accessToken
  };

  const graphqlClient = new shopify.api.clients.Graphql({
    session,
    apiVersion: shopify.api?.config?.apiVersion
  });

  return {
    graphql: async (query, options = {}) => {
      const result = await graphqlClient.request(query, {
        variables: options?.variables,
        retries: options?.tries ? options.tries - 1 : 0,
        headers: options?.headers,
        signal: options?.signal
      });

      return new Response(JSON.stringify(result));
    }
  };
}

const processorDefinitions = [];
const attachedQueues = new WeakSet();
let processorsInitialized = false;
let translationQueue;
let useMemoryQueue = false;
let isSwitchingQueue = false;
let healthCheckTimer = null;
let redisRecoveryNotified = false;

try {
  if (config.redis.enabled && redisConfig) {
    console.log(`[Queue] 初始化Redis连接 [Shop: ${SHOP_ID}, DB: ${redisConfig.db || 0}]`);
    redis = new Redis(redisConfig);

    // 处理连接错误
    redis.on('error', (error) => {
      // 忽略常见的非致命错误
      const ignorableErrors = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'];
      if (ignorableErrors.some(e => error.message.includes(e))) {
        console.debug('Redis连接临时中断:', error.message);
        return;
      }

      if (!redis._isConnected && redisConnectionAttempts >= MAX_REDIS_ATTEMPTS) {
        console.warn('Redis连接失败，切换到内存模式');
        redis = null;
      }
    });

    // 成功连接后重置计数器
    redis.on('connect', () => {
      redisConnectionAttempts = 0;
      console.log('Redis连接成功');
    });
  } else {
    console.log('Redis未配置，将使用内存模式');
    redis = null;
  }
} catch (error) {
  console.warn('Redis连接失败，将使用内存模式:', error.message);
  redis = null;
}

useMemoryQueue = !redis;

function ensureProcessorDefinitions() {
  if (processorsInitialized) {
    return processorDefinitions;
  }

  processorDefinitions.push({
    name: 'translateResource',
    concurrency: () => config.queue?.concurrency || 1,
    handler: handleTranslateResource
  });

  processorDefinitions.push({
    name: 'batchTranslate',
    concurrency: () => 1,
    handler: handleBatchTranslate
  });

  processorsInitialized = true;
  return processorDefinitions;
}

function registerProcessors(queue) {
  if (!queue || typeof queue.process !== 'function') {
    return;
  }

  const definitions = ensureProcessorDefinitions();

  for (const definition of definitions) {
    const concurrency = Math.max(1, definition.concurrency());
    const handler = definition.handler;
    const boundHandler = handler.length > 1
      ? (job) => handler(job, queue)
      : handler;

    queue.process(definition.name, concurrency, boundHandler);
  }
}

function attachLifecycleEvents(queue) {
  if (!queue || typeof queue.on !== 'function' || attachedQueues.has(queue)) {
    return;
  }

  attachedQueues.add(queue);

  queue.on('error', async (error) => {
    console.error('队列错误:', error);

    try {
      await collectError({
        errorType: ERROR_TYPES.SYSTEM,
        errorCategory: 'QUEUE_SYSTEM',
        errorCode: 'QUEUE_ERROR',
        message: `Queue system error: ${error?.message || error}`,
        stack: error?.stack,
        operation: 'queue.system',
        severity: 4,
        retryable: false,
        context: {
          queueMode: useMemoryQueue ? 'memory' : 'redis'
        }
      });
    } catch (collectErr) {
      console.warn('记录队列系统错误失败:', collectErr?.message || collectErr);
    }

    if (!useMemoryQueue) {
      await requestMemoryFallback(`Redis队列出错，切换到内存模式: ${error?.message || error}`);
    }
  });

  queue.on('failed', async (job, err) => {
    console.error(`任务失败 ${job?.id}:`, err);

    try {
      await collectError({
        errorType: ERROR_TYPES.TRANSLATION,
        errorCategory: 'QUEUE_FAILED',
        errorCode: err?.code || 'JOB_FAILED',
        message: `Job ${job?.id} failed after ${job?.attemptsMade ?? job?.attempts ?? 0} attempts: ${err?.message || err}`,
        stack: err?.stack,
        operation: 'queue.job',
        resourceId: job?.data?.resourceId,
        severity: 3,
        retryable: (job?.attemptsMade ?? job?.attempts ?? 0) < (job?.opts?.attempts ?? job?.maxAttempts ?? 3),
        context: {
          jobId: job?.id,
          jobName: job?.name,
          attempts: job?.attemptsMade ?? job?.attempts ?? 0,
          maxAttempts: job?.opts?.attempts ?? job?.maxAttempts ?? 3,
          data: job?.data,
          failedReason: job?.failedReason
        }
      });
    } catch (collectErr) {
      console.warn('记录任务失败错误失败:', collectErr?.message || collectErr);
    }
  });

  queue.on('completed', (job, result) => {
    console.log(`任务完成 ${job?.id}:`, result);
  });
}

function createBullQueue() {
  if (!redisConfig) {
    throw new Error('Redis配置不可用，无法创建Bull队列');
  }

  console.log(`[Queue] 创建Bull队列 [Shop: ${SHOP_ID}, Queue: ${QUEUE_NAME}]`);

  return new Bull(QUEUE_NAME, {
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 10, // 保留最近10个完成任务
      removeOnFail: 5,      // 保留最近5个失败任务
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      delay: 100, // 添加100ms延迟避免过快处理
    },
    settings: {
      stalledInterval: 30000,    // 30秒检查一次卡住的任务
      retryProcessDelay: 5000,   // 5秒后重试处理
    }
  });
}

function createMemoryQueueInstance() {
  return new MemoryQueue(QUEUE_NAME, { defaultConcurrency: FALLBACK_CONCURRENCY });
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  redisRecoveryNotified = false;
}

function startHealthCheck() {
  if (!redis || healthCheckTimer) {
    return;
  }

  healthCheckTimer = setInterval(async () => {
    if (!useMemoryQueue) {
      redisRecoveryNotified = false;
      return;
    }

    try {
      await redis.ping();
      if (!redisRecoveryNotified) {
        console.log('🔄 检测到Redis恢复，可手动切回Redis队列');
        redisRecoveryNotified = true;
      }
    } catch (error) {
      redisRecoveryNotified = false;
      console.debug('Redis仍不可用:', error?.message || error);
    }
  }, 30000);

  if (typeof healthCheckTimer.unref === 'function') {
    healthCheckTimer.unref();
  }
}

async function requestMemoryFallback(reason) {
  if (useMemoryQueue || isSwitchingQueue) {
    return;
  }

  isSwitchingQueue = true;
  redisRecoveryNotified = false;
  console.warn(reason);

  const previousQueue = translationQueue;
  const memoryQueue = createMemoryQueueInstance();

  translationQueue = memoryQueue;
  useMemoryQueue = true;

  registerProcessors(memoryQueue);
  attachLifecycleEvents(memoryQueue);

  console.log('⚠️ 队列已切换到内存模式');

  if (previousQueue?.close) {
    try {
      await previousQueue.close();
    } catch (error) {
      console.warn('关闭Redis队列失败:', error?.message || error);
    }
  }

  isSwitchingQueue = false;
  startHealthCheck();
}

function initializeQueue() {
  if (!useMemoryQueue) {
    try {
      translationQueue = createBullQueue();
    } catch (error) {
      console.warn('Bull队列创建失败，使用内存模式:', error?.message || error);
      useMemoryQueue = true;
    }
  }

  if (useMemoryQueue || !translationQueue) {
    translationQueue = createMemoryQueueInstance();
    useMemoryQueue = true;
  }

  registerProcessors(translationQueue);
  attachLifecycleEvents(translationQueue);

  if (useMemoryQueue) {
    startHealthCheck();
  } else {
    stopHealthCheck();
  }

  console.log(`🚀 翻译队列已启动: ${useMemoryQueue ? '内存模式' : 'Redis模式'}`);
}

async function handleTranslateResource(job) {
  assertJobPayload(job?.data);
  const { resourceId, shopId, shopDomain, language } = job.data;
  let resource;

  try {
    job.progress(10);

    resource = await prisma.resource.findUnique({
      where: { id: resourceId }
    });

    if (!resource) {
      throw new Error(`资源 ${resourceId} 不存在`);
    }

    await updateResourceStatus(resourceId, 'processing');
    job.progress(20);

    let shop = await prisma.shop.findUnique({
      where: { id: shopId }
    });

    if (!shop && shopDomain) {
      shop = await prisma.shop.findUnique({
        where: { id: shopDomain }
      }) || await prisma.shop.findUnique({
        where: { domain: shopDomain }
      });
    }

    if (!shop) {
      throw new Error(`店铺 ${shopId || shopDomain} 不存在`);
    }

    if (!shop.accessToken) {
      throw new Error(`店铺 ${shop.domain} 缺少访问令牌，无法翻译`);
    }

    const admin = createAdminClient(shop.domain, shop.accessToken);

    const translationResult = await translateResourceWithLogging(resource, language, admin);
    job.progress(50);

    if (translationResult.skipped) {
      console.log(`ℹ️ 跳过翻译，内容未变化: ${resource.title}`);
      await updateResourceStatus(resourceId, 'pending');
      job.progress(100);
      return {
        resourceId,
        resourceType: resource.resourceType,
        title: resource.title,
        success: true,
        skipped: true,
        skipReason: translationResult.skipReason
      };
    }

    await saveTranslation(resourceId, shopId, language, translationResult.translations);
    job.progress(70);

    console.log(`✅ 翻译完成，状态设为pending等待发布: ${resource.title} -> ${language}`);
    job.progress(90);

    await updateResourceStatus(resourceId, 'completed');
    job.progress(100);

    return {
      resourceId,
      resourceType: resource.resourceType,
      title: resource.title,
      success: true,
      translations: translationResult.translations
    };
  } catch (error) {
    console.error(`翻译任务失败 ${resourceId}:`, error);

    try {
      await collectError({
        errorType: ERROR_TYPES.TRANSLATION,
        errorCategory: 'QUEUE_ERROR',
        errorCode: error?.code || 'QUEUE_TRANSLATION_FAILED',
        message: `Queue translation failed for resource ${resourceId}: ${error?.message || error}`,
        stack: error?.stack,
        operation: 'queue.translateResource',
        resourceId,
        resourceType: resource?.resourceType || 'UNKNOWN',
        targetLanguage: language,
        severity: 3,
        retryable: true,
        context: {
          shopId,
          shopDomain,
          jobId: job?.id,
          attempt: job?.attemptsMade ?? job?.attempts ?? 0,
          maxAttempts: job?.opts?.attempts ?? job?.maxAttempts ?? 3
        }
      });
    } catch (collectErr) {
      console.warn('记录翻译任务错误失败:', collectErr?.message || collectErr);
    }

    try {
      await updateResourceStatus(resourceId, 'pending');
    } catch (statusError) {
      console.warn('更新资源状态失败:', statusError?.message || statusError);
    }

    throw error;
  }
}

async function handleBatchTranslate(job, queue) {
  assertBatchJobPayload(job?.data);
  const { resourceIds = [], shopId, shopDomain, language } = job.data;
  const results = [];
  const total = resourceIds.length;

  if (!queue || typeof queue.add !== 'function') {
    throw new Error('当前队列不支持批量翻译');
  }

  for (let index = 0; index < resourceIds.length; index++) {
    const resourceId = resourceIds[index];

    try {
      const singleJobPayload = {
        resourceId,
        shopId,
        shopDomain,
        language
      };

      assertJobPayload(singleJobPayload);

      const translateJob = await queue.add('translateResource', singleJobPayload, {
        attempts: 3,
        backoff: 'exponential',
        delay: index * 1000
      });

      const result = await translateJob.finished();
      results.push(result);
    } catch (error) {
      results.push({
        resourceId,
        success: false,
        error: error?.message || String(error)
      });
    }

    if (total > 0) {
      job.progress(Math.round(((index + 1) / total) * 100));
    }
  }

  return {
    total,
    success: results.filter((item) => item?.success).length,
    failure: results.filter((item) => !item?.success).length,
    results
  };
}

initializeQueue();

export { translationQueue };

/**
 * 添加翻译任务到队列
 * @param {string} resourceId - 资源ID
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {string} shopDomain - 店铺域名
 * @param {Object} options - 任务选项
 * @returns {Promise<Object>} 任务信息
 */
export async function addTranslationJob(resourceId, shopId, language, shopDomain, options = {}) {
  if (!translationQueue) {
    throw new Error('任务队列未配置，无法创建异步任务');
  }

  const jobData = {
    resourceId,
    shopId,
    shopDomain,
    language
  };

  assertJobPayload(jobData);

  const job = await translationQueue.add('translateResource', jobData, {
    attempts: 3,
    backoff: 'exponential',
    removeOnComplete: 10,
    removeOnFail: 5,
    ...options
  });

  return {
    jobId: job.id,
    resourceId,
    shopDomain,
    status: 'queued'
  };
}

/**
 * 添加批量翻译任务到队列
 * @param {Array} resourceIds - 资源ID列表
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {string} shopDomain - 店铺域名
 * @returns {Promise<Object>} 任务信息
 */
export async function addBatchTranslationJob(resourceIds, shopId, language, shopDomain) {
  if (!translationQueue) {
    throw new Error('任务队列未配置，无法创建批量任务');
  }

  const jobData = {
    resourceIds,
    shopId,
    shopDomain,
    language
  };

  assertBatchJobPayload(jobData);

  const job = await translationQueue.add('batchTranslate', jobData, {
    attempts: 1,
    removeOnComplete: 5,
    removeOnFail: 5
  });

  return {
    jobId: job.id,
    resourceCount: resourceIds.length,
    shopDomain,
    status: 'queued'
  };
}

/**
 * 获取任务状态
 * @param {string} jobId - 任务ID
 * @returns {Promise<Object>} 任务状态
 */
export async function getJobStatus(jobId) {
  if (!translationQueue) {
    return { error: '任务队列未配置' };
  }

  const job = await translationQueue.getJob(jobId);

  if (!job) {
    return { error: '任务不存在' };
  }

  const progress = typeof job.progress === 'function' ? job.progress() : job.progress;
  const state = typeof job.getState === 'function' ? await job.getState() : job.status;

  return {
    id: job.id,
    progress,
    state,
    createdAt: job.timestamp ? new Date(job.timestamp) : job.createdAt ? new Date(job.createdAt) : null,
    processedAt: job.processedOn ? new Date(job.processedOn) : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : job.completedAt ? new Date(job.completedAt) : null,
    failedReason: job.failedReason || job.error,
    data: job.data
  };
}

/**
 * 获取队列统计信息
 * @returns {Promise<Object>} 队列统计
 */
export async function getQueueStats() {
  if (!translationQueue) {
    return { error: '任务队列未配置' };
  }

  const waiting = await translationQueue.getWaiting();
  const active = await translationQueue.getActive();
  const completed = await translationQueue.getCompleted();
  const failed = await translationQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    total: waiting.length + active.length + completed.length + failed.length
  };
}

/**
 * 清理队列中的任务
 * @param {string} type - 清理类型: 'completed', 'failed', 'all'
 * @returns {Promise<Object>} 清理结果
 */
export async function cleanQueue(type = 'completed') {
  if (!translationQueue) {
    return { error: '任务队列未配置' };
  }

  let cleaned = 0;

  switch (type) {
    case 'completed':
      cleaned = await translationQueue.clean(5000, 'completed');
      break;
    case 'failed':
      cleaned = await translationQueue.clean(5000, 'failed');
      break;
    case 'all':
      const completedCleaned = await translationQueue.clean(0, 'completed');
      const failedCleaned = await translationQueue.clean(0, 'failed');
      cleaned = completedCleaned + failedCleaned;
      break;
    default:
      break;
  }

  return {
    cleaned,
    type
  };
}

// 导出队列实例
export { redis };
