/**
 * 内存队列实现 - Redis不可用时的备用方案
 */

// 内存队列存储
const jobs = new Map();
const queue = [];
let jobIdCounter = 1;
let isProcessing = false;

/**
 * 简单的内存任务队列
 */
class MemoryQueue {
  constructor(name) {
    this.name = name;
    this.processors = new Map();
  }

  // 添加任务处理器
  process(jobType, concurrency, processor) {
    if (typeof concurrency === 'function') {
      processor = concurrency;
      concurrency = 1;
    }
    
    this.processors.set(jobType, { processor, concurrency });
    console.log(`📝 注册内存队列处理器: ${jobType} (并发: ${concurrency})`);
  }

  // 添加任务到队列
  async add(jobType, data, options = {}) {
    const jobId = jobIdCounter++;
    const job = {
      id: jobId,
      type: jobType,
      data,
      options,
      status: 'waiting',
      progress: 0,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: options.attempts || 3
    };

    jobs.set(jobId, job);
    queue.push(job);

    console.log(`➕ 添加内存队列任务: ${jobType} (ID: ${jobId})`);

    // 启动处理器
    this.processQueue();

    return {
      id: jobId,
      progress: () => job.progress,
      finished: () => new Promise((resolve, reject) => {
        const checkStatus = () => {
          const currentJob = jobs.get(jobId);
          if (currentJob.status === 'completed') {
            resolve(currentJob.result);
          } else if (currentJob.status === 'failed') {
            reject(new Error(currentJob.error));
          } else {
            setTimeout(checkStatus, 100);
          }
        };
        checkStatus();
      })
    };
  }

  // 处理队列
  async processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      const job = queue.shift();
      const processor = this.processors.get(job.type);

      if (!processor) {
        console.warn(`⚠️ 未找到处理器: ${job.type}`);
        continue;
      }

      try {
        console.log(`🔄 处理内存队列任务: ${job.type} (ID: ${job.id})`);
        job.status = 'active';
        
        // 创建job对象，模拟Bull.js接口
        const jobObj = {
          id: job.id,
          data: job.data,
          progress: (value) => {
            job.progress = value;
          }
        };

        const result = await processor.processor(jobObj);
        
        job.status = 'completed';
        job.result = result;
        job.completedAt = new Date();

        console.log(`✅ 内存队列任务完成: ${job.type} (ID: ${job.id})`);

      } catch (error) {
        job.attempts++;
        console.error(`❌ 内存队列任务失败: ${job.type} (ID: ${job.id})`, error.message);

        if (job.attempts < job.maxAttempts) {
          console.log(`🔄 重试任务: ${job.type} (ID: ${job.id}, 尝试: ${job.attempts}/${job.maxAttempts})`);
          queue.push(job); // 重新排队
        } else {
          job.status = 'failed';
          job.error = error.message;
          job.failedAt = new Date();
        }
      }
    }

    isProcessing = false;
  }

  // 获取任务
  async getJob(jobId) {
    return jobs.get(jobId);
  }

  // 清理已完成的任务
  async clean(grace, type) {
    let cleaned = 0;
    const cutoff = new Date(Date.now() - grace);

    for (const [id, job] of jobs) {
      if (type === 'completed' && job.status === 'completed' && job.completedAt < cutoff) {
        jobs.delete(id);
        cleaned++;
      } else if (type === 'failed' && job.status === 'failed' && job.failedAt < cutoff) {
        jobs.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  // 获取各种状态的任务
  async getWaiting() {
    return Array.from(jobs.values()).filter(job => job.status === 'waiting');
  }

  async getActive() {
    return Array.from(jobs.values()).filter(job => job.status === 'active');
  }

  async getCompleted() {
    return Array.from(jobs.values()).filter(job => job.status === 'completed');
  }

  async getFailed() {
    return Array.from(jobs.values()).filter(job => job.status === 'failed');
  }

  // 事件处理（简化版）
  on(event, handler) {
    // 简化实现，仅记录日志
    console.log(`📝 注册内存队列事件: ${event}`);
  }
}

export { MemoryQueue };