/**
 * 轻量级内存缓存服务
 * 用于加速翻译查询，减少数据库访问
 */

import { logger } from '../utils/logger.server.js';

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
    
    // 定期清理过期缓存
    this.startCleanupTimer();
  }

  /**
   * 获取缓存
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    // 检查是否过期
    if (item.expireAt && Date.now() > item.expireAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return item.value;
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttlSeconds - 过期时间（秒）
   */
  set(key, value, ttlSeconds = 3600) {
    const expireAt = ttlSeconds > 0 
      ? Date.now() + (ttlSeconds * 1000)
      : null;
    
    this.cache.set(key, {
      value,
      expireAt,
      createdAt: Date.now()
    });
    
    this.stats.sets++;
    
    // 防止内存溢出，限制缓存大小
    if (this.cache.size > 10000) {
      this.evictOldest(1000);
    }
  }

  /**
   * 删除缓存
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`,
      memoryUsage: this.getMemoryUsage()
    };
  }

  /**
   * 获取所有缓存键列表
   * @returns {Array<string>} 缓存键数组
   */
  getKeys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 估算内存使用
   */
  getMemoryUsage() {
    // 粗略估算，每个条目约1KB
    const sizeInKB = this.cache.size;
    const sizeInMB = (sizeInKB / 1024).toFixed(2);
    return `~${sizeInMB} MB`;
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expireAt && now > item.expireAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`[MemoryCache] Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * 启动定期清理
   */
  startCleanupTimer() {
    // 每5分钟清理一次过期缓存
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * 淘汰最旧的缓存
   */
  evictOldest(count = 100) {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, count);
    
    for (const [key] of entries) {
      this.cache.delete(key);
    }
    
    logger.debug(`[MemoryCache] Evicted ${entries.length} old cache entries`);
  }

  /**
   * 生成翻译缓存键
   */
  static getTranslationKey(resourceId, language, contentHash) {
    return `trans:${resourceId}:${language}:${contentHash}`;
  }

  /**
   * 生成资源缓存键
   */
  static getResourceKey(resourceType, resourceId) {
    return `resource:${resourceType}:${resourceId}`;
  }
}

// 单例模式
let instance = null;

export function getMemoryCache() {
  if (!instance) {
    instance = new MemoryCache();
  }
  return instance;
}

// 翻译缓存专用方法
export async function getCachedTranslation(resourceId, language, contentHash) {
  const cache = getMemoryCache();
  const key = MemoryCache.getTranslationKey(resourceId, language, contentHash);
  return cache.get(key);
}

export async function setCachedTranslation(resourceId, language, contentHash, translation) {
  const cache = getMemoryCache();
  const key = MemoryCache.getTranslationKey(resourceId, language, contentHash);
  // 翻译结果缓存7天
  cache.set(key, translation, 7 * 24 * 60 * 60);
}

// 资源缓存专用方法
export async function getCachedResource(resourceType, resourceId) {
  const cache = getMemoryCache();
  const key = MemoryCache.getResourceKey(resourceType, resourceId);
  return cache.get(key);
}

export async function setCachedResource(resourceType, resourceId, resource) {
  const cache = getMemoryCache();
  const key = MemoryCache.getResourceKey(resourceType, resourceId);
  // 资源缓存1小时
  cache.set(key, resource, 60 * 60);
}

// 清空特定类型的缓存
export function clearTranslationCache(resourceId = null) {
  const cache = getMemoryCache();
  
  if (resourceId) {
    // 清空特定资源的所有翻译缓存
    for (const key of cache.cache.keys()) {
      if (key.startsWith(`trans:${resourceId}:`)) {
        cache.delete(key);
      }
    }
  } else {
    // 清空所有翻译缓存
    for (const key of cache.cache.keys()) {
      if (key.startsWith('trans:')) {
        cache.delete(key);
      }
    }
  }
}

export default getMemoryCache;
