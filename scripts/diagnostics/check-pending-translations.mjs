#!/usr/bin/env node
/**
 * 检查待发布翻译数量和状态
 *
 * 用途: 诊断OneWind发布按钮灰色问题
 * 运行: node scripts/diagnostics/check-pending-translations.mjs --shop=shop2
 * 输出: JSON格式
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 解析命令行参数
const args = process.argv.slice(2);
const shopArg = args.find(arg => arg.startsWith('--shop='));
const shopId = shopArg ? shopArg.split('=')[1] : null;

if (!shopId) {
  console.error('错误: 缺少 --shop 参数');
  console.error('用法: node check-pending-translations.mjs --shop=shop2');
  process.exit(1);
}

async function checkPendingTranslations() {
  try {
    // 查询翻译状态统计
    const [totalCount, pendingCount, syncedCount, syncingCount, failedCount] = await Promise.all([
      prisma.translation.count({ where: { shopId } }),
      prisma.translation.count({ where: { shopId, syncStatus: 'pending' } }),
      prisma.translation.count({ where: { shopId, syncStatus: 'synced' } }),
      prisma.translation.count({ where: { shopId, syncStatus: 'syncing' } }),
      prisma.translation.count({ where: { shopId, syncStatus: 'failed' } })
    ]);

    // 分析结果
    let analysis = '';
    if (pendingCount === 0) {
      if (totalCount === 0) {
        analysis = '数据库中没有任何翻译记录，需要先扫描资源';
      } else if (syncedCount === totalCount) {
        analysis = '所有翻译已同步完成，需要扫描新资源或修改现有内容';
      } else if (failedCount > 0) {
        analysis = `有${failedCount}条翻译失败，无待发布翻译。建议查看失败原因`;
      } else {
        analysis = 'syncStatus分布异常，建议检查数据库完整性';
      }
    } else {
      analysis = `有${pendingCount}条待发布翻译，发布按钮应该可用`;
    }

    // 输出JSON结果
    const result = {
      shop: shopId,
      timestamp: new Date().toISOString(),
      totalTranslations: totalCount,
      pendingCount,
      syncedCount,
      syncingCount,
      failedCount,
      analysis,
      recommendation: pendingCount === 0
        ? (failedCount > 0
          ? '运行 check-sync-status-distribution.mjs 查看失败详情'
          : '运行资源扫描: POST /api/scan-resources')
        : '待发布翻译充足，检查前端按钮逻辑'
    };

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('执行失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkPendingTranslations();
