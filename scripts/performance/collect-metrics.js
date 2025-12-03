#!/usr/bin/env node

import schedule from 'node-schedule';
import { execSync } from 'node:child_process';

schedule.scheduleJob('0 2 * * *', () => {
  console.log('🌙 开始夜间性能数据收集...');
  execSync('./scripts/performance/audit.sh', { stdio: 'inherit' });
  console.log('📈 更新趋势图...');
  try {
    execSync('node scripts/performance/update-charts.js', { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ update-charts 脚本未实现，跳过');
  }
  console.log('📮 发送每日报告...');
  try {
    execSync('node scripts/performance/send-daily-report.js', { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ send-daily-report 脚本未实现，跳过');
  }
  console.log('✅ 夜间任务完成');
});
