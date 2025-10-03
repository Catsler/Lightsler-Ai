import 'dotenv/config';
import Redis from 'ioredis';
import { createShopRedisConfig } from '../app/utils/redis-parser.server.js';

const args = process.argv.slice(2).filter(Boolean);
const targetShops = args.length > 0 ? args : ['shop1', 'shop2'];

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('[clear-delayed-translation-queue] 缺少 REDIS_URL 环境变量，无法连接 Redis。');
  process.exit(1);
}

async function clearQueueForShop(shopId) {
  const prefix = `shop:${shopId}::translation_${shopId}`;
  const redisConfig = createShopRedisConfig(redisUrl, shopId, {
    enableOfflineQueue: true,
  });

  if (!redisConfig) {
    console.warn(`[clear-delayed-translation-queue] 无法解析 ${shopId} 的 Redis 配置，跳过。`);
    return;
  }

  const redis = new Redis(redisConfig);

  try {
    const keys = await redis.keys(`${prefix}:*`);

    if (keys.length === 0) {
      console.log(`[clear-delayed-translation-queue] ${shopId} 没有需要清理的队列键。`);
      return;
    }

    await redis.del(...keys);
    console.log(`[clear-delayed-translation-queue] 已清理 ${shopId} 队列键数量: ${keys.length}`);
  } catch (error) {
    console.error(`[clear-delayed-translation-queue] 清理 ${shopId} 队列失败:`, error.message);
    process.exitCode = 1;
  } finally {
    await redis.quit();
  }
}

for (const shopId of targetShops) {
  await clearQueueForShop(shopId);
}
