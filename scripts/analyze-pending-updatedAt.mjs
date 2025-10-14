#!/usr/bin/env node
/**
 * 分析 pending 翻译的 updatedAt 时间分布
 *
 * 依赖：@prisma/client（只读数据库）
 *
 * 用法：
 *   node scripts/analyze-pending-updatedAt.mjs --shopId=sshvdt-ai.myshopify.com --language=da,et,ja
 *   node scripts/analyze-pending-updatedAt.mjs --shopId=sshvdt-ai.myshopify.com --language=da --resourceType=PRODUCT_OPTION
 *
 * 参数：
 *   --shopId       (必填) 店铺ID
 *   --language     (必填) 语言代码，多个用逗号分隔（如 da,et,ja）
 *   --resourceType (可选) 资源类型，默认PRODUCT_OPTION
 *
 * 输出：updatedAt时间分布统计，判断是集中问题还是系统性问题
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key.startsWith('--')) {
      params[key.substring(2)] = value;
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

// 主函数
async function main() {
  const params = parseArgs();

  // 验证参数
  if (!params.shopId) {
    log('❌ 缺少 --shopId 参数', 'red');
    process.exit(1);
  }

  if (!params.language) {
    log('❌ 缺少 --language 参数', 'red');
    process.exit(1);
  }

  const shopId = params.shopId;
  const languages = params.language.split(',');
  const resourceType = params.resourceType || 'PRODUCT_OPTION';

  log('\n===== Pending 翻译时间分布分析 =====\n', 'cyan');
  log(`店铺: ${shopId}`, 'blue');
  log(`语言: ${languages.join(', ')}`, 'blue');
  log(`资源类型: ${resourceType}\n`, 'blue');

  // 查询所有 pending 翻译
  const translations = await prisma.translation.findMany({
    where: {
      resource: {
        resourceType: resourceType,
        shopId: shopId
      },
      syncStatus: 'pending',
      language: { in: languages }
    },
    select: {
      id: true,
      language: true,
      updatedAt: true,
      createdAt: true
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  if (translations.length === 0) {
    log('✅ 没有找到符合条件的 pending 翻译', 'green');
    await prisma.$disconnect();
    return;
  }

  log(`找到 ${translations.length} 条 pending 翻译\n`, 'cyan');

  // 按小时分组统计
  const byHour = {};
  const byDay = {};
  const byLanguage = {};

  translations.forEach(t => {
    const updatedAt = new Date(t.updatedAt);
    const hour = updatedAt.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const day = updatedAt.toISOString().slice(0, 10);  // YYYY-MM-DD
    const lang = t.language;

    byHour[hour] = (byHour[hour] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
  });

  // 输出语言分布
  log('===== 语言分布 =====\n', 'cyan');
  Object.entries(byLanguage)
    .sort((a, b) => b[1] - a[1])
    .forEach(([lang, count]) => {
      const percentage = ((count / translations.length) * 100).toFixed(1);
      log(`${lang}: ${count} 条 (${percentage}%)`, 'blue');
    });

  // 输出天级分布
  log('\n===== 按天分布（最近10天）=====\n', 'cyan');
  Object.entries(byDay)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 10)
    .forEach(([day, count]) => {
      const percentage = ((count / translations.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.ceil(count / 20));
      log(`${day}: ${count} 条 (${percentage}%) ${bar}`, 'blue');
    });

  // 输出小时级分布（最近20小时）
  log('\n===== 按小时分布（最近20小时）=====\n', 'cyan');
  Object.entries(byHour)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 20)
    .forEach(([hour, count]) => {
      const percentage = ((count / translations.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.ceil(count / 10));
      log(`${hour}: ${count} 条 (${percentage}%) ${bar}`, 'blue');
    });

  // 分析模式
  log('\n===== 分析结论 =====\n', 'cyan');

  const hourEntries = Object.entries(byHour);
  const maxHourCount = Math.max(...hourEntries.map(([_, count]) => count));
  const maxHourPercentage = (maxHourCount / translations.length) * 100;

  const dayEntries = Object.entries(byDay);
  const maxDayCount = Math.max(...dayEntries.map(([_, count]) => count));
  const maxDayPercentage = (maxDayCount / translations.length) * 100;

  if (maxHourPercentage > 50) {
    const maxHour = hourEntries.find(([_, count]) => count === maxHourCount)[0];
    log(`🎯 集中问题：${maxHourPercentage.toFixed(1)}% 的记录集中在 ${maxHour}`, 'yellow');
    log('   可能原因：批量操作中断或异常', 'yellow');
    log('   建议：重点检查该时间段的日志', 'yellow');
  } else if (maxDayPercentage > 70) {
    const maxDay = dayEntries.find(([_, count]) => count === maxDayCount)[0];
    log(`🎯 集中问题：${maxDayPercentage.toFixed(1)}% 的记录集中在 ${maxDay}`, 'yellow');
    log('   可能原因：某天的批量操作失败', 'yellow');
    log('   建议：检查当天的系统日志', 'yellow');
  } else {
    log('⚠️  分散问题：记录分布在多个时间段', 'yellow');
    log('   可能原因：系统性问题或持续性错误', 'yellow');
    log('   建议：检查代码逻辑和配置', 'yellow');
  }

  // 输出样本
  log('\n===== 样本记录（最近更新的5条）=====\n', 'cyan');
  translations.slice(0, 5).forEach(t => {
    log(`ID: ${t.id}`, 'blue');
    log(`语言: ${t.language}`, 'blue');
    log(`创建: ${t.createdAt}`, 'blue');
    log(`更新: ${t.updatedAt}`, 'blue');
    log('---', 'blue');
  });

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
