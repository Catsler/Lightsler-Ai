#!/usr/bin/env node
/**
 * 诊断脚本：检查 ProductOption 的 translatableContent 结构
 *
 * 用途：验证 ProductOption 资源是否支持 values 字段翻译
 *
 * 使用方法：
 * 1. 修改配置区的常量（详见下方 CONFIG）
 * 2. 在项目根目录执行：node scripts/diagnostics/check-option-translatable-content.mjs
 *
 * 示例（不要直接复制）：
 * # OneWind 店铺：
 * # cd /var/www/app2-onewind && node scripts/diagnostics/check-option-translatable-content.mjs
 *
 * # Fynony 店铺：
 * # cd /var/www/app1-fynony && node scripts/diagnostics/check-option-translatable-content.mjs
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

// ============================
// 📋 配置区 - 执行前必须修改
// ============================
const CONFIG = {
  // 目标 ProductOption GID
  OPTION_GID: 'gid://shopify/ProductOption/10361535758519',

  // 店铺域名（用于 GraphQL 请求）
  SHOP_DOMAIN: 'onewindoutdoors.myshopify.com',

  // Session 查询条件（必须与 SHOP_DOMAIN 匹配）
  SESSION_SHOP: 'onewindoutdoors.myshopify.com',

  // API 版本
  API_VERSION: '2025-07'
};

// ⚠️ 换店铺时以下三项必须同步修改：
// 1. OPTION_GID - 目标店铺的 ProductOption GID
// 2. SHOP_DOMAIN - GraphQL 请求域名
// 3. SESSION_SHOP - 数据库 session 查询条件
// 否则会出现认证错误或查询错误的店铺数据

// ============================
// 工具函数
// ============================
function truncateValue(value, maxLength = 80) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '…';
}

// ============================
// 主程序
// ============================
const prisma = new PrismaClient();

async function queryTranslatableContent() {
  console.log('\n🔍 ProductOption translatableContent 诊断');
  console.log('━'.repeat(50));
  console.log(`目标 GID: ${CONFIG.OPTION_GID}`);
  console.log(`店铺域名: ${CONFIG.SHOP_DOMAIN}`);
  console.log(`API 版本: ${CONFIG.API_VERSION}`);
  console.log('━'.repeat(50) + '\n');

  // 获取 session token
  const session = await prisma.session.findFirst({
    where: {
      shop: CONFIG.SESSION_SHOP,
      isOnline: false
    },
    orderBy: { expires: 'desc' }
  });

  if (!session?.accessToken) {
    console.error(`❌ 未找到 ${CONFIG.SESSION_SHOP} 的有效 session`);
    console.error('提示: 检查 SESSION_SHOP 是否与实际店铺匹配');
    process.exit(1);
  }

  console.log('✅ 获取 session token 成功\n');

  // GraphQL 查询
  const query = `
    query GetTranslatableContent($resourceId: ID!) {
      translatableResource(resourceId: $resourceId) {
        resourceId
        translatableContent {
          key
          value
          digest
          locale
        }
      }
    }
  `;

  const url = `https://${CONFIG.SHOP_DOMAIN}/admin/api/${CONFIG.API_VERSION}/graphql.json`;

  console.log(`📡 调用 Shopify API: ${url}\n`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': session.accessToken
    },
    body: JSON.stringify({
      query,
      variables: { resourceId: CONFIG.OPTION_GID }
    })
  });

  const result = await response.json();

  // HTTP 状态检查
  if (!response.ok) {
    console.error(`❌ HTTP 错误: ${response.status} ${response.statusText}`);
    if (result.errors) {
      console.error('错误详情:', JSON.stringify(result.errors, null, 2));
    }
    process.exit(1);
  }

  // GraphQL 错误处理
  if (result.errors) {
    console.error('❌ GraphQL 错误:');
    result.errors.forEach((err, i) => {
      console.error(`  ${i+1}. ${err.message}`);
      if (err.extensions) {
        console.error(`     扩展信息: ${JSON.stringify(err.extensions, null, 2)}`);
      }
      if (err.locations) {
        console.error(`     位置: ${JSON.stringify(err.locations)}`);
      }
    });

    if (process.env.DEBUG) {
      console.error('\n🔧 完整错误响应:');
      console.error(JSON.stringify(result, null, 2));
    }

    process.exit(1);
  }

  // 显示结果
  const resource = result.data?.translatableResource;

  if (!resource) {
    console.error('❌ 未找到 translatableResource');
    console.error('可能原因:');
    console.error('  1. GID 格式错误或不存在');
    console.error('  2. 资源类型不支持翻译');
    console.error('  3. 权限不足');

    if (process.env.DEBUG) {
      console.error('\n🔧 完整响应:');
      console.error(JSON.stringify(result, null, 2));
    }

    process.exit(1);
  }

  const content = resource.translatableContent || [];

  console.log('📊 translatableContent 结构:');
  console.log('━'.repeat(50));

  if (content.length === 0) {
    console.log('  (空 - 该资源没有可翻译字段)');
  } else {
    content.forEach((item, i) => {
      console.log(`  ${i+1}. key: "${item.key}"`);
      console.log(`     value: ${truncateValue(item.value, 80)}`);
      console.log(`     digest: ${item.digest}`);
      console.log(`     locale: ${item.locale || '(default)'}`);
      console.log();
    });
  }

  // 分析
  console.log('📈 分析结果:');
  console.log('━'.repeat(50));

  const hasNameKey = content.some(item => item.key === 'name');
  const hasValuesKey = content.some(item => item.key === 'values');
  const hasOptionValue = content.some(item => item.key.includes('option_value'));

  console.log(`  ✓ 字段总数: ${content.length}`);
  console.log(`  ✓ 包含 'name': ${hasNameKey ? '✅ 是' : '❌ 否'}`);
  console.log(`  ✓ 包含 'values': ${hasValuesKey ? '✅ 是' : '❌ 否'}`);
  console.log(`  ✓ 包含 'option_value': ${hasOptionValue ? '✅ 是' : '❌ 否'}`);

  // 决策建议
  console.log('\n💡 诊断建议:');
  console.log('━'.repeat(50));

  if (!content.length) {
    console.log('  ⚠️ 该资源不支持 translationsRegister');
    console.log('  → 可能需要使用 productUpdate mutation');
  } else if (hasValuesKey) {
    console.log('  ✅ 可以使用 translationsRegister 发布 values');
    console.log('  → 检查发布代码为何跳过了 values 字段');
    console.log('  → 可能是 digest 不匹配或字段处理逻辑问题');
  } else if (hasNameKey && !hasValuesKey) {
    console.log('  ⚠️ 只能翻译 option name，不能翻译 values');
    console.log('  → 方案1: 查询每个 ProductOptionValue 资源');
    console.log('  → 方案2: 接受限制，只翻译 name');
  } else {
    console.log('  ❓ 非预期的字段结构，需要进一步调查');
  }

  // 导出原始数据供调试
  if (process.env.DEBUG) {
    console.log('\n🔧 调试信息 (完整响应):');
    console.log(JSON.stringify(result, null, 2));
  }

  console.log('\n✅ 诊断完成');
}

// 执行
queryTranslatableContent()
  .catch(err => {
    console.error('\n❌ 执行错误:', err.message);
    if (err.stack && process.env.DEBUG) {
      console.error('\n堆栈追踪:');
      console.error(err.stack);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
