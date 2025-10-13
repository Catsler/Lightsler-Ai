#!/usr/bin/env node
/**
 * 检查资源GID格式问题
 *
 * 用途: 诊断Fynony发布显示0%问题（GID解析失败）
 * 运行: node scripts/diagnostics/check-gid-format-issues.mjs --shop=shop1
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
  console.error('用法: node check-gid-format-issues.mjs --shop=shop1');
  process.exit(1);
}

/**
 * 检查GID是否有效
 */
function isValidShopifyGid(gid) {
  if (!gid || typeof gid !== 'string') return false;

  // 标准Shopify GID格式: gid://shopify/ResourceType/123
  const gidPattern = /^gid:\/\/shopify\/[A-Za-z]+\/\d+$/;

  return gidPattern.test(gid);
}

/**
 * 识别GID问题类型
 */
function identifyGidIssue(gid) {
  if (!gid) return 'GID is null or undefined';
  if (typeof gid !== 'string') return 'GID is not a string';
  if (gid.includes('-temp')) return 'Contains \'-temp\' suffix (temporary ID)';
  if (/^cm[a-z0-9]{8,}$/.test(gid)) return 'CUID format instead of Shopify GID';
  if (!gid.startsWith('gid://shopify/')) return 'Missing \'gid://shopify/\' prefix';
  if (!/\/\d+$/.test(gid)) return 'Missing or invalid numeric ID at end';
  return 'Unknown format issue';
}

async function checkGidFormatIssues() {
  try {
    // 1. 查询所有资源
    const resources = await prisma.resource.findMany({
      where: { shopId },
      select: {
        id: true,
        resourceType: true,
        gid: true,
        title: true,
        _count: {
          select: {
            translations: {
              where: { syncStatus: 'pending' }
            }
          }
        }
      }
    });

    // 2. 识别无效GID
    const invalidGids = [];
    let totalAffectedTranslations = 0;

    resources.forEach(resource => {
      if (!isValidShopifyGid(resource.gid)) {
        const issue = identifyGidIssue(resource.gid);
        const affectedCount = resource._count.translations;

        invalidGids.push({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          resourceTitle: resource.title,
          gid: resource.gid,
          issue,
          affectedTranslations: affectedCount,
          recommendation: resource.resourceType === 'PRODUCT_OPTION'
            ? 'Run scripts/fix-option-gids.mjs'
            : 'Manual GID correction required'
        });

        totalAffectedTranslations += affectedCount;
      }
    });

    // 3. 按资源类型统计
    const byResourceType = {};
    invalidGids.forEach(item => {
      const type = item.resourceType;
      if (!byResourceType[type]) {
        byResourceType[type] = { count: 0, affectedTranslations: 0 };
      }
      byResourceType[type].count++;
      byResourceType[type].affectedTranslations += item.affectedTranslations;
    });

    // 4. 分析结果
    let analysis = '';
    let severity = 'none';

    if (invalidGids.length === 0) {
      analysis = '所有资源的GID格式正确，无需修复';
      severity = 'none';
    } else {
      const rate = ((invalidGids.length / resources.length) * 100).toFixed(1);
      analysis = `发现${invalidGids.length}个资源的GID格式异常 (${rate}%)，影响${totalAffectedTranslations}条待发布翻译`;

      if (totalAffectedTranslations === 0) {
        severity = 'low';
        analysis += '。但这些资源暂无待发布翻译，影响较小';
      } else if (totalAffectedTranslations < 10) {
        severity = 'medium';
      } else {
        severity = 'high';
        analysis += '。这可能是批量发布显示0%的根本原因';
      }
    }

    // 输出JSON结果
    const result = {
      shop: shopId,
      timestamp: new Date().toISOString(),
      totalResources: resources.length,
      invalidGidCount: invalidGids.length,
      invalidGids: invalidGids.slice(0, 20), // 最多显示20个样本
      byResourceType,
      affectedTranslations: totalAffectedTranslations,
      severity,
      analysis,
      recommendation: invalidGids.length > 0
        ? (invalidGids.some(item => item.resourceType === 'PRODUCT_OPTION')
          ? 'Run: node scripts/fix-option-gids.mjs --shop=' + shopId + ' --dry-run (预览) 或 --shop=' + shopId + ' (执行修复)'
          : '需要手动修正GID，或联系开发团队')
        : '无需操作，系统正常'
    };

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkGidFormatIssues();
