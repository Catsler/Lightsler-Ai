/**
 * 内存队列实现 - Redis不可用时的备用方案
 */

import { logger } from '../utils/logger.server.js';

class MemoryQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.processors = new Map();
    this.jobs = new Map();
    this.queue = [];
    this.jobIdCounter = 1;
    this.isProcessing = false;
    this.runningTasks = new Set();
    this.listeners = new Map();
    this.defaultConcurrency = Math.max(1, options.defaultConcurrency || 1);
  }

  process(jobType, concurrency, processor) {
    if (typeof concurrency === 'function') {
      processor = concurrency;
      concurrency = 1;
    }

    const resolvedConcurrency = Math.max(1, Number(concurrency) || this.defaultConcurrency);
    this.processors.set(jobType, {
      processor,
      concurrency: resolvedConcurrency,
      active: 0
    });

    logger.info(`Register memory queue processor: ${jobType} (concurrency: ${resolvedConcurrency})`);
  }

  async add(jobType, data, options = {}) {
    const jobId = this.jobIdCounter++;
    const job = {
      id: jobId,
      name: jobType,
      type: jobType,
      data,
      opts: {
        attempts: options.attempts ?? 3,
        backoff: options.backoff ?? 'exponential',
        delay: options.delay ?? 0,
        removeOnComplete: options.removeOnComplete,
        removeOnFail: options.removeOnFail,
        ...options
      },
      status: options.delay ? 'delayed' : 'waiting',
      progress: 0,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: options.attempts ?? 3,
      result: undefined,
      error: undefined,
      resolveFinished: null,
      rejectFinished: null,
      finishedPromise: null
    };

    job.finishedPromise = new Promise((resolve, reject) => {
      job.resolveFinished = resolve;
      job.rejectFinished = reject;
    });

    this.jobs.set(jobId, job);

    const enqueueJob = () => {
      job.status = 'waiting';
      this.queue.push(job);
      this.processQueue();
    };

    if (job.opts.delay && job.opts.delay > 0) {
      logger.info(`Schedule delayed memory queue job: ${jobType} (ID: ${jobId}, delay: ${job.opts.delay}ms)`);
      setTimeout(() => {
        enqueueJob();
      }, job.opts.delay);
    } else {
      enqueueJob();
    }

    logger.info(`Add memory queue job: ${jobType} (ID: ${jobId})`);

    return this.createPublicJob(job);
  }

  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 || this.runningTasks.size > 0) {
      let scheduled = false;

      while (this.queue.length > 0) {
        const job = this.queue[0];
        const processor = this.processors.get(job.type);

        if (!processor) {
          logger.warn(`Processor not found for job type: ${job.type}`);
          this.queue.shift();
          job.status = 'failed';
          job.error = 'Processor not registered';
          job.failedAt = new Date();
          job.rejectFinished?.(new Error(job.error));
          this.emit('failed', this.createPublicJob(job), new Error(job.error));
          continue;
        }

        const limit = processor.concurrency ?? this.defaultConcurrency;
        if (processor.active >= limit) {
          break;
        }

        this.queue.shift();
        scheduled = true;
        processor.active += 1;

        const task = this.executeJob(job, processor)
          .catch((error) => {
            logger.error(`Memory queue job执行异常: ${error?.message || error}`);
          })
          .finally(() => {
            processor.active = Math.max(0, processor.active - 1);
            this.runningTasks.delete(task);
          });

        this.runningTasks.add(task);
      }

      if (this.runningTasks.size === 0) {
        break;
      }

      if (!scheduled) {
        await Promise.race(Array.from(this.runningTasks));
      }
    }

    if (this.runningTasks.size > 0) {
      await Promise.allSettled(Array.from(this.runningTasks));
    }

    this.isProcessing = false;
  }

  async executeJob(job, processor) {
    const publicJob = this.createPublicJob(job);

    try {
      job.status = 'active';
      job.startedAt = new Date();
      job.attempts += 1;
      publicJob.attemptsMade = job.attempts - 1;

      this.emit('active', publicJob);

      const result = await processor.processor(publicJob);

      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      publicJob.attemptsMade = job.attempts;

      job.resolveFinished?.(result);
      this.emit('completed', publicJob, result);
    } catch (error) {
      logger.error(`Memory queue job failed: ${job.type} (ID: ${job.id}) - ${error?.message || error}`);

      if (job.attempts < job.maxAttempts) {
        const delay = this.calculateBackoff(job);
        logger.info(`Retry job: ${job.type} (ID: ${job.id}, attempt: ${job.attempts}/${job.maxAttempts}, delay: ${delay}ms)`);
        job.status = 'waiting';
        job.progress = 0;
        setTimeout(() => {
          this.queue.push(job);
          this.processQueue();
        }, delay);
      } else {
        job.status = 'failed';
        job.error = error?.message || String(error);
        job.failedAt = new Date();
        job.rejectFinished?.(error instanceof Error ? error : new Error(job.error));
        this.emit('failed', publicJob, error);
      }
    }
  }

  calculateBackoff(job) {
    const attempt = Math.max(1, job.attempts);

    if (typeof job.opts.backoff === 'object' && job.opts.backoff?.type === 'exponential') {
      const base = job.opts.backoff.delay ?? 1000;
      return Math.min(30000, Math.pow(2, attempt - 1) * base);
    }

    if (job.opts.backoff === 'exponential') {
      return Math.min(30000, Math.pow(2, attempt - 1) * 1000);
    }

    if (typeof job.opts.backoff === 'number') {
      return job.opts.backoff;
    }

    return 1000;
  }

  createPublicJob(job) {
    const self = this;
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      attemptsMade: job.attempts,
      maxAttempts: job.maxAttempts,
      status: job.status,
      progress(value) {
        if (typeof value === 'number') {
          job.progress = value;
        }
        return job.progress;
      },
      getState: async () => job.status,
      finished: () => job.finishedPromise,
      timestamp: job.createdAt?.getTime(),
      processedOn: job.startedAt?.getTime(),
      finishedOn: job.completedAt?.getTime(),
      failedReason: job.error,
      toJSON() {
        return {
          id: job.id,
          name: job.name,
          data: job.data,
          status: job.status,
          progress: job.progress,
          attemptsMade: job.attempts,
          maxAttempts: job.maxAttempts
        };
      },
      remove: async () => {
        self.jobs.delete(job.id);
      }
    };
  }

  async getJob(jobId) {
    const job = this.jobs.get(Number(jobId));
    return job ? this.createPublicJob(job) : null;
  }

  async clean(grace, type) {
    let cleaned = 0;
    const cutoff = Date.now() - grace;

    for (const [id, job] of this.jobs) {
      if (type === 'completed' && job.status === 'completed' && job.completedAt && job.completedAt.getTime() < cutoff) {
        this.jobs.delete(id);
        cleaned += 1;
      } else if (type === 'failed' && job.status === 'failed' && job.failedAt && job.failedAt.getTime() < cutoff) {
        this.jobs.delete(id);
        cleaned += 1;
      }
    }

    return cleaned;
  }

  async getWaiting() {
    return Array.from(this.jobs.values())
      .filter(job => job.status === 'waiting' || job.status === 'delayed')
      .map(job => this.createPublicJob(job));
  }

  async getActive() {
    return Array.from(this.jobs.values())
      .filter(job => job.status === 'active')
      .map(job => this.createPublicJob(job));
  }

  async getCompleted() {
    return Array.from(this.jobs.values())
      .filter(job => job.status === 'completed')
      .map(job => this.createPublicJob(job));
  }

  async getFailed() {
    return Array.from(this.jobs.values())
      .filter(job => job.status === 'failed')
      .map(job => this.createPublicJob(job));
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(handler);
    logger.debug(`Register memory queue event: ${event}`);
  }

  emit(event, ...args) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (error) {
        logger.error(`Memory queue事件处理错误: ${error?.message || error}`);
      }
    }
  }

  async getJobs(types = ['waiting', 'active', 'completed', 'failed']) {
    const results = [];
    for (const type of types) {
      if (type === 'waiting') {
        results.push(...await this.getWaiting());
      } else if (type === 'active') {
        results.push(...await this.getActive());
      } else if (type === 'completed') {
        results.push(...await this.getCompleted());
      } else if (type === 'failed') {
        results.push(...await this.getFailed());
      }
    }
    return results;
  }

  async getJobCounts() {
    const allJobs = Array.from(this.jobs.values());
    return {
      waiting: allJobs.filter(j => j.status === 'waiting' || j.status === 'delayed').length,
      active: allJobs.filter(j => j.status === 'active').length,
      completed: allJobs.filter(j => j.status === 'completed').length,
      failed: allJobs.filter(j => j.status === 'failed').length
    };
  }

  async empty() {
    const count = this.jobs.size;
    this.jobs.clear();
    this.queue.length = 0;
    this.runningTasks.clear();
    return count;
  }

  async close() {
    logger.info('[MemoryQueue] Closing queue gracefully...');
    this.isProcessing = false;

    // 等待所有运行中的任务完成
    if (this.runningTasks.size > 0) {
      await Promise.allSettled(Array.from(this.runningTasks));
    }

    // 清空队列和任务
    this.jobs.clear();
    this.queue.length = 0;

    logger.info('[MemoryQueue] Queue closed');
  }
}

export { MemoryQueue };
