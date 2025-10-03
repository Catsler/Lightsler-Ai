import 'dotenv/config';
import Bull from 'bull';
import { createShopRedisConfig } from '../app/utils/redis-parser.server.js';

const shopId = process.argv[2] || 'shop1';
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('[promote-delayed-jobs] 缺少 REDIS_URL 环境变量，无法连接 Redis。');
  process.exit(1);
}

console.log(`[promote-delayed-jobs] 正在处理 ${shopId} 的延迟任务...`);

const redisConfig = createShopRedisConfig(redisUrl, shopId, {
  enableOfflineQueue: true,
});

if (!redisConfig) {
  console.error(`[promote-delayed-jobs] 无法解析 ${shopId} 的 Redis 配置。`);
  process.exit(1);
}

const queue = new Bull(`translation_${shopId}`, { redis: redisConfig });

try {
  const delayed = await queue.getDelayed();
  console.log(`[promote-delayed-jobs] 找到 ${delayed.length} 个延迟任务`);

  if (delayed.length === 0) {
    console.log(`[promote-delayed-jobs] 没有需要处理的延迟任务。`);
  } else {
    for (const job of delayed) {
      await job.promote();
    }
    console.log(`[promote-delayed-jobs] ✅ 已将 ${delayed.length} 个任务推送到 waiting 队列`);
  }
} catch (error) {
  console.error(`[promote-delayed-jobs] 处理失败:`, error.message);
  process.exitCode = 1;
} finally {
  await queue.close();
}
