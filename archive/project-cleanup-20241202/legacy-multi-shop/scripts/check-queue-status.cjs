#!/usr/bin/env node

/**
 * 队列状态监控脚本
 * 监控onewind队列的处理进度
 */
#!/usr/bin/env node

const Bull = require('bull');

const REDIS_HOST = 'nozomi.proxy.rlwy.net';
const REDIS_PORT = 39953;
const REDIS_PASSWORD = 'gedTtMvRpnZNccvqCpgjBdDycKIiLOFR';

const SHOP_VARIANTS = {
  shop1: ['shop1', 'fynony', 'fynony.myshopify.com'],
  shop2: ['shop2', 'onewind', 'onewindoutdoors.myshopify.com']
};

const SHOP_CONFIG = {
  shop1: { db: 11, prefix: 'bull:shop1', queueName: 'translation_shop1', label: 'Fynony' },
  shop2: { db: 12, prefix: 'bull:shop2', queueName: 'translation_shop2', label: 'OneWind' }
};

function resolveShopKey(raw) {
  const normalized = (raw || '').toLowerCase();
  for (const [key, aliases] of Object.entries(SHOP_VARIANTS)) {
    if (aliases.includes(normalized)) {
      return key;
    }
  }
  // 默认监听 shop2
  return 'shop2';
}

const inputShopId = process.argv[2] || process.env.SHOP_ID || 'shop2';
const shopKey = resolveShopKey(inputShopId);
const shopConfig = SHOP_CONFIG[shopKey];

const queue = new Bull(shopConfig.queueName, {
  redis: {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    db: shopConfig.db,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  },
  prefix: shopConfig.prefix
});

async function checkStatus() {
  try {
    await queue.isReady();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 队列状态监控 - ${shopConfig.label}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const counts = await queue.getJobCounts();
    console.log('队列统计:');
    console.log(`  等待中 (waiting):   ${counts.waiting}`);
    console.log(`  处理中 (active):    ${counts.active}`);
    console.log(`  已完成 (completed): ${counts.completed}`);
    console.log(`  失败   (failed):    ${counts.failed}`);
    console.log(`  延迟   (delayed):   ${counts.delayed}`);
    console.log(`  暂停   (paused):    ${counts.paused}`);

    const total = counts.waiting + counts.active + counts.completed + counts.failed;
    const processed = counts.completed + counts.failed;
    const progress = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;

    console.log(`\n进度: ${processed}/${total} (${progress}%)`);

    if (counts.active > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚡ 正在处理的任务:');

      const activeJobs = await queue.getActive(0, Math.min(counts.active, 5));
      for (const job of activeJobs) {
        const runningTime = job.processedOn
          ? Math.floor((Date.now() - job.processedOn) / 1000)
          : 0;

        console.log(`\n  任务 #${job.id}:`);
        console.log(`    名称: ${job.name}`);
        console.log(`    语言: ${job.data?.language}`);
        console.log(`    进度: ${job.progress() || 0}%`);
        console.log(`    运行时长: ${runningTime}秒`);

        if (runningTime > 300) {
          console.log('    ⚠️  可能卡住 (超过5分钟)');
        }
      }
    }

    if (counts.waiting > 0) {
      const waitingJobs = await queue.getWaiting(0, Math.min(counts.waiting, 5));
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⏳ 等待中的任务:');
      waitingJobs.forEach(job => {
        console.log(`\n  任务 #${job.id}:`);
        console.log(`    名称: ${job.name}`);
        console.log(`    语言: ${job.data?.language}`);
        console.log(`    尝试次数: ${job.attemptsMade}/${job.opts.attempts}`);
      });
    }

    if (counts.failed > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ 失败任务:');

      const failedJobs = await queue.getFailed(0, Math.min(counts.failed, 5));
      for (const job of failedJobs) {
        console.log(`\n  任务 #${job.id}:`);
        console.log(`    名称: ${job.name}`);
        console.log(`    语言: ${job.data?.language}`);
        console.log(`    尝试次数: ${job.attemptsMade}/${job.opts.attempts}`);
        console.log(`    错误: ${job.failedReason || 'Unknown'}`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await queue.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ 错误:', error.message);
    await queue.close();
    process.exit(1);
  }
}

checkStatus();
