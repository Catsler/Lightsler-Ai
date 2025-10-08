#!/usr/bin/env node
/**
 * PRODUCT_OPTION GID 数据清理脚本
 *
 * ⚠️ 使用前必读：
 * 1. 务必先运行 --dry-run 检查影响范围
 * 2. 生产环境务必指定 --shop=xxx 逐个修复
 * 3. 操作不可逆，建议先备份数据库
 *
 * 示例：
 *   node scripts/fix-option-gids.mjs --dry-run
 *   node scripts/fix-option-gids.mjs --shop=shop1
 *   node scripts/fix-option-gids.mjs --dry-run --shop=shop1
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../app/utils/logger.server.js';

const prisma = new PrismaClient();

async function fixOptionGids(options = {}) {
  const { dryRun = false, shopId = null } = options;

  logger.info('🔍 开始检查PRODUCT_OPTION GID...', { dryRun, shopId });

  // 构建查询条件
  const whereClause = {
    resourceType: 'PRODUCT_OPTION',
    gid: { contains: '-temp' }
  };
  if (shopId) {
    whereClause.shopId = shopId;
  }

  // 统计受影响的资源
  const brokenResources = await prisma.resource.findMany({
    where: whereClause,
    select: {
      id: true,
      gid: true,
      title: true,
      shopId: true,
      resourceId: true
    }
  });

  logger.info(`发现 ${brokenResources.length} 个错误的PRODUCT_OPTION GID`);

  if (brokenResources.length === 0) {
    logger.info('✅ 没有需要修复的数据');
    return;
  }

  // 显示样本数据
  logger.info('样本数据:', brokenResources.slice(0, 5));

  if (dryRun) {
    logger.info('🔵 Dry-run模式，不执行实际修改');
    logger.info('受影响的店铺统计:');
    const shopStats = brokenResources.reduce((acc, r) => {
      acc[r.shopId] = (acc[r.shopId] || 0) + 1;
      return acc;
    }, {});
    console.table(shopStats);
    return;
  }

  // 确认提示
  console.log('\n⚠️  即将执行以下操作：');
  console.log(`   1. 清空 ${brokenResources.length} 个资源的gid字段`);
  console.log(`   2. 删除关联的pending翻译`);
  console.log(`   3. 这些操作不可逆！\n`);

  // 等待3秒让用户有时间中止
  console.log('3秒后开始执行，按 Ctrl+C 可取消...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 执行清理
  logger.info('🔧 开始清理数据...');

  // 1. 清空错误的GID
  const updateResult = await prisma.resource.updateMany({
    where: whereClause,
    data: { gid: null }
  });

  logger.info(`✅ 已清空 ${updateResult.count} 个资源的GID`);

  // 2. 删除关联的pending翻译
  const deletedTranslations = await prisma.translation.deleteMany({
    where: {
      resourceId: { in: brokenResources.map(r => r.id) },
      syncStatus: 'pending'
    }
  });

  logger.info(`✅ 已删除 ${deletedTranslations.count} 个无效翻译记录`);

  // 3. 统计结果
  console.log('\n📊 清理完成摘要：');
  console.table({
    '更新的资源': updateResult.count,
    '删除的翻译': deletedTranslations.count
  });

  logger.info('✅ 数据清理完成！');
  console.log('\n📝 下一步操作：');
  console.log('   1. 在UI中重新扫描产品资源');
  console.log('   2. 翻译产品（含options和metafields）');
  console.log('   3. 验证gid字段格式正确');
  console.log('   4. 测试批量发布功能\n');
}

// 解析命令行参数
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  shopId: args.find(arg => arg.startsWith('--shop='))?.split('=')[1]
};

// 执行清理
fixOptionGids(options)
  .catch((error) => {
    logger.error('脚本执行失败', {
      error: error.message,
      stack: error.stack
    });
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
