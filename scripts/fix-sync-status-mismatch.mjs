#!/usr/bin/env node
/**
 * 修复已验证的 syncStatus 不一致记录
 *
 * 前提：必须先运行 verify-shopify-sync-status.mjs 确认不一致
 *
 * 用法：
 *   node scripts/fix-sync-status-mismatch.mjs --shopId=sshvdt-ai.myshopify.com --input=/var/backups/translations/mismatched-ids.json --dry-run
 *   node scripts/fix-sync-status-mismatch.mjs --shopId=sshvdt-ai.myshopify.com --input=/var/backups/translations/mismatched-ids.json
 *
 * 参数：
 *   --shopId  (必填) 店铺ID（Shopify domain）
 *   --input   (必填) 包含待修复翻译ID的JSON文件路径
 *   --dry-run (可选) 预览模式，不实际修改数据库
 *
 * 安全措施：
 *   - 必须从文件读取ID列表
 *   - 支持 dry-run 预览
 *   - 使用事务保护
 *   - 记录修复日志
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';

const prisma = new PrismaClient();

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  args.forEach(arg => {
    if (arg === '--dry-run') {
      params.dryRun = true;
    } else {
      const [key, value] = arg.split('=');
      if (key.startsWith('--')) {
        params[key.substring(2)] = value;
      }
    }
  });

  return params;
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 读取待修复的ID列表
function readMismatchedIds(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  // 支持两种格式：
  // 1. 数组格式：[{translationId: "xxx"}, ...]
  // 2. 对象格式：{mismatches: [{translationId: "xxx"}, ...]}
  let mismatches = [];
  if (Array.isArray(data)) {
    mismatches = data;
  } else if (data.mismatches && Array.isArray(data.mismatches)) {
    mismatches = data.mismatches;
  } else {
    throw new Error('JSON文件格式错误：需要数组或包含 mismatches 字段的对象');
  }

  // 提取ID列表
  const ids = mismatches.map(item => item.translationId).filter(Boolean);

  if (ids.length === 0) {
    throw new Error('JSON文件中没有找到有效的 translationId');
  }

  return ids;
}

// 主函数
async function main() {
  const params = parseArgs();

  // 验证参数
  if (!params.shopId) {
    log('❌ 缺少 --shopId 参数', 'red');
    process.exit(1);
  }

  if (!params.input) {
    log('❌ 缺少 --input 参数', 'red');
    process.exit(1);
  }

  const shopId = params.shopId;
  const inputFile = params.input;
  const dryRun = params.dryRun || false;

  log('\n===== 修复 syncStatus 不一致记录 =====\n', 'cyan');
  log(`店铺: ${shopId}`, 'blue');
  log(`输入文件: ${inputFile}`, 'blue');
  log(`模式: ${dryRun ? 'DRY-RUN（预览）' : '实际修复'}`, dryRun ? 'yellow' : 'green');
  log('');

  // 读取ID列表
  let translationIds;
  try {
    translationIds = readMismatchedIds(inputFile);
    log(`从文件读取到 ${translationIds.length} 个翻译ID\n`, 'cyan');
  } catch (error) {
    log(`❌ 读取文件失败: ${error.message}`, 'red');
    process.exit(1);
  }

  // 查询这些翻译记录
  const translations = await prisma.translation.findMany({
    where: {
      id: { in: translationIds },
      resource: {
        shopId: shopId
      }
    },
    include: {
      resource: {
        select: {
          id: true,
          gid: true,
          title: true,
          resourceType: true,
          shopId: true
        }
      }
    }
  });

  if (translations.length === 0) {
    log('❌ 没有找到符合条件的翻译记录', 'red');
    await prisma.$disconnect();
    return;
  }

  log(`找到 ${translations.length} 条匹配记录\n`, 'cyan');

  // 分析记录状态
  const byStatus = {};
  const byResourceType = {};

  translations.forEach(t => {
    byStatus[t.syncStatus] = (byStatus[t.syncStatus] || 0) + 1;
    const resourceType = t.resource?.resourceType || 'UNKNOWN';
    byResourceType[resourceType] = (byResourceType[resourceType] || 0) + 1;
  });

  log('===== 当前状态分布 =====\n', 'cyan');
  Object.entries(byStatus).forEach(([status, count]) => {
    const percentage = ((count / translations.length) * 100).toFixed(1);
    log(`${status}: ${count} 条 (${percentage}%)`, 'blue');
  });

  log('\n===== 资源类型分布 =====\n', 'cyan');
  Object.entries(byResourceType).forEach(([type, count]) => {
    const percentage = ((count / translations.length) * 100).toFixed(1);
    log(`${type}: ${count} 条 (${percentage}%)`, 'blue');
  });

  log('\n===== 修复详情 =====\n', 'cyan');

  if (dryRun) {
    log('🔍 DRY-RUN 模式：仅预览，不修改数据库\n', 'yellow');

    // 预览前5条
    const preview = translations.slice(0, 5);
    preview.forEach(t => {
      log(`ID: ${t.id}`, 'blue');
      log(`资源: ${t.resource?.title || 'N/A'}`, 'blue');
      log(`类型: ${t.resource?.resourceType || 'UNKNOWN'}`, 'blue');
      log(`语言: ${t.language}`, 'blue');
      log(`当前状态: ${t.syncStatus}`, 'blue');
      log(`将修改为: synced`, 'green');
      log(`设置 syncedAt: ${new Date().toISOString()}`, 'green');
      log('---', 'blue');
    });

    if (translations.length > 5) {
      log(`... 还有 ${translations.length - 5} 条记录`, 'blue');
    }

    log(`\n✅ DRY-RUN 完成，共预览 ${translations.length} 条记录`, 'green');
    log('如需实际修复，请移除 --dry-run 参数重新运行', 'yellow');

  } else {
    // 实际修复：使用事务
    try {
      const result = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.translation.updateMany({
          where: {
            id: { in: translationIds },
            resource: {
              shopId: shopId
            }
          },
          data: {
            syncStatus: 'synced',
            syncedAt: new Date(),
            syncError: null
          }
        });

        return updateResult;
      });

      log(`✅ 修复完成：成功更新 ${result.count} 条记录`, 'green');

      // 输出修复汇总
      log('\n===== 修复汇总 =====\n', 'cyan');
      log(`待修复记录数: ${translationIds.length}`, 'blue');
      log(`找到的记录数: ${translations.length}`, 'blue');
      log(`实际修复数: ${result.count}`, 'green');

      if (result.count !== translations.length) {
        log(`⚠️  注意：修复数量与找到的记录数不一致`, 'yellow');
      }

      // 修复日志
      const logEntry = {
        timestamp: new Date().toISOString(),
        shopId,
        inputFile,
        recordsFound: translations.length,
        recordsUpdated: result.count,
        translationIds
      };

      log('\n===== 修复日志 =====\n', 'cyan');
      console.log(JSON.stringify(logEntry, null, 2));

    } catch (error) {
      log(`\n❌ 修复失败: ${error.message}`, 'red');
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  log('\n');
  await prisma.$disconnect();
}

// 执行
main().catch(error => {
  log(`\n❌ 脚本执行失败: ${error.message}`, 'red');
  console.error(error);
  prisma.$disconnect();
  process.exit(1);
});
