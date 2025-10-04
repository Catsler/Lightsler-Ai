#!/usr/bin/env node

/**
 * 队列状态监控脚本
 * 监控onewind队列的处理进度
 */

const Bull = require('bull');

const REDIS_CONFIG = {
  host: 'nozomi.proxy.rlwy.net',
  port: 39953,
  password: 'gedTtMvRpnZNccvqCpgjBdDycKIiLOFR',
  db: 2,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

const queue = new Bull('translation_onewind', {
  redis: REDIS_CONFIG,
  prefix: 'bull:onewind'
});

async function checkStatus() {
  try {
    await queue.isReady();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 队列状态监控 - onewind');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 获取队列统计
    const counts = await queue.getJobCounts();
    console.log('队列统计:');
    console.log(`  等待中 (waiting):   ${counts.waiting}`);
    console.log(`  处理中 (active):    ${counts.active}`);
    console.log(`  已完成 (completed): ${counts.completed}`);
    console.log(`  失败   (failed):    ${counts.failed}`);
    console.log(`  延迟   (delayed):   ${counts.delayed}`);
    console.log(`  暂停   (paused):    ${counts.paused}`);

    // 计算总任务数和进度
    const total = counts.waiting + counts.active + counts.completed + counts.failed;
    const processed = counts.completed + counts.failed;
    const progress = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;

    console.log(`\n进度: ${processed}/${total} (${progress}%)`);

    // 获取active任务详情
    if (counts.active > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚡ 正在处理的任务:');

      const activeJobs = await queue.getActive(0, Math.min(counts.active, 5));
      for (const job of activeJobs) {
        const runningTime = job.processedOn
          ? Math.floor((Date.now() - job.processedOn) / 1000)
          : 0;

        console.log(`\n  任务 #${job.id}:`);
        console.log(`    语言: ${job.data?.language}`);
        console.log(`    运行时长: ${runningTime}秒`);
        console.log(`    进度: ${job.progress() || 0}%`);

        if (runningTime > 300) {
          console.log('    ⚠️  可能卡住 (超过5分钟)');
        }
      }
    }

    // 预估完成时间
    if (counts.waiting > 0 && counts.completed > 10) {
      const recentJobs = await queue.getCompleted(0, 10);
      if (recentJobs.length >= 2) {
        const timeSpan = recentJobs[0].finishedOn - recentJobs[recentJobs.length - 1].finishedOn;
        const avgTime = timeSpan / recentJobs.length / 1000; // 秒
        const estimatedMinutes = Math.ceil((counts.waiting * avgTime) / 60);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`⏱️  预估完成时间: ${estimatedMinutes} 分钟`);
      }
    }

    // 检查失败任务
    if (counts.failed > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ 失败任务:');

      const failedJobs = await queue.getFailed(0, 3);
      for (const job of failedJobs) {
        console.log(`\n  任务 #${job.id}:`);
        console.log(`    错误: ${job.failedReason || 'Unknown'}`);
        console.log(`    尝试次数: ${job.attemptsMade}/${job.opts.attempts}`);
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
