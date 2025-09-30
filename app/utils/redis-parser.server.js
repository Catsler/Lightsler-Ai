/**
 * Redis URL解析工具
 * 专为Railway、Upstash等云Redis服务设计
 * 支持redis://和rediss://协议
 */

import { logger } from './logger.server.js';

/**
 * 解析Redis连接URL
 * @param {string} url - Redis连接字符串
 * @returns {Object|null} 解析后的连接配置
 */
export function parseRedisUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);

    // 验证协议
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      throw new Error(`不支持的协议: ${parsed.protocol}`);
    }

    const config = {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || null,
      username: parsed.username || 'default',
      db: 0 // 默认数据库
    };

    // 解析数据库索引
    if (parsed.pathname && parsed.pathname.length > 1) {
      const dbIndex = parseInt(parsed.pathname.slice(1));
      if (!isNaN(dbIndex) && dbIndex >= 0) {
        config.db = dbIndex;
      }
    }

    // 解析查询参数
    const searchParams = new URLSearchParams(parsed.search);

    // 支持db查询参数
    const dbParam = searchParams.get('db');
    if (dbParam) {
      const dbIndex = parseInt(dbParam);
      if (!isNaN(dbIndex) && dbIndex >= 0) {
        config.db = dbIndex;
      }
    }

    return config;
  } catch (error) {
    logger.error('解析Redis URL失败', { error: error.message });
    return null;
  }
}

/**
 * 为IORedis创建配置对象
 * @param {string} url - Redis连接字符串
 * @param {Object} options - 额外的连接选项
 * @returns {Object|null} IORedis配置对象
 */
export function createRedisConfig(url, options = {}) {
  const parsed = parseRedisUrl(url);
  if (!parsed) {
    return null;
  }

  const config = {
    host: parsed.host,
    port: parsed.port,
    db: parsed.db,

    // 认证信息
    ...(parsed.password && { password: parsed.password }),
    ...(parsed.username !== 'default' && { username: parsed.username }),

    // TLS配置
    ...(parsed.protocol === 'rediss' && {
      tls: {
        rejectUnauthorized: false, // Railway等服务通常需要这个选项
        ...options.tls
      }
    }),

    // 连接选项
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    connectTimeout: 10000,
    commandTimeout: 5000,

    // 重连策略
    retryDelayOnFailover: 1000,
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'EPIPE', 'ENOTFOUND'];
      return targetErrors.some(e => err.message.includes(e));
    },

    // 覆盖默认选项
    ...options
  };

  return config;
}

/**
 * 创建店铺隔离的Redis配置
 * @param {string} url - Redis连接字符串
 * @param {string} shopId - 店铺ID
 * @param {Object} options - 额外选项
 * @returns {Object|null} 带店铺隔离的Redis配置
 */
export function createShopRedisConfig(url, shopId, options = {}) {
  const baseConfig = createRedisConfig(url, options);
  if (!baseConfig) {
    return null;
  }

  // 为不同店铺使用不同的数据库索引
  // shop1 -> db 0, shop2 -> db 1, 以此类推
  const shopIndex = getShopIndex(shopId);

  return {
    ...baseConfig,
    db: shopIndex,
    // 添加店铺标识到选项中
    shopId,
    keyPrefix: `shop:${shopId}:`
  };
}

/**
 * 根据店铺ID获取数据库索引
 * @param {string} shopId - 店铺ID
 * @returns {number} 数据库索引 (0-15)
 */
function getShopIndex(shopId) {
  if (!shopId) return 0;

  // 简单的哈希算法，将shopId映射到0-15
  let hash = 0;
  for (let i = 0; i < shopId.length; i++) {
    const char = shopId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }

  return Math.abs(hash) % 16; // Redis默认支持16个数据库
}

/**
 * 验证Redis连接
 * @param {string} url - Redis连接字符串
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function validateRedisConnection(url) {
  const config = createRedisConfig(url);
  if (!config) {
    return false;
  }

  try {
    const Redis = (await import('ioredis')).default;
    const redis = new Redis(config);

    await redis.ping();
    await redis.quit();

    return true;
  } catch (error) {
    logger.error('Redis连接验证失败', { error: error.message });
    return false;
  }
}

/**
 * 生成Redis连接字符串
 * @param {Object} config - Redis配置
 * @returns {string} Redis连接字符串
 */
export function buildRedisUrl(config) {
  const {
    protocol = 'redis',
    host,
    port = 6379,
    username,
    password,
    db = 0
  } = config;

  let url = `${protocol}://`;

  // 添加认证信息
  if (username && password) {
    url += `${username}:${password}@`;
  } else if (password) {
    url += `:${password}@`;
  }

  // 添加主机和端口
  url += `${host}:${port}`;

  // 添加数据库索引
  if (db && db > 0) {
    url += `/${db}`;
  }

  return url;
}