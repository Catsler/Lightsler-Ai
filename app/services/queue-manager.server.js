/**
 * 队列管理器 - 处理Redis和内存队列的自动切换
 * 实现健康检查、降级、恢复和任务迁移
 */

import { logger } from '../utils/logger.server.js';
import { config } from '../utils/config.server.js';
import { MemoryQueue } from './memory-queue.server.js';
import { prisma } from './database.server.js';
import { collectError, ERROR_TYPES } from './error-collector.server.js';
import { getEnvWithDevOverride } from '../utils/env.server.js';
import Bull from 'bull';

const SHOP_ID = getEnvWithDevOverride('SHOP_ID', 'default');

class QueueManager {
  constructor() {
    this.mode = 'redis'; // 'redis' | 'memory'
    this.redisQueue = null;
    this.memoryQueue = null;
    this.currentQueue = null;

    this.metrics = {
      redisErrors: 0,
      fallbackCount: 0,
      lastHealthCheck: null,
      lastMigration: null
    };

    this.healthCheckTimer = null;
    this.isTransitioning = false;

    // 健康检查配置
    this.healthConfig = {
      interval: 30000, // 30秒检查一次
      errorThreshold: 3, // 连续3次错误才降级
      recoveryTimeout: 60000, // 1分钟后尝试恢复
    };
  }

  /**
   * 初始化队列管理器
   * @param {Object} redisConfig - Redis配置
   * @param {string} queueName - 队列名称
   */
  async initialize(redisConfig, queueName) {
    this.queueName = queueName;
    this.redisConfig = redisConfig;

    try {
      if (redisConfig) {
        logger.debug(`[QueueManager] 尝试初始化Redis队列 [Shop: ${SHOP_ID}]`);
        await this.initializeRedisQueue();
      } else {
        logger.debug(`[QueueManager] Redis配置不可用，初始化内存队列 [Shop: ${SHOP_ID}]`);
        await this.initializeMemoryQueue();
      }
    } catch (error) {
      logger.error(`[QueueManager] 队列初始化失败:`, error);
      await this.initializeMemoryQueue();
    }

    // 启动健康检查
    this.startHealthCheck();

    return this.currentQueue;
  }

  /**
   * 初始化Redis队列
   */
  async initializeRedisQueue() {
    try {
      this.redisQueue = new Bull(this.queueName, {
        redis: this.redisConfig,
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
          lockDuration: 120000,      // 120秒锁定时间（翻译任务可能较慢）
          lockRenewTime: 30000,      // 每30秒自动续期锁
          stalledInterval: 60000,    // 60秒检查间隔（之前30秒太短）
          maxStalledCount: 2,        // 最多标记2次（降低误判）
          retryProcessDelay: 5000,
        }
      });

      // 监听队列事件
      this.attachRedisQueueEvents();

      // 测试连接
      await this.testRedisConnection();

      this.mode = 'redis';
      this.currentQueue = this.redisQueue;
      this.metrics.redisErrors = 0;

      logger.debug(`[QueueManager] Redis队列初始化成功 [Shop: ${SHOP_ID}]`);
    } catch (error) {
      logger.error(`[QueueManager] Redis队列初始化失败:`, error);
      throw error;
    }
  }

  /**
   * 初始化内存队列
   */
  async initializeMemoryQueue() {
    try {
      this.memoryQueue = new MemoryQueue(this.queueName, {
        defaultConcurrency: config.queue?.concurrency || 1
      });

      this.mode = 'memory';
      this.currentQueue = this.memoryQueue;
      this.metrics.fallbackCount++;

      logger.debug(`[QueueManager] 内存队列初始化成功 [Shop: ${SHOP_ID}]`);
    } catch (error) {
      logger.error(`[QueueManager] 内存队列初始化失败:`, error);
      throw error;
    }
  }

  /**
   * 附加Redis队列事件监听
   */
  attachRedisQueueEvents() {
    if (!this.redisQueue) return;

    this.redisQueue.on('error', async (error) => {
      logger.error(`[QueueManager] Redis队列错误:`, error);
      this.metrics.redisErrors++;

      await this.collectError('REDIS_QUEUE_ERROR', error);

      // 错误次数超过阈值时降级
      if (this.metrics.redisErrors >= this.healthConfig.errorThreshold) {
        await this.fallbackToMemory(`Redis队列连续${this.metrics.redisErrors}次错误`);
      }
    });

    this.redisQueue.on('failed', async (job, err) => {
      logger.error(`[QueueManager] 任务失败 ${job?.id}:`, err);
      await this.collectError('JOB_FAILED', err, { jobId: job?.id, jobData: job?.data });
    });

    this.redisQueue.on('completed', (job, result) => {
      logger.debug(`[QueueManager] 任务完成 ${job?.id}`);
    });

    this.redisQueue.on('stalled', async (job) => {
      logger.warn(`[QueueManager] 任务卡住 ${job?.id}`);
      await this.collectError('JOB_STALLED', new Error('Job stalled'), { jobId: job?.id });
    });
  }

  /**
   * 测试Redis连接
   */
  async testRedisConnection() {
    if (!this.redisQueue) throw new Error('Redis队列未初始化');

    try {
      // 创建一个测试任务
      const testJob = await this.redisQueue.add('test', { test: true }, {
        removeOnComplete: true,
        removeOnFail: true
      });

      // 立即移除测试任务
      await testJob.remove();

      logger.debug(`[QueueManager] Redis连接测试成功 [Shop: ${SHOP_ID}]`);
    } catch (error) {
      logger.error(`[QueueManager] Redis连接测试失败:`, error);
      throw error;
    }
  }

  /**
   * 降级到内存队列
   */
  async fallbackToMemory(reason) {
    if (this.mode === 'memory' || this.isTransitioning) {
      return;
    }

    this.isTransitioning = true;
    logger.warn(`[QueueManager] 降级到内存模式: ${reason} [Shop: ${SHOP_ID}]`);

    try {
      // 1. 保存Redis队列中的待处理任务
      const waitingJobs = await this.saveRedisJobs();

      // 2. 初始化内存队列
      await this.initializeMemoryQueue();

      // 3. 迁移任务到内存队列
      await this.migrateJobsToMemory(waitingJobs);

      // 4. 关闭Redis队列
      if (this.redisQueue) {
        try {
          await this.redisQueue.close();
        } catch (error) {
          logger.warn(`[QueueManager] 关闭Redis队列失败:`, error);
        }
        this.redisQueue = null;
      }

      // 5. 记录降级事件
      await this.collectError('QUEUE_FALLBACK', new Error(reason), {
        migratedJobs: waitingJobs.length
      });

      logger.debug(`[QueueManager] 已降级到内存模式，迁移了${waitingJobs.length}个任务 [Shop: ${SHOP_ID}]`);
    } catch (error) {
      logger.error(`[QueueManager] 降级过程失败:`, error);
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * 恢复到Redis队列
   */
  async recoverToRedis() {
    if (this.mode === 'redis' || this.isTransitioning || !this.redisConfig) {
      return;
    }

    this.isTransitioning = true;
    logger.debug(`[QueueManager] 尝试恢复到Redis模式 [Shop: ${SHOP_ID}]`);

    try {
      // 1. 保存内存队列中的任务
      const memoryJobs = this.memoryQueue ? this.memoryQueue.getAllJobs() : [];

      // 2. 重新初始化Redis队列
      await this.initializeRedisQueue();

      // 3. 迁移任务到Redis队列
      await this.migrateJobsToRedis(memoryJobs);

      // 4. 清理内存队列
      if (this.memoryQueue) {
        this.memoryQueue.clear();
        this.memoryQueue = null;
      }

      logger.debug(`[QueueManager] 已恢复到Redis模式，迁移了${memoryJobs.length}个任务 [Shop: ${SHOP_ID}]`);
      this.metrics.lastMigration = Date.now();
    } catch (error) {
      logger.error(`[QueueManager] 恢复到Redis失败:`, error);
      // 恢复失败，继续使用内存模式
      await this.initializeMemoryQueue();
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * 保存Redis队列中的任务到数据库
   */
  async saveRedisJobs() {
    if (!this.redisQueue) return [];

    try {
      const waitingJobs = await this.redisQueue.getWaiting();
      const activeJobs = await this.redisQueue.getActive();
      const allJobs = [...waitingJobs, ...activeJobs];

      // 保存到数据库
      for (const job of allJobs) {
        await prisma.queueBackup.create({
          data: {
            shopId: SHOP_ID,
            jobId: job.id.toString(),
            jobName: job.name,
            jobData: JSON.stringify(job.data),
            jobOpts: JSON.stringify(job.opts || {}),
            createdAt: new Date(job.timestamp || Date.now())
          }
        });
      }

      logger.debug(`[QueueManager] 已保存${allJobs.length}个Redis任务到数据库 [Shop: ${SHOP_ID}]`);
      return allJobs;
    } catch (error) {
      logger.error(`[QueueManager] 保存Redis任务失败:`, error);
      return [];
    }
  }

  /**
   * 将任务迁移到内存队列
   */
  async migrateJobsToMemory(jobs) {
    if (!this.memoryQueue || jobs.length === 0) return;

    for (const job of jobs) {
      try {
        await this.memoryQueue.add(job.name, job.data, job.opts || {});
      } catch (error) {
        logger.error(`[QueueManager] 迁移任务${job.id}到内存队列失败:`, error);
      }
    }
  }

  /**
   * 将任务迁移到Redis队列
   */
  async migrateJobsToRedis(jobs) {
    if (!this.redisQueue || jobs.length === 0) return;

    for (const job of jobs) {
      try {
        await this.redisQueue.add(job.name, job.data, job.opts || {});
      } catch (error) {
        logger.error(`[QueueManager] 迁移任务${job.id}到Redis队列失败:`, error);
      }
    }
  }

  /**
   * 从数据库恢复任务
   */
  async restoreJobsFromDatabase() {
    try {
      const backupJobs = await prisma.queueBackup.findMany({
        where: { shopId: SHOP_ID },
        orderBy: { createdAt: 'asc' }
      });

      for (const backup of backupJobs) {
        try {
          const jobData = JSON.parse(backup.jobData);
          const jobOpts = JSON.parse(backup.jobOpts);

          await this.currentQueue.add(backup.jobName, jobData, jobOpts);
        } catch (error) {
          logger.error(`[QueueManager] 恢复任务${backup.jobId}失败:`, error);
        }
      }

      // 清理已恢复的备份
      await prisma.queueBackup.deleteMany({
        where: { shopId: SHOP_ID }
      });

      logger.debug(`[QueueManager] 已从数据库恢复${backupJobs.length}个任务 [Shop: ${SHOP_ID}]`);
    } catch (error) {
      logger.error(`[QueueManager] 从数据库恢复任务失败:`, error);
    }
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthConfig.interval);

    // 防止定时器阻止进程退出
    if (typeof this.healthCheckTimer.unref === 'function') {
      this.healthCheckTimer.unref();
    }
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    this.metrics.lastHealthCheck = Date.now();

    try {
      if (this.mode === 'memory' && this.redisConfig) {
        // 在内存模式下，检查Redis是否恢复
        await this.checkRedisRecovery();
      } else if (this.mode === 'redis') {
        // 在Redis模式下，检查Redis健康状态
        await this.checkRedisHealth();
      }
    } catch (error) {
      logger.error(`[QueueManager] 健康检查失败:`, error);
    }
  }

  /**
   * 检查Redis是否恢复
   */
  async checkRedisRecovery() {
    try {
      // 测试Redis连接
      const testRedis = new (await import('ioredis')).default(this.redisConfig);
      await testRedis.ping();
      await testRedis.quit();

      // Redis恢复，尝试切换回去
      if (Date.now() - (this.metrics.lastMigration || 0) > this.healthConfig.recoveryTimeout) {
        await this.recoverToRedis();
      }
    } catch (error) {
      // Redis仍未恢复，继续使用内存模式
      logger.debug(`[QueueManager] Redis仍未恢复: ${error.message} [Shop: ${SHOP_ID}]`);
    }
  }

  /**
   * 检查Redis健康状态
   */
  async checkRedisHealth() {
    try {
      if (this.redisQueue) {
        // 检查队列统计信息
        const waiting = await this.redisQueue.getWaiting();
        const active = await this.redisQueue.getActive();

        // 如果有太多活跃任务卡住，可能有问题
        if (active.length > 10) {
          logger.warn(`[QueueManager] 检测到${active.length}个活跃任务，可能存在性能问题 [Shop: ${SHOP_ID}]`);
        }
      }
    } catch (error) {
      this.metrics.redisErrors++;
      logger.warn(`[QueueManager] Redis健康检查失败:`, error);

      if (this.metrics.redisErrors >= this.healthConfig.errorThreshold) {
        await this.fallbackToMemory('健康检查失败');
      }
    }
  }

  /**
   * 收集错误信息
   */
  async collectError(type, error, context = {}) {
    try {
      await collectError({
        errorType: ERROR_TYPES.SYSTEM,
        errorCategory: 'QUEUE_MANAGER',
        errorCode: type,
        message: error.message || error,
        stack: error.stack,
        operation: 'queue.manager',
        severity: 3,
        retryable: false,
        context: {
          shopId: SHOP_ID,
          queueMode: this.mode,
          ...context
        }
      });
    } catch (collectErr) {
      logger.warn(`[QueueManager] 错误收集失败:`, collectErr);
    }
  }

  /**
   * 获取当前队列
   */
  getQueue() {
    return this.currentQueue;
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      mode: this.mode,
      shopId: SHOP_ID,
      metrics: this.metrics,
      isTransitioning: this.isTransitioning,
      hasRedisConfig: !!this.redisConfig
    };
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.stopHealthCheck();

    if (this.redisQueue) {
      try {
        await this.redisQueue.close();
      } catch (error) {
        logger.warn(`[QueueManager] 关闭Redis队列失败:`, error);
      }
    }

    if (this.memoryQueue) {
      this.memoryQueue.clear();
    }
  }
}

// 单例模式
let queueManager = null;

export function getQueueManager() {
  if (!queueManager) {
    queueManager = new QueueManager();
  }
  return queueManager;
}

export default QueueManager;