/**
 * PRODUCT_OPTION syncStatus 重置脚本
 *
 * 背景：fix-translation-fields.mjs 清理了 translationFields，但未重置 syncStatus
 * 导致修复后的记录仍保持 'synced' 状态，UI 无待发布记录，发布按钮被禁用
 *
 * 用途：将已清理的记录重置为 'pending' 状态，使其重新进入发布队列
 *
 * 使用方法：
 *   node scripts/reset-option-sync-status.mjs --dry-run  # 预览
 *   node scripts/reset-option-sync-status.mjs             # 执行
 *
 * ⚠️ 执行位置：必须在 repo 根目录运行（依赖 process.cwd()）
 *
 * 安全特性：
 *   - 自动备份受影响记录到 backups/ 目录（权限 600）
 *   - 日志掩码敏感信息（DATABASE_URL 密码）
 *   - 串行处理多店铺（防止并发冲突）
 *   - dry-run 模式强制预览
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

/**
 * 递归清洗 translationFields 对象
 * 复用自 fix-translation-fields.mjs，保持逻辑一致
 */
function deepCleanTranslationFields(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // 检测跳过对象结构：{text, skipped, skipReason}
  if (obj.skipped === true && typeof obj.text === 'string') {
    return null;
  }

  // 检测部分跳过对象（只有 text 和 skipReason）
  if (obj.text !== undefined && obj.skipReason !== undefined && !obj.skipped) {
    return null;
  }

  // 数组递归处理
  if (Array.isArray(obj)) {
    return obj.map(deepCleanTranslationFields).filter(item => item !== null);
  }

  // 对象递归处理
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanedValue = deepCleanTranslationFields(value);
    if (cleanedValue !== null) {
      cleaned[key] = cleanedValue;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

/**
 * 检查 translationFields 是否包含跳过结构
 * 复用自 fix-translation-fields.mjs，作为判定依据
 */
function hasSkippedStructure(fields) {
  if (!fields || typeof fields !== 'object') {
    return false;
  }

  // 检查顶层
  if (fields.skipped === true || fields.skipReason !== undefined) {
    return true;
  }

  // 递归检查嵌套对象
  for (const value of Object.values(fields)) {
    if (typeof value === 'object' && value !== null) {
      if (value.skipped === true || value.skipReason !== undefined) {
        return true;
      }
      // 递归检查数组
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            if (item.skipped === true || item.skipReason !== undefined) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * 判定记录是否需要重置 syncStatus
 *
 * 逻辑：fix-translation-fields.mjs 已清理了 PRODUCT_OPTION 的 translationFields，
 * 但未重置 syncStatus。现在需要将这些已清理的 'synced' 记录重置为 'pending'。
 *
 * 由于 translationFields 已被清理（不再包含跳过结构），无法通过字段内容判定，
 * 因此直接重置所有 PRODUCT_OPTION 资源的 'synced' 记录。
 */
function needsReset(record) {
  // 只处理 PRODUCT_OPTION 资源类型
  if (record.resource?.resourceType !== 'PRODUCT_OPTION') {
    return false;
  }

  // 已经是 pending 状态，无需重置
  if (record.syncStatus === 'pending') {
    return false;
  }

  // PRODUCT_OPTION 且非 pending 状态，需要重置
  // （因为 fix-translation-fields.mjs 清理过但未重置 syncStatus）
  return true;
}

/**
 * 掩码敏感信息
 * 格式：protocol://***:***@host/path
 */
function maskDatabaseUrl(url) {
  if (!url) return 'undefined';
  return url.replace(/(.*:\/\/)([^:]+):([^@]+)@(.*)/, '$1***:***@$4');
}

/**
 * 确保备份目录存在且权限正确
 */
function ensureBackupDir() {
  const backupDir = path.join(process.cwd(), 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 }); // 仅所有者可访问
    console.log(`✅ 创建备份目录: ${backupDir} (权限 700)`);
  }

  return backupDir;
}

/**
 * 备份受影响记录
 */
function backupRecords(shopId, records) {
  const backupDir = ensureBackupDir();
  const timestamp = Date.now();
  const backupFile = path.join(backupDir, `reset-sync-${shopId}-${timestamp}.json`);

  const backupData = {
    shopId,
    timestamp,
    count: records.length,
    records: records.map(r => ({
      id: r.id,
      resourceId: r.resourceId,
      language: r.language,
      syncStatus: r.syncStatus,
      syncedAt: r.syncedAt,
      translationFields: r.translationFields
    }))
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), { mode: 0o600 });
  console.log(`✅ 备份已保存: ${backupFile} (${records.length} 条记录, 权限 600)`);

  return backupFile;
}

/**
 * 处理单个店铺的记录
 */
async function processShop(shopId, isDryRun) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📍 处理店铺: ${shopId}`);
  console.log(`${'='.repeat(60)}`);

  // 1. 查询所有该店铺的翻译记录（包含 resource 关联以获取类型）
  console.log('📊 查询翻译记录...');
  const allTranslations = await prisma.translation.findMany({
    where: { shopId },
    select: {
      id: true,
      resourceId: true,
      language: true,
      syncStatus: true,
      syncedAt: true,
      translationFields: true,
      resource: {
        select: {
          resourceType: true
        }
      }
    }
  });

  console.log(`   总记录数: ${allTranslations.length}`);

  // 2. 筛选需要重置的记录
  const needsResetRecords = allTranslations.filter(needsReset);

  console.log(`🔍 需要重置的记录数: ${needsResetRecords.length}\n`);

  if (needsResetRecords.length === 0) {
    console.log('✅ 没有需要重置的记录！');
    return;
  }

  // 3. 显示当前状态分布
  const statusDistribution = await prisma.translation.groupBy({
    by: ['syncStatus'],
    where: { shopId },
    _count: { _all: true }
  });

  console.log('📊 当前 syncStatus 分布:');
  statusDistribution.forEach(stat => {
    console.log(`   - ${stat.syncStatus}: ${stat._count._all} 条`);
  });
  console.log('');

  // 4. 显示受影响记录样本（前5条）
  console.log('📋 受影响记录样本（前5条）:');
  needsResetRecords.slice(0, 5).forEach((record, index) => {
    console.log(`   ${index + 1}. ID: ${record.id}`);
    console.log(`      resourceType: ${record.resource?.resourceType || 'N/A'}`);
    console.log(`      resourceId: ${record.resourceId}`);
    console.log(`      language: ${record.language}`);
    console.log(`      syncStatus: ${record.syncStatus} → pending`);
    console.log(`      syncedAt: ${record.syncedAt} → null`);
  });

  if (needsResetRecords.length > 5) {
    console.log(`   ... 及其他 ${needsResetRecords.length - 5} 条记录`);
  }
  console.log('');

  // 5. Dry-run 模式：只预览不执行
  if (isDryRun) {
    console.log('💡 这是预览模式（dry-run），没有实际修改数据。');
    console.log('   要执行重置，请运行: node scripts/reset-option-sync-status.mjs\n');
    return;
  }

  // 6. 备份受影响记录
  console.log('💾 备份受影响记录...');
  const backupFile = backupRecords(shopId, needsResetRecords);

  // 7. 执行重置
  console.log('🔧 开始执行重置...\n');

  let successCount = 0;
  let failedCount = 0;

  for (const record of needsResetRecords) {
    try {
      await prisma.translation.update({
        where: { id: record.id },
        data: {
          syncStatus: 'pending',
          syncedAt: null
        }
      });

      console.log(`   ✅ 重置成功: ${record.id}`);
      successCount++;
    } catch (error) {
      console.error(`   ❌ 重置失败: ${record.id}`, error.message);
      failedCount++;
    }
  }

  // 8. 验证结果
  console.log('\n🔍 验证结果...');
  const pendingCount = await prisma.translation.count({
    where: { shopId, syncStatus: 'pending' }
  });

  console.log(`   当前待发布记录数: ${pendingCount}`);

  // 9. 显示最终统计
  console.log('\n' + '='.repeat(60));
  console.log(`📊 ${shopId} 重置完成统计:`);
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failedCount}`);
  console.log(`   💾 备份文件: ${backupFile}`);
  console.log('='.repeat(60));
}

/**
 * 检查执行位置
 */
function checkExecutionPath() {
  const currentDir = process.cwd();
  const scriptsDir = path.join(currentDir, 'scripts');

  if (!fs.existsSync(scriptsDir)) {
    console.error('❌ 错误：必须在项目根目录执行此脚本！');
    console.error(`   当前目录: ${currentDir}`);
    console.error(`   期望目录: 包含 scripts/ 的项目根目录`);
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  // 检查执行位置
  checkExecutionPath();

  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('🔧 PRODUCT_OPTION syncStatus 重置脚本');
  console.log('='.repeat(60));
  console.log(`模式: ${isDryRun ? 'DRY RUN (预览)' : 'EXECUTE (执行重置)'}`);
  console.log(`🔐 数据库连接: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
  console.log('');

  // 串行处理多店铺（防止并发冲突）
  // 使用实际的 Shopify 域名（从数据库查询验证）
  const shopIds = [
    'sshvdt-ai.myshopify.com',      // Fynony 生产店铺
    'onewindoutdoors.myshopify.com' // OneWind 生产店铺
  ];

  for (const shopId of shopIds) {
    try {
      await processShop(shopId, isDryRun);
    } catch (error) {
      console.error(`\n❌ 处理 ${shopId} 时出错:`, error);
      console.error(error.stack);
    }
  }

  await prisma.$disconnect();
}

// 执行主函数
main().catch(async (error) => {
  console.error('❌ 脚本执行失败:', error);
  console.error(error.stack);
  await prisma.$disconnect();
  process.exit(1);
});
