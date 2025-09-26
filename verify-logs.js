#!/usr/bin/env node

import { fetchPersistentTranslationLogs } from './app/services/log-persistence.server.js';
import { prisma } from './app/db.server.js';

console.log('=== 验证日志系统 ===\n');

try {
  // 使用API读取日志
  console.log('1. 使用API读取持久化日志...');
  const logs = await fetchPersistentTranslationLogs({ limit: 10 });
  console.log(`API返回日志数量: ${logs?.length || 0}`);

  if (logs && logs.length > 0) {
    console.log('最新的日志记录:');
    logs.slice(0, 3).forEach((log, i) => {
      console.log(`  ${i+1}. [${log.level}] ${log.message} - ${log.category}`);
    });
  }

  // 直接查询数据库
  console.log('\n2. 直接查询数据库...');
  const dbCount = await prisma.translationLog.count();
  console.log(`数据库记录总数: ${dbCount}`);

  if (dbCount > 0) {
    const dbLogs = await prisma.translationLog.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      select: { level: true, message: true, category: true, shopId: true }
    });
    console.log('数据库中的记录:');
    dbLogs.forEach((log, i) => {
      console.log(`  ${i+1}. [${log.level}] ${log.message} - ${log.category} (shop: ${log.shopId})`);
    });
  }

  // 检查ErrorLog
  console.log('\n3. 检查ErrorLog...');
  const errorCount = await prisma.errorLog.count();
  console.log(`ErrorLog记录总数: ${errorCount}`);

  if (errorCount > 0) {
    const errors = await prisma.errorLog.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: { errorType: true, message: true, shopId: true }
    });
    console.log('ErrorLog中的记录:');
    errors.forEach((error, i) => {
      console.log(`  ${i+1}. [${error.errorType}] ${error.message} (shop: ${error.shopId})`);
    });
  }

  await prisma.$disconnect();
} catch (error) {
  console.error('验证过程出错:', error);
  process.exit(1);
}