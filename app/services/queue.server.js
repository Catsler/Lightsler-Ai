import Bull from 'bull';
import Redis from 'ioredis';
import { translateResource } from './translation.server.js';
import shopify, { apiVersion } from '../shopify.server.js';
import { updateResourceTranslation } from './shopify-graphql.server.js';
import { saveTranslation, updateResourceStatus, prisma } from './database.server.js';
// import { authenticate } from '../shopify.server.js'; // 只在需要时导入
import { config } from '../utils/config.server.js';
import { MemoryQueue } from './memory-queue.server.js';
import { collectError, ERROR_TYPES } from './error-collector.server.js';
import { createShopRedisConfig, parseRedisUrl } from '../utils/redis-parser.server.js';
import { logger } from '../utils/logger.server.js';
import { getLinkConversionConfig } from './market-urls.server.js';

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
    enableOfflineQueue: true,
    retryDelayOnFailover: 500,

    // 错误处理
    reconnectOnError: (err) => {
      logger.warn(`Redis连接错误 [Shop: ${SHOP_ID}]:`, err.message);
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

  const apiVersionToUse = shopify.api?.config?.apiVersion || apiVersion || '2025-01';
  const endpoint = `https://${shopDomain}/admin/api/${apiVersionToUse}/graphql.json`;

  const graphql = async (query, options = {}) => {
    const body = {
      query: typeof query === 'string' ? query : String(query),
      ...(options?.variables ? { variables: options.variables } : {})
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
        ...(options?.headers || {})
      },
      body: JSON.stringify(body),
      signal: options?.signal
    });

    return response;
  };

  return { graphql };
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
    logger.info(`[Queue] 初始化Redis连接 [Shop: ${SHOP_ID}, DB: ${redisConfig.db || 0}]`);
    redis = new Redis(redisConfig);

    // 处理连接错误
    redis.on('error', (error) => {
      // 忽略常见的非致命错误
      const ignorableErrors = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'];
      if (ignorableErrors.some(e => error.message.includes(e))) {
        logger.debug('Redis连接临时中断:', error.message);
        return;
      }

      if (!redis._isConnected && redisConnectionAttempts >= MAX_REDIS_ATTEMPTS) {
        logger.warn('Redis连接失败，切换到内存模式');
        redis = null;
      }
    });

    // 成功连接后重置计数器
    redis.on('connect', () => {
      redisConnectionAttempts = 0;
      logger.info('Redis连接成功');
    });
  } else {
    logger.info('Redis未配置，将使用内存模式');
    redis = null;
  }
} catch (error) {
  logger.warn('Redis连接失败，将使用内存模式:', error.message);
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
  // 🔍 临时调试日志 - 验证processor注册情况（验证后删除）
  logger.info('[Queue] registerProcessors', {
    queueType: queue?.constructor?.name,
    hasProcess: typeof queue?.process,
    shopId: SHOP_ID
  });

  if (!queue || typeof queue.process !== 'function') {
    logger.warn('[Queue] registerProcessors skipped - invalid queue');
    return;
  }

  const definitions = ensureProcessorDefinitions();

  for (const definition of definitions) {
    const concurrency = Math.max(1, definition.concurrency());
    const handler = definition.handler;
    const boundHandler = handler.length > 1
      ? (job) => handler(job, queue)
      : handler;

    // 🔍 临时调试日志 - 验证processor注册（验证后删除）
    logger.info('[Queue] Registering processor', {
      name: definition.name,
      concurrency
    });

    queue.process(definition.name, concurrency, boundHandler);
  }

  logger.info('[Queue] All processors registered successfully');
}

function attachLifecycleEvents(queue) {
  if (!queue || typeof queue.on !== 'function' || attachedQueues.has(queue)) {
    return;
  }

  attachedQueues.add(queue);

  // 🔍 临时调试事件 - 验证Bull queue是否工作（验证后删除）
  queue.on('waiting', (jobId) => {
    logger.info('[Queue Event] waiting', { jobId });
  });

  queue.on('active', (job) => {
    logger.info('[Queue Event] active', { jobId: job?.id, name: job?.name });
  });

  queue.on('stalled', (job) => {
    logger.warn('[Queue Event] stalled', { jobId: job?.id, name: job?.name });
  });

  queue.on('error', async (error) => {
    logger.error('队列错误:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack,
      type: error?.constructor?.name,
      fullError: error
    });

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
      logger.warn('记录队列系统错误失败:', collectErr?.message || collectErr);
    }

    if (!useMemoryQueue) {
      await requestMemoryFallback(`Redis队列出错，切换到内存模式: ${error?.message || error}`);
    }
  });

  queue.on('failed', async (job, err) => {
    logger.error(`任务失败 ${job?.id}:`, err);

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
      logger.warn('记录任务失败错误失败:', collectErr?.message || collectErr);
    }
  });

  queue.on('completed', (job, result) => {
    logger.info(`任务完成 ${job?.id}:`, result);
  });
}

function createBullQueue() {
  if (!redisConfig) {
    throw new Error('Redis配置不可用，无法创建Bull队列');
  }

  logger.info(`[Queue] 创建Bull队列 [Shop: ${SHOP_ID}, Queue: ${QUEUE_NAME}, DB: ${redisConfig.db || 0}]`);

  // ✅ 创建纯净的IORedis配置对象（移除可能干扰Bull的自定义字段）
  const cleanRedisConfig = {
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db,
    password: redisConfig.password,
    username: redisConfig.username,
    tls: redisConfig.tls,
    maxRetriesPerRequest: 2,  // Bull推荐值
    enableReadyCheck: false,
    connectTimeout: 60000,    // 增加到60秒
    commandTimeout: 30000,    // 增加到30秒（避免Railway Redis超时）
    enableOfflineQueue: redisConfig.enableOfflineQueue,
    retryDelayOnFailover: redisConfig.retryDelayOnFailover,
    reconnectOnError: redisConfig.reconnectOnError
  };

  // 移除undefined值（Bull不需要这些）
  Object.keys(cleanRedisConfig).forEach(key => {
    if (cleanRedisConfig[key] === undefined) {
      delete cleanRedisConfig[key];
    }
  });

  logger.info('[Queue] Bull配置已清理', {
    hasHost: !!cleanRedisConfig.host,
    hasPort: !!cleanRedisConfig.port,
    db: cleanRedisConfig.db,
    hasTLS: !!cleanRedisConfig.tls
  });

  return new Bull(QUEUE_NAME, {
    redis: cleanRedisConfig,  // ✅ 使用清理后的配置
    prefix: `bull:${SHOP_ID}`,
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    },
    settings: {
      stalledInterval: 30000,
      retryProcessDelay: 5000
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
        logger.info('🔄 检测到Redis恢复，可手动切回Redis队列');
        redisRecoveryNotified = true;
      }
    } catch (error) {
      redisRecoveryNotified = false;
      logger.debug('Redis仍不可用:', error?.message || error);
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
  logger.warn(reason);

  const previousQueue = translationQueue;
  const memoryQueue = createMemoryQueueInstance();

  translationQueue = memoryQueue;
  useMemoryQueue = true;

  registerProcessors(memoryQueue);
  attachLifecycleEvents(memoryQueue);

  logger.info('⚠️ 队列已切换到内存模式');

  if (previousQueue?.close) {
    try {
      await previousQueue.close();
    } catch (error) {
      logger.warn('关闭Redis队列失败:', error?.message || error);
    }
  }

  isSwitchingQueue = false;
  startHealthCheck();
}

function initializeQueue() {
  if (!useMemoryQueue) {
    try {
      logger.info('[Queue] 开始创建Bull队列...', {
        shopId: SHOP_ID,
        redisConfig: redisConfig ? {
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db
        } : null
      });

      translationQueue = createBullQueue();

      // 🔍 异步验证连接（不阻塞模块加载）
      translationQueue.isReady()
        .then(() => {
          logger.info('[Queue] ✅ Bull队列已连接到Redis', {
            shopId: SHOP_ID,
            queueName: translationQueue.name
          });
        })
        .catch((connErr) => {
          logger.warn('[Queue] ❌ Bull队列连接Redis失败:', {
            message: connErr?.message,
            code: connErr?.code,
            stack: connErr?.stack
          });
          // 连接失败时的降级处理在queue.on('error')中完成
        });
    } catch (error) {
      logger.warn('Bull队列创建失败，使用内存模式:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
      useMemoryQueue = true;
    }
  }

  if (useMemoryQueue || !translationQueue) {
    translationQueue = createMemoryQueueInstance();
    useMemoryQueue = true;
  }

  // ✅ Worker进程需要在queue ready后手动调用registerQueueProcessors()
  const QUEUE_ROLE = process.env.QUEUE_ROLE || '';
  if (QUEUE_ROLE === 'worker') {
    logger.info('[Queue] Worker模式，等待queue ready后手动注册processors');
  } else {
    logger.info('[Queue] 主应用模式，不注册processors');
  }

  attachLifecycleEvents(translationQueue);

  if (useMemoryQueue) {
    startHealthCheck();
  } else {
    stopHealthCheck();
  }

  logger.info(`🚀 翻译队列已启动: ${useMemoryQueue ? '内存模式' : 'Redis模式'}`);
}

async function handleTranslateResource(job) {
  // 🔍 调试日志 - 验证handler是否被调用
  logger.info('[Worker] ⚡ handleTranslateResource CALLED', { 
    jobId: job?.id, 
    jobName: job?.name,
    hasData: !!job?.data 
  });
  
  assertJobPayload(job?.data);
  const { resourceId, shopId, shopDomain, language } = job.data;
  let resource;

  logger.info(`[Worker] 开始翻译: resourceId=${resourceId}, language=${language}`, { jobId: job.id, shopId });

  try {
    job.progress(10);

    resource = await prisma.resource.findUnique({
      where: { id: resourceId }
    });

    if (!resource) {
      // 🔥 资源不存在 - 可能是跨环境访问或已删除
      // 返回失败状态而不是抛出异常，避免任务卡住
      const currentEnvShop = await prisma.shop.findFirst({
        select: { id: true, domain: true }
      });

      logger.error('[Worker] 资源不存在，可能是跨环境访问', {
        resourceId,
        requestedShopId: shopId,
        currentEnvShop: currentEnvShop?.domain || 'unknown',
        jobId: job.id
      });

      return {
        resourceId,
        success: false,
        error: 'RESOURCE_NOT_FOUND',
        message: `资源不存在 - 可能是跨环境访问 (当前环境: ${currentEnvShop?.domain || 'unknown'}, 请求shopId: ${shopId})`
      };
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

    // 🆕 动态获取链接转换配置
    const linkConversionConfig = await getLinkConversionConfig(
      shop.domain,
      admin,
      language
    ).catch(err => {
      logger.warn('获取链接转换配置失败，将跳过链接转换', err);
      return null;  // 降级处理
    });

    // 🆕 构建翻译选项
    const translationOptions = {
      admin,
      shopId: shop.domain
    };
    if (linkConversionConfig) {
      translationOptions.linkConversion = linkConversionConfig;
    }

    const translationResult = await translateResource(resource, language, translationOptions);
    job.progress(50);

    if (translationResult.skipped) {
      logger.info(`ℹ️ 跳过翻译，内容未变化: ${resource.title}`);
      await updateResourceStatus(resourceId, 'pending');
      job.progress(100);
      logger.info(`[Worker] 完成（跳过）: resourceId=${resourceId}`, { jobId: job.id });
      return {
        resourceId,
        resourceType: resource.resourceType,
        title: resource.title,
        success: true,
        skipped: true,
        skipReason: translationResult.skipReason
      };
    }

    // 确保传递正确的数据结构给 saveTranslation
    // translationResult 可能包含 translations 字段，也可能直接就是翻译数据
    const translationData = translationResult.translations || translationResult;

    // fail-fast 检查：确保 translations 字段有效
    if (!translationData || typeof translationData !== 'object') {
      logger.error('[Queue] 翻译结果结构异常', {
        resourceId,
        resourceType: resource?.resourceType,
        hasTranslations: !!translationResult.translations,
        translationResultKeys: translationResult ? Object.keys(translationResult) : []
      });
      throw new Error(`翻译结果缺少有效的 translations 字段: resourceId=${resourceId}`);
    }

    await saveTranslation(resourceId, shopId, language, translationData);
    job.progress(70);

    logger.info(`✅ 翻译完成，状态设为pending等待发布: ${resource.title} -> ${language}`);
    job.progress(90);

    await updateResourceStatus(resourceId, 'completed');
    job.progress(100);

    logger.info(`[Worker] 完成: resourceId=${resourceId}`, { jobId: job.id });

    return {
      resourceId,
      resourceType: resource.resourceType,
      title: resource.title,
      success: true,
      translations: translationResult.translations
    };
  } catch (error) {
    logger.error(`翻译任务失败 ${resourceId}:`, error);

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
      logger.warn('记录翻译任务错误失败:', collectErr?.message || collectErr);
    }

    try {
      await updateResourceStatus(resourceId, 'pending');
    } catch (statusError) {
      logger.warn('更新资源状态失败:', statusError?.message || statusError);
    }

    throw error;
  }
}

async function handleBatchTranslate(job) {
  // 🔍 临时调试日志 - 验证handler是否被调用（验证后删除）
  logger.info('[Batch] handleBatchTranslate 被调用', { jobId: job?.id });

  assertBatchJobPayload(job?.data);
  
  // ✅ 从 job.data 解构变量
  const { resourceIds, shopId, shopDomain, language } = job.data;
  const total = resourceIds.length;
  const jobIds = [];
  const errors = [];
  
  // ✅ 使用全局的translationQueue而不是参数传递
  if (!translationQueue || typeof translationQueue.add !== 'function') {
    throw new Error('当前队列不支持批量翻译');
  }

  logger.info(`[Batch] 批量添加翻译任务: ${total} 个`, { shopId, language });

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

      const translateJob = await translationQueue.add('translateResource', singleJobPayload, {
        attempts: 3,
        backoff: 'exponential'
        // 移除 delay 避免任务卡在 delayed 状态
      });

      jobIds.push(translateJob.id);
    } catch (error) {
      logger.error(`[Batch] 添加失败: resourceId=${resourceId}`, error);
      errors.push({
        resourceId,
        error: error?.message || String(error)
      });
    }

    if (total > 0) {
      job.progress(Math.round(((index + 1) / total) * 100));
    }
  }

  logger.info(`[Batch] 添加完成: ${jobIds.length}/${total} 成功`);

  return {
    total,
    queued: jobIds.length,
    failed: errors.length,
    jobIds,
    errors: errors.length > 0 ? errors : undefined
  };
}

initializeQueue();

/**
 * 手动注册队列processors（供Worker进程在queue ready后调用）
 */
export function registerQueueProcessors() {
  if (!translationQueue) {
    throw new Error('队列未初始化');
  }
  
  logger.info('[Queue] 手动注册processors');
  registerProcessors(translationQueue);
  logger.info('[Queue] Processors注册完成');
}

export { translationQueue, handleTranslateResource, handleBatchTranslate };

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

  logger.info('[addTranslationJob] 准备添加翻译任务', {
    resourceId,
    shopId,
    language,
    shopDomain,
    queueType: translationQueue.constructor.name,
    useMemoryQueue
  });

  const jobData = {
    resourceId,
    shopId,
    shopDomain,
    language
  };

  assertJobPayload(jobData);

  try {
    const job = await translationQueue.add('translateResource', jobData, {
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options
    });

    logger.info('[addTranslationJob] ✅ 翻译任务已添加', {
      jobId: job.id,
      resourceId,
      queueType: translationQueue.constructor.name
    });

    return {
      jobId: job.id,
      resourceId,
      shopDomain,
      status: 'queued'
    };
  } catch (error) {
    logger.error('[addTranslationJob] ❌ 添加任务失败', {
      resourceId,
      error: {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      }
    });
    throw error;
  }
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

  logger.info(`[addBatchTranslationJob] 准备添加批量任务`, {
    resourceCount: resourceIds.length,
    shopId,
    language,
    queueType: translationQueue.constructor.name  // 查看队列类型
  });

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

  logger.info(`[addBatchTranslationJob] 批量任务已添加`, {
    jobId: job.id,
    resourceCount: resourceIds.length
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
