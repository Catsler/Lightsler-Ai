#!/usr/bin/env node
/**
 * 查看翻译状态分布详情
 *
 * 用途: 深入分析翻译状态分布和失败原因
 * 运行: node scripts/diagnostics/check-sync-status-distribution.mjs --shop=shop2
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
  console.error('用法: node check-sync-status-distribution.mjs --shop=shop2');
  process.exit(1);
}

async function checkSyncStatusDistribution() {
  try {
    // 1. 查询状态分布
    const translations = await prisma.translation.findMany({
      where: { shopId },
      include: {
        resource: {
          select: {
            resourceType: true,
            title: true,
            gid: true
          }
        }
      }
    });

    // 2. 统计状态分布
    const statusDistribution = {
      synced: 0,
      failed: 0,
      pending: 0,
      syncing: 0
    };

    translations.forEach(t => {
      if (statusDistribution[t.syncStatus] !== undefined) {
        statusDistribution[t.syncStatus]++;
      }
    });

    // 3. 按资源类型统计
    const byResourceType = {};
    translations.forEach(t => {
      const type = t.resource?.resourceType || 'UNKNOWN';
      if (!byResourceType[type]) {
        byResourceType[type] = { synced: 0, failed: 0, pending: 0, syncing: 0 };
      }
      if (byResourceType[type][t.syncStatus] !== undefined) {
        byResourceType[type][t.syncStatus]++;
      }
    });

    // 4. 查询最近失败记录（最多10条）
    const recentFailures = await prisma.translation.findMany({
      where: {
        shopId,
        syncStatus: 'failed'
      },
      include: {
        resource: {
          select: {
            id: true,
            resourceType: true,
            title: true,
            gid: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 10
    });

    const recentFailuresFormatted = recentFailures.map(t => ({
      translationId: t.id,
      resourceId: t.resource?.id,
      resourceType: t.resource?.resourceType,
      resourceTitle: t.resource?.title,
      language: t.language,
      gid: t.resource?.gid,
      updatedAt: t.updatedAt
    }));

    // 5. 分析结果
    let analysis = '';
    const total = translations.length;
    if (total === 0) {
      analysis = '数据库中没有翻译记录';
    } else if (statusDistribution.synced === total) {
      analysis = '所有翻译已同步，系统正常';
    } else if (statusDistribution.failed > 0) {
      const failRate = ((statusDistribution.failed / total) * 100).toFixed(1);
      analysis = `${statusDistribution.failed}条翻译失败 (${failRate}%)，需要查看失败原因`;
    } else if (statusDistribution.pending > 0) {
      analysis = `${statusDistribution.pending}条待发布，可以执行批量发布`;
    } else {
      analysis = '状态分布正常';
    }

    // 输出JSON结果
    const result = {
      shop: shopId,
      timestamp: new Date().toISOString(),
      totalTranslations: total,
      statusDistribution,
      byResourceType,
      recentFailures: recentFailuresFormatted,
      analysis,
      recommendation: statusDistribution.failed > 0
        ? '查看 recentFailures 字段定位失败原因，可能需要运行 check-gid-format-issues.mjs'
        : (statusDistribution.pending > 0
          ? '执行批量发布: POST /api/batch-publish'
          : '系统正常，若需新翻译请扫描资源')
    };

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('执行失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkSyncStatusDistribution();
