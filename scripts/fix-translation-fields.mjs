/**
 * 历史数据修复脚本
 * 清理 Translation 表中的 translationFields，移除 {text, skipped, skipReason} 结构
 * 同时重置 syncStatus 为 'pending'，确保修复后的翻译可以重新发布
 *
 * 使用方法:
 *   node scripts/fix-translation-fields.mjs --dry-run  # 预览将要修复的记录
 *   node scripts/fix-translation-fields.mjs             # 执行修复
 *
 * 修改历史:
 *   - 2025-10-12: 添加 syncStatus 和 syncedAt 重置，防止发布按钮灰度问题
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 递归清洗 translationFields 对象
 * 与 database.server.js 中的函数保持一致
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

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Translation Fields 历史数据修复');
  console.log('='.repeat(60));
  console.log(`模式: ${isDryRun ? 'DRY RUN (预览)' : 'EXECUTE (执行修复)'}\n`);

  // 1. 查找所有 Translation 记录
  console.log('📊 查询所有 Translation 记录...');
  const allTranslations = await prisma.translation.findMany({
    select: {
      id: true,
      resourceId: true,
      language: true,
      translationFields: true
    }
  });

  console.log(`   总记录数: ${allTranslations.length}\n`);

  // 2. 筛选需要修复的记录
  const needsFix = allTranslations.filter(t =>
    hasSkippedStructure(t.translationFields)
  );

  console.log(`🔍 需要修复的记录数: ${needsFix.length}\n`);

  if (needsFix.length === 0) {
    console.log('✅ 没有需要修复的记录！');
    await prisma.$disconnect();
    return;
  }

  // 3. 显示受影响的记录
  console.log('📋 受影响的记录:');
  for (const record of needsFix) {
    console.log(`   - ID: ${record.id}`);
    console.log(`     Resource: ${record.resourceId}`);
    console.log(`     Language: ${record.language}`);
    console.log(`     原始 translationFields:`);
    console.log(`     ${JSON.stringify(record.translationFields, null, 2)}`);

    const cleaned = deepCleanTranslationFields(record.translationFields);
    console.log(`     清洗后 translationFields:`);
    console.log(`     ${JSON.stringify(cleaned, null, 2)}\n`);
  }

  // 4. 执行修复（如果不是 dry-run）
  if (!isDryRun) {
    console.log('🔧 开始执行修复...\n');

    let fixedCount = 0;
    let failedCount = 0;

    for (const record of needsFix) {
      try {
        const cleaned = deepCleanTranslationFields(record.translationFields);

        await prisma.translation.update({
          where: { id: record.id },
          data: {
            translationFields: cleaned,
            syncStatus: 'pending',    // 重置为待发布状态
            syncedAt: null            // 清除发布时间戳
          }
        });

        console.log(`   ✅ 修复成功: ${record.id}`);
        fixedCount++;
      } catch (error) {
        console.error(`   ❌ 修复失败: ${record.id}`, error.message);
        failedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('修复完成统计:');
    console.log(`   ✅ 成功: ${fixedCount}`);
    console.log(`   ❌ 失败: ${failedCount}`);
    console.log('='.repeat(60));
  } else {
    console.log('\n💡 这是预览模式，没有实际修改数据。');
    console.log('   要执行修复，请运行: node scripts/fix-translation-fields.mjs');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('❌ 脚本执行失败:', error);
  await prisma.$disconnect();
  process.exit(1);
});
