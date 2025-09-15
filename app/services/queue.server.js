import Bull from 'bull';
import Redis from 'ioredis';
import { translateResource } from './translation.server.js';
import { updateResourceTranslation } from './shopify-graphql.server.js';
import { saveTranslation, updateResourceStatus, prisma } from './database.server.js';
// import { authenticate } from '../shopify.server.js'; // 只在需要时导入
import { config } from '../utils/config.server.js';
import { MemoryQueue } from './memory-queue.server.js';
import { collectError, ERROR_TYPES } from './error-collector.server.js';

/**
 * Redis任务队列服务
 */

// Redis连接配置
const redisConfig = config.redis.url ? config.redis.url : {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
};

// 创建Redis连接
let redis;
let redisConnectionAttempts = 0;
const MAX_REDIS_ATTEMPTS = 3;

try {
  if (config.redis.enabled && (config.redis.url || config.redis.host)) {
    const redisOptions = typeof redisConfig === 'string' ? redisConfig : {
      ...redisConfig,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 100,
      connectTimeout: 1000,
      enableOfflineQueue: false, // 防止命令在离线时排队
      reconnectOnError: (err) => {
        // 只在特定错误时重连
        const targetErrors = ['READONLY', 'ECONNRESET', 'EPIPE'];
        if (targetErrors.some(e => err.message.includes(e))) {
          redisConnectionAttempts++;
          if (redisConnectionAttempts >= MAX_REDIS_ATTEMPTS) {
            console.warn(`Redis重连失败${MAX_REDIS_ATTEMPTS}次，切换到内存模式`);
            return false; // 停止重连
          }
          return true; // 重连
        }
        return false;
      }
    };
    redis = new Redis(redisOptions);
    
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

// 创建翻译任务队列
let translationQueue;
let useMemoryQueue = !redis;

if (!useMemoryQueue) {
  try {
    translationQueue = new Bull('translation', { 
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });
    
    // 监听队列错误，自动切换到内存模式
    translationQueue.on('error', (error) => {
      console.error('队列错误:', error.message);
      if (!useMemoryQueue) {
        console.warn('Redis队列出错，切换到内存模式');
        useMemoryQueue = true;
        // 创建内存队列替代
        const memQueue = new MemoryQueue('translation');

        // 验证内存队列接口完整性
        if (!memQueue.getJobs || !memQueue.getJobCounts || !memQueue.empty) {
          console.error('内存队列接口不完整，使用基础功能');
          // 提供基础降级方案
          translationQueue.getJobs = async () => [];
          translationQueue.getJobCounts = async () => ({ waiting: 0, active: 0, completed: 0, failed: 0 });
          translationQueue.empty = async () => 0;
        } else {
          // 原有的方法绑定逻辑保持不变
          translationQueue.add = memQueue.add.bind(memQueue);
          translationQueue.process = memQueue.process.bind(memQueue);
          translationQueue.getJobs = memQueue.getJobs.bind(memQueue);
          translationQueue.getJobCounts = memQueue.getJobCounts.bind(memQueue);
          translationQueue.clean = memQueue.clean.bind(memQueue);
          translationQueue.empty = memQueue.empty.bind(memQueue);
        }
      }
    });
  } catch (error) {
    console.warn('Bull队列创建失败，使用内存模式:', error.message);
    useMemoryQueue = true;
  }
}

if (useMemoryQueue) {
  translationQueue = new MemoryQueue('translation');
}

export { translationQueue };

console.log(`🚀 翻译队列已启动: ${!useMemoryQueue ? 'Redis模式' : '内存模式'}`);

// 队列处理器：翻译单个资源
if (translationQueue) {
  translationQueue.process('translateResource', config.queue.concurrency, async (job) => {
    const { resourceId, shopId, language, adminApiContext } = job.data;
    let resource;
    
    try {
      // 更新进度
      job.progress(10);
      
      // 获取资源信息
      resource = await prisma.resource.findUnique({
        where: { id: resourceId }
      });
      
      if (!resource) {
        throw new Error(`资源 ${resourceId} 不存在`);
      }
      
      // 更新资源状态为处理中
      await updateResourceStatus(resourceId, 'processing');
      job.progress(20);
      
      // 翻译资源内容
      const translations = await translateResource(resource, language);
      job.progress(50);
      
      // 保存翻译结果到数据库
      await saveTranslation(resourceId, shopId, language, translations);
      job.progress(70);
      
      // 使用保存的GID
      const gid = resource.gid;
      
      // 重新创建admin客户端（从会话信息）
      const shop = await prisma.shop.findUnique({
        where: { id: shopId }
      });
      
      if (!shop) {
        throw new Error(`店铺 ${shopId} 不存在`);
      }
      
      // 这里需要重新构建admin客户端，因为任务队列中无法直接传递admin对象
      // 简化版本：直接使用GraphQL API调用
      const adminGraphQL = {
        graphql: async (query, variables) => {
          try {
            const response = await fetch(`https://${shop.domain}/admin/api/2024-10/graphql.json`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': shop.accessToken,
              },
              body: JSON.stringify({
                query: query,
                variables: variables?.variables || variables || {}
              })
            });
            
            if (!response.ok) {
              throw new Error(`GraphQL请求失败: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 检查GraphQL错误
            if (data.errors && data.errors.length > 0) {
              throw new Error(`GraphQL错误: ${JSON.stringify(data.errors)}`);
            }
            
            return {
              json: () => Promise.resolve(data)
            };
          } catch (error) {
            console.error('GraphQL调用失败:', error);
            throw error;
          }
        }
      };
      
      // 更新到Shopify - 使用通用函数
      const updateResult = await updateResourceTranslation(
        adminGraphQL, 
        gid, 
        translations, 
        language,
        resource.resourceType.toUpperCase()
      );
      job.progress(90);
      
      // 更新资源状态为完成
      await updateResourceStatus(resourceId, 'completed');
      job.progress(100);
      
      return {
        resourceId,
        resourceType: resource.resourceType,
        title: resource.title,
        success: true,
        translations
      };
      
    } catch (error) {
      console.error(`翻译任务失败 ${resourceId}:`, error);
      
      // 记录到错误数据库
      if (typeof collectError !== 'undefined') {
        await collectError({
          errorType: ERROR_TYPES.TRANSLATION,
          errorCategory: 'QUEUE_ERROR',
          errorCode: error.code || 'QUEUE_TRANSLATION_FAILED',
          message: `Queue translation failed for resource ${resourceId}: ${error.message}`,
          stack: error.stack,
          operation: 'queue.translateResource',
          resourceId,
          resourceType: resource.resourceType,
          targetLanguage: language,
          severity: 3,
          retryable: true,
          context: {
            shopId,
            jobId: job.id,
            attempt: job.attemptsMade,
            maxAttempts: job.opts.attempts
          }
        });
      }
      
      // 更新资源状态为待处理
      await updateResourceStatus(resourceId, 'pending');
      
      throw error;
    }
  });
  
  // 队列处理器：批量翻译
  translationQueue.process('batchTranslate', 1, async (job) => {
    const { resourceIds, shopId, language } = job.data;
    const results = [];
    const total = resourceIds.length;
    
    for (let i = 0; i < resourceIds.length; i++) {
      const resourceId = resourceIds[i];
      
      try {
        // 创建子任务
        const translateJob = await translationQueue.add('translateResource', {
          resourceId,
          shopId,
          language
        }, {
          attempts: 3,
          backoff: 'exponential',
          delay: i * 1000 // 错开执行时间
        });
        
        // 等待子任务完成
        const result = await translateJob.finished();
        results.push(result);
        
      } catch (error) {
        results.push({
          resourceId,
          success: false,
          error: error.message
        });
      }
      
      // 更新进度
      job.progress(Math.round(((i + 1) / total) * 100));
    }
    
    return {
      total,
      success: results.filter(r => r.success).length,
      failure: results.filter(r => !r.success).length,
      results
    };
  });
  
  // 错误处理
  translationQueue.on('error', async (error) => {
    console.error('队列错误:', error);
    
    // 记录到数据库
    await collectError({
      errorType: ERROR_TYPES.SYSTEM,
      errorCategory: 'QUEUE_SYSTEM',
      errorCode: 'QUEUE_ERROR',
      message: `Queue system error: ${error.message}`,
      stack: error.stack,
      operation: 'queue.system',
      severity: 4,
      retryable: false,
      context: {
        queueMode: useMemoryQueue ? 'memory' : 'redis'
      }
    });
  });
  
  translationQueue.on('failed', async (job, err) => {
    console.error(`任务失败 ${job.id}:`, err);
    
    // 记录到数据库
    await collectError({
      errorType: ERROR_TYPES.TRANSLATION,
      errorCategory: 'QUEUE_FAILED',
      errorCode: err.code || 'JOB_FAILED',
      message: `Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`,
      stack: err.stack,
      operation: 'queue.job',
      resourceId: job.data.resourceId,
      severity: 3,
      retryable: job.attemptsMade < (job.opts.attempts || 3),
      context: {
        jobId: job.id,
        jobName: job.name,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts || 3,
        data: job.data,
        failedReason: job.failedReason
      }
    });
  });
  
  translationQueue.on('completed', (job, result) => {
    console.log(`任务完成 ${job.id}:`, result);
  });
}

/**
 * 添加翻译任务到队列
 * @param {string} resourceId - 资源ID
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {Object} options - 任务选项
 * @returns {Promise<Object>} 任务信息
 */
export async function addTranslationJob(resourceId, shopId, language, options = {}) {
  if (!translationQueue) {
    throw new Error('任务队列未配置，无法创建异步任务');
  }
  
  const job = await translationQueue.add('translateResource', {
    resourceId,
    shopId,
    language
  }, {
    attempts: 3,
    backoff: 'exponential',
    removeOnComplete: 10,
    removeOnFail: 5,
    ...options
  });
  
  return {
    jobId: job.id,
    resourceId,
    status: 'queued'
  };
}

/**
 * 添加批量翻译任务到队列
 * @param {Array} resourceIds - 资源ID列表
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @returns {Promise<Object>} 任务信息
 */
export async function addBatchTranslationJob(resourceIds, shopId, language) {
  if (!translationQueue) {
    throw new Error('任务队列未配置，无法创建批量任务');
  }
  
  const job = await translationQueue.add('batchTranslate', {
    resourceIds,
    shopId,
    language
  }, {
    attempts: 1,
    removeOnComplete: 5,
    removeOnFail: 5
  });
  
  return {
    jobId: job.id,
    resourceCount: resourceIds.length,
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
  
  return {
    id: job.id,
    progress: job.progress(),
    state: await job.getState(),
    createdAt: new Date(job.timestamp),
    processedAt: job.processedOn ? new Date(job.processedOn) : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
    failedReason: job.failedReason,
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
  }
  
  return {
    cleaned,
    type
  };
}

// 导出队列实例
export { redis };
