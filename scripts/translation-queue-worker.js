#!/usr/bin/env node

/**
 * Translation Queue Worker - 独立Worker进程
 * 直接创建Queue实例避免模块初始化问题
 */

import Bull from 'bull';
import { logger } from '../app/utils/logger.server.js';
import { handleTranslateResource, handleBatchTranslate } from '../app/services/queue.server.js';

const SHOP_ID = process.env.SHOP_ID || 'unknown';
const QUEUE_ROLE = process.env.QUEUE_ROLE || 'unknown';
const REDIS_URL = process.env.REDIS_URL;

// ✅ 启动时验证环境变量
logger.info('[Worker] Translation queue worker starting', {
  shopId: SHOP_ID,
  queueRole: QUEUE_ROLE,
  nodeEnv: process.env.NODE_ENV,
  hasRedisUrl: !!REDIS_URL,
  redisEnabled: process.env.REDIS_ENABLED
});

if (QUEUE_ROLE !== 'worker') {
  logger.error('[Worker] CRITICAL: QUEUE_ROLE is not "worker"', {
    actual: QUEUE_ROLE,
    expected: 'worker'
  });
}

if (!REDIS_URL) {
  logger.error('[Worker] CRITICAL: Missing REDIS_URL');
  process.exit(1);
}

// 🔥 使用统一的DB分配逻辑（与redis-parser.server.js一致）
function getShopDb(shopId) {
  const normalizedId = (shopId || '').toLowerCase();

  // 环境隔离映射
  const dbMap = {
    'lightsler-ai': 10,
    'lightsler': 10,
    'fynony': 11,
    'shop1': 11,
    'onewind': 2,
    'onewindoutdoors': 2,
    'shop2': 2
  };

  // 精确匹配或包含匹配
  for (const [key, db] of Object.entries(dbMap)) {
    if (normalizedId === key || normalizedId.includes(key)) {
      logger.info('[Worker] Shop ID映射到DB', { shopId, db });
      return db;
    }
  }

  logger.warn('[Worker] Shop ID未映射，使用默认DB 0', { shopId });
  return 0;
}

// 解析Redis URL
const url = new URL(REDIS_URL);
const redisConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 6379,
  password: url.password || undefined,
  db: getShopDb(SHOP_ID),  // 使用统一的DB分配函数
  maxRetriesPerRequest: null,  // 禁用限制，避免BLPOP被中断
  enableReadyCheck: false,
  connectTimeout: 30000
  // ❌ 不设置commandTimeout - BLPOP需要长时间等待
};

logger.info('[Worker] Redis config', {
  host: redisConfig.host,
  port: redisConfig.port,
  db: redisConfig.db,
  hasPassword: !!redisConfig.password
});

// ✅ 直接创建Queue实例
const queue = new Bull(`translation_${SHOP_ID}`, {
  redis: redisConfig,
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

// 🔍 捕获未处理的Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Worker] Unhandled Promise Rejection', {
    reason: reason,
    reasonType: typeof reason,
    stack: reason?.stack,
    promise: String(promise)
  });
});

// ✅ 注册processors
async function start() {
  try {
    logger.info('[Worker] Connecting to Redis queue...');
    await queue.isReady();
    logger.info('[Worker] Queue connection established');

    // 注册translateResource processor
    logger.info('[Worker] Registering translateResource processor');
    queue.process('translateResource', 2, async (job) => {
      logger.info('[Worker] ⚡ Processing translateResource job', { jobId: job.id });
      try {
        const result = await handleTranslateResource(job);
        logger.info('[Worker] ✅ Job completed', { jobId: job.id });
        return result;
      } catch (error) {
        logger.error('[Worker] ❌ Job failed', { jobId: job.id, error: error.message });
        throw error;
      }
    });

    // 注册batchTranslate processor
    logger.info('[Worker] Registering batchTranslate processor');
    queue.process('batchTranslate', 1, async (job) => {
      logger.info('[Worker] ⚡ Processing batchTranslate job', { jobId: job.id });
      try {
        const result = await handleBatchTranslate(job);
        logger.info('[Worker] ✅ Batch job completed', { jobId: job.id });
        return result;
      } catch (error) {
        logger.error('[Worker] ❌ Batch job failed', { jobId: job.id, error: error.message });
        throw error;
      }
    });

    logger.info('[Worker] Processors registered successfully');

    // ✅ 事件监听
    queue.on('waiting', (jobId) => {
      logger.info('[Worker Event] Job waiting', { jobId });
    });

    queue.on('active', (job) => {
      logger.info('[Worker Event] Job active', { jobId: job.id, name: job.name });
    });

    queue.on('completed', (job, result) => {
      logger.info('[Worker Event] Job completed', { jobId: job.id });
    });

    queue.on('failed', (job, err) => {
      logger.error('[Worker Event] Job failed', { jobId: job?.id, error: err.message });
    });

    queue.on('error', (error) => {
      logger.error('[Worker] Queue error', { error: error.message });
    });

    logger.info('[Worker] Event listeners attached');

    // ✅ 获取队列统计
    const counts = await queue.getJobCounts();

    logger.info('[Worker] Translation queue worker ready ✅', {
      shopId: SHOP_ID,
      queueRole: QUEUE_ROLE,
      queueName: queue.name,
      counts,
      redisMode: 'redis'
    });

    // 如果有waiting任务，立即触发处理
    if (counts.waiting > 0) {
      logger.info('[Worker] Found waiting jobs, worker will start processing', {
        waitingCount: counts.waiting
      });
    }

  } catch (error) {
    logger.error('[Worker] Failed to initialize queue worker ❌', {
      shopId: SHOP_ID,
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// ✅ 优雅关闭
async function gracefulShutdown(signal) {
  logger.info(`[Worker] Received ${signal}, shutting down queue worker`, { shopId: SHOP_ID });
  try {
    await queue.close();
    logger.info('[Worker] Queue closed gracefully');
  } catch (error) {
    logger.warn('[Worker] Failed to close queue gracefully', {
      shopId: SHOP_ID,
      error: error.message
    });
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ✅ 启动Worker
await start();

// ✅ 心跳日志
setInterval(async () => {
  try {
    const counts = await queue.getJobCounts();
    logger.debug('[Worker] Heartbeat', {
      shopId: SHOP_ID,
      counts
    });
  } catch (error) {
    logger.warn('[Worker] Failed to fetch queue counts', {
      shopId: SHOP_ID,
      error: error.message
    });
  }
}, 60_000);
