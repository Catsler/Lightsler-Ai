#!/usr/bin/env node
/**
 * 语言配置验证和修复工具
 * 用于检测和修复店铺语言配置中的 code 与 name 不匹配问题
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 已知语言映射关系
const KNOWN_LANGUAGE_MAPPINGS = {
  'de': ['German', '德语', 'Deutsch'],
  'nl': ['Dutch', '荷兰语', 'Nederlands'],
  'en': ['English', '英语'],
  'zh-CN': ['Chinese (Simplified)', '简体中文', '中文'],
  'zh-TW': ['Chinese (Traditional)', '繁体中文'],
  'fr': ['French', '法语', 'Français'],
  'es': ['Spanish', '西班牙语', 'Español'],
  'ja': ['Japanese', '日语', '日本語'],
  'ko': ['Korean', '韩语', '한국어'],
  'it': ['Italian', '意大利语', 'Italiano'],
  'pt': ['Portuguese', '葡萄牙语', 'Português'],
  'ru': ['Russian', '俄语', 'Русский'],
  'ar': ['Arabic', '阿拉伯语', 'العربية'],
  'hi': ['Hindi', '印地语', 'हिन्दी'],
  'th': ['Thai', '泰语', 'ไทย'],
  'vi': ['Vietnamese', '越南语', 'Tiếng Việt'],
  'tr': ['Turkish', '土耳其语', 'Türkçe']
};

/**
 * 验证语言配置一致性
 */
function validateLanguageConsistency(code, name) {
  if (!KNOWN_LANGUAGE_MAPPINGS[code]) {
    return { isValid: true, reason: '未知语言代码，跳过验证' };
  }

  const validNames = KNOWN_LANGUAGE_MAPPINGS[code];
  const isValid = validNames.some(validName =>
    name.toLowerCase().includes(validName.toLowerCase()) ||
    validName.toLowerCase().includes(name.toLowerCase())
  );

  return {
    isValid,
    reason: isValid 
      ? '语言配置正确' 
      : `期望名称包含: ${validNames.join(', ')}`
  };
}

/**
 * 获取建议的语言名称
 */
function getSuggestedName(code) {
  const suggestions = KNOWN_LANGUAGE_MAPPINGS[code];
  return suggestions ? suggestions[0] : code;
}

/**
 * 验证所有店铺的语言配置
 */
async function validateAllShopsLanguageConfig() {
  console.log('🔍 开始验证所有店铺的语言配置...\n');

  try {
    // 获取所有店铺的语言配置
    const shops = await prisma.shop.findMany({
      include: {
        languages: {
          where: { isActive: true },
          orderBy: { code: 'asc' }
        }
      }
    });

    console.log(`找到 ${shops.length} 个店铺\n`);

    const issues = [];
    let totalLanguages = 0;
    let inconsistentLanguages = 0;

    for (const shop of shops) {
      console.log(`🏪 店铺: ${shop.id}`);
      console.log(`📊 活跃语言数量: ${shop.languages.length}`);

      if (shop.languages.length === 0) {
        console.log('⚠️  该店铺没有活跃的语言配置');
        issues.push({
          shopId: shop.id,
          type: 'NO_LANGUAGES',
          message: '没有活跃的语言配置'
        });
      }

      for (const language of shop.languages) {
        totalLanguages++;
        const validation = validateLanguageConsistency(language.code, language.name);
        
        if (!validation.isValid) {
          inconsistentLanguages++;
          const suggestedName = getSuggestedName(language.code);
          
          console.log(`❌ 语言配置不一致:`);
          console.log(`    代码: ${language.code}`);
          console.log(`    名称: ${language.name}`);
          console.log(`    问题: ${validation.reason}`);
          console.log(`    建议: ${suggestedName}`);

          issues.push({
            shopId: shop.id,
            type: 'INCONSISTENT_LANGUAGE',
            code: language.code,
            currentName: language.name,
            suggestedName: suggestedName,
            reason: validation.reason
          });
        } else {
          console.log(`✅ ${language.code} (${language.name}) - ${validation.reason}`);
        }
      }
      console.log();
    }

    // 总结报告
    console.log('📋 验证总结:');
    console.log(`  总店铺数: ${shops.length}`);
    console.log(`  总语言数: ${totalLanguages}`);
    console.log(`  不一致语言数: ${inconsistentLanguages}`);
    console.log(`  问题数量: ${issues.length}`);

    if (issues.length > 0) {
      console.log('\n🛠️  修复建议:');
      console.log('运行以下命令修复特定店铺的语言配置:');
      
      const shopIds = [...new Set(issues.map(issue => issue.shopId))];
      for (const shopId of shopIds) {
        console.log(`  node scripts/fix-fynony-language-config.js ${shopId}`);
      }
    } else {
      console.log('\n🎉 所有店铺的语言配置都正确!');
    }

    return issues;

  } catch (error) {
    console.error('❌ 验证过程中出现错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 修复特定店铺的语言配置
 */
async function fixShopLanguageConfig(shopId, dryRun = true) {
  console.log(`🔧 ${dryRun ? '模拟' : '执行'}修复店铺 ${shopId} 的语言配置...\n`);

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        languages: {
          where: { isActive: true }
        }
      }
    });

    if (!shop) {
      throw new Error(`店铺 ${shopId} 不存在`);
    }

    const updates = [];

    for (const language of shop.languages) {
      const validation = validateLanguageConsistency(language.code, language.name);
      
      if (!validation.isValid) {
        const suggestedName = getSuggestedName(language.code);
        
        console.log(`🔄 ${dryRun ? '模拟' : ''}修复语言:`);
        console.log(`    代码: ${language.code}`);
        console.log(`    当前名称: ${language.name}`);
        console.log(`    建议名称: ${suggestedName}`);
        
        updates.push({
          where: {
            shopId_code: {
              shopId: shopId,
              code: language.code
            }
          },
          data: {
            name: suggestedName
          }
        });
      }
    }

    if (updates.length === 0) {
      console.log('✅ 该店铺的语言配置已经正确，无需修复');
      return [];
    }

    if (!dryRun) {
      // 执行批量更新
      await prisma.$transaction(
        updates.map(update => prisma.language.update(update))
      );
      console.log(`✅ 成功修复 ${updates.length} 个语言配置`);
    } else {
      console.log(`📝 模拟完成，将修复 ${updates.length} 个语言配置`);
      console.log('添加 --fix 参数执行实际修复');
    }

    return updates;

  } catch (error) {
    console.error('❌ 修复过程中出现错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 命令行入口
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const shopId = args[1];
  const shouldFix = args.includes('--fix');

  try {
    if (command === 'validate') {
      await validateAllShopsLanguageConfig();
    } else if (command === 'fix' && shopId) {
      await fixShopLanguageConfig(shopId, !shouldFix);
    } else {
      console.log('🛠️  语言配置验证和修复工具');
      console.log('');
      console.log('用法:');
      console.log('  node scripts/validate-language-config.js validate');
      console.log('  node scripts/validate-language-config.js fix <shopId> [--fix]');
      console.log('');
      console.log('命令:');
      console.log('  validate    验证所有店铺的语言配置');
      console.log('  fix         修复特定店铺的语言配置');
      console.log('');
      console.log('选项:');
      console.log('  --fix       执行实际修复（不加此参数仅模拟）');
      console.log('');
      console.log('示例:');
      console.log('  node scripts/validate-language-config.js validate');
      console.log('  node scripts/validate-language-config.js fix fynony.myshopify.com');
      console.log('  node scripts/validate-language-config.js fix fynony.myshopify.com --fix');
    }
  } catch (error) {
    console.error('执行失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateAllShopsLanguageConfig, fixShopLanguageConfig };