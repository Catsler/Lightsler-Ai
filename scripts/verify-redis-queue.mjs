#!/usr/bin/env node
/**
 * Redis队列验证脚本
 * 使用SCAN命令安全检查队列状态，避免阻塞Redis
 */

import Redis from 'ioredis';
import { parseRedisUrl } from '../app/utils/redis-parser.server.js';
import { getEnvWithDevOverride } from '../app/utils/env.server.js';

const REDIS_URL = getEnvWithDevOverride('REDIS_URL');
const SHOP_ID = getEnvWithDevOverride('SHOP_ID', 'default');

if (!REDIS_URL) {
  console.error('❌ 请设置 REDIS_URL 环境变量');
  process.exit(1);
}

async function scanKeys(redis, pattern, count = 100) {
  const keys = [];
  let cursor = '0';

  do {
    const [nextCursor, foundKeys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      count
    );
    cursor = nextCursor;
    keys.push(...foundKeys);
  } while (cursor !== '0');

  return keys;
}

async function getKeyInfo(redis, key) {
  const type = await redis.type(key);
  let value;

  switch (type) {
    case 'string':
      value = await redis.get(key);
      break;
    case 'list':
      value = await redis.llen(key);
      break;
    case 'set':
      value = await redis.scard(key);
      break;
    case 'zset':
      value = await redis.zcard(key);
      break;
    case 'hash':
      value = await redis.hlen(key);
      break;
    default:
      value = 'unknown';
  }

  return { key, type, value };
}

async function main() {
  const config = parseRedisUrl(REDIS_URL);
  if (!config) {
    console.error('❌ Redis URL 解析失败');
    process.exit(1);
  }

  console.log(`\n🔍 验证 Redis 队列状态`);
  console.log(`📍 店铺: ${SHOP_ID}`);
  console.log(`🔗 连接: ${config.host}:${config.port} (DB ${config.db})`);

  const redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    lazyConnect: true
  });

  try {
    await redis.connect();
    console.log('✅ Redis 连接成功\n');

    // 检查Bull队列键
    const queuePatterns = [
      `bull:${SHOP_ID}:*`,           // 新格式
      `{${SHOP_ID}}:*`,              // 旧格式
      `translation_${SHOP_ID}:*`     // 备用格式
    ];

    let totalKeys = 0;
    const keysByType = {};

    for (const pattern of queuePatterns) {
      console.log(`🔎 扫描模式: ${pattern}`);
      const keys = await scanKeys(redis, pattern, 1000);

      if (keys.length === 0) {
        console.log('  ℹ️  未找到匹配的键\n');
        continue;
      }

      totalKeys += keys.length;
      console.log(`  📦 找到 ${keys.length} 个键\n`);

      // 分类统计
      for (const key of keys) {
        const info = await getKeyInfo(redis, key);
        const category = key.split(':').slice(-1)[0] || 'other';

        if (!keysByType[category]) {
          keysByType[category] = [];
        }
        keysByType[category].push(info);
      }
    }

    // 输出统计
    if (totalKeys === 0) {
      console.log('ℹ️  Redis中没有队列数据');
    } else {
      console.log(`\n📊 队列统计 (总计 ${totalKeys} 个键):\n`);

      for (const [category, items] of Object.entries(keysByType)) {
        console.log(`  📁 ${category} (${items.length}):`);
        items.slice(0, 5).forEach(({ key, type, value }) => {
          const displayValue = typeof value === 'number' 
            ? `${value} items` 
            : value?.toString().substring(0, 50) || 'N/A';
          console.log(`    - ${key} [${type}]: ${displayValue}`);
        });
        if (items.length > 5) {
          console.log(`    ... 还有 ${items.length - 5} 个键`);
        }
        console.log();
      }
    }

    // 检查队列健康状态
    console.log('🏥 队列健康检查:\n');

    const queueName = `bull:${SHOP_ID}:translation_${SHOP_ID}`;
    const checks = [
      { key: `${queueName}:wait`, label: '等待任务', type: 'list' },
      { key: `${queueName}:active`, label: '活跃任务', type: 'list' },
      { key: `${queueName}:completed`, label: '完成任务', type: 'set' },
      { key: `${queueName}:failed`, label: '失败任务', type: 'set' },
      { key: `${queueName}:delayed`, label: '延迟任务', type: 'zset' }
    ];

    for (const { key, label, type } of checks) {
      let count = 0;
      switch (type) {
        case 'list':
          count = await redis.llen(key);
          break;
        case 'set':
          count = await redis.scard(key);
          break;
        case 'zset':
          count = await redis.zcard(key);
          break;
      }
      const status = count > 0 ? `${count} 个` : '无';
      console.log(`  ${label}: ${status}`);
    }

  } catch (error) {
    console.error('\n❌ 验证失败:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
    console.log('\n✅ 验证完成');
  }
}

main();
