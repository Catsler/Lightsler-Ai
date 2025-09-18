#!/usr/bin/env node

/**
 * 验证产品选项翻译功能脚本
 * 检查 product_option 资源是否被正确翻译
 */

import { config } from 'dotenv';
import prisma from './app/db.server.js';

config();

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

async function verifyOptionTranslation() {
  console.log(colors.bold(colors.cyan('🔍 验证产品选项翻译状态')));
  console.log(''.padEnd(50, '='));

  try {
    // 1. 检查环境变量
    const isEnabled = process.env.ENABLE_PRODUCT_RELATED_TRANSLATION === 'true';
    console.log(`\n📋 环境配置:`);
    console.log(`   ENABLE_PRODUCT_RELATED_TRANSLATION: ${colors[isEnabled ? 'green' : 'red'](isEnabled)}`);

    // 2. 查询 product_option 资源
    const options = await prisma.resource.findMany({
      where: {
        resourceType: 'product_option'
      },
      include: {
        translations: true
      }
    });

    console.log(`\n📦 Product Options 资源:`);
    console.log(`   总数: ${options.length}`);

    if (options.length === 0) {
      console.log(colors.yellow('   ⚠️  没有找到 product_option 资源'));
      return;
    }

    // 3. 分析翻译状态
    let totalTranslations = 0;
    options.forEach(option => {
      const translationCount = option.translations.length;
      totalTranslations += translationCount;

      console.log(`\n   📝 ${option.title} (${option.id}):`);
      console.log(`      翻译数量: ${translationCount}`);

      if (translationCount > 0) {
        option.translations.forEach(trans => {
          console.log(colors.green(`      ✅ ${trans.language}: ${trans.syncStatus}`));
        });
      } else {
        console.log(colors.red(`      ❌ 未翻译`));
      }
    });

    // 4. 总结
    console.log(`\n${colors.bold('📊 总结:')}`);
    console.log(`   Product Options: ${options.length}`);
    console.log(`   翻译记录总数: ${totalTranslations}`);

    if (totalTranslations === 0) {
      console.log(colors.yellow('\n💡 建议操作:'));
      console.log('   1. 确认应用已重启（环境变量生效）');
      console.log('   2. 重新执行产品翻译');
      console.log('   3. 检查日志确认关联翻译是否执行');
    } else {
      console.log(colors.green('\n✅ Product Options 翻译功能工作正常'));
    }

  } catch (error) {
    console.error(colors.red(`❌ 验证过程出错: ${error.message}`));
  } finally {
    await prisma.$disconnect();
  }
}

// 执行验证
verifyOptionTranslation().catch(console.error);