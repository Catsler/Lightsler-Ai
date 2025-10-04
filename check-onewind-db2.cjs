#!/usr/bin/env node
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

async function check() {
  try {
    await queue.isReady();
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ OneWind队列状态 (DB 2)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const counts = await queue.getJobCounts();
    console.log('队列统计:');
    console.log(`  等待中: ${counts.waiting}`);
    console.log(`  处理中: ${counts.active}`);
    console.log(`  已完成: ${counts.completed}`);
    console.log(`  失败:   ${counts.failed}`);
    console.log(`  延迟:   ${counts.delayed}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await queue.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ 错误:', error.message);
    await queue.close();
    process.exit(1);
  }
}

check();
