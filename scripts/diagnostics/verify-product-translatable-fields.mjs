#!/usr/bin/env node
/**
 * 验证脚本：检查 Product 资源的 translatableContent 是否包含 option 相关字段
 *
 * 用途：确认是否可以通过 Product 资源发布 option 翻译
 *
 * 使用方法：
 * 1. 修改配置区的 PRODUCT_GID
 * 2. 在项目根目录执行：node scripts/diagnostics/verify-product-translatable-fields.mjs
 *
 * 预期结果：
 * - 如果 translatableContent 只包含 title/description/metafield 等标准字段
 *   → 说明 Product 资源不支持发布 option 翻译
 * - 如果包含 option 或 optionValue 相关字段
 *   → 可能存在通过 Product 资源发布的路径
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

// ============================
// 📋 配置区 - 执行前必须修改
// ============================
const CONFIG = {
  // 目标 Product GID（从 Resource 表查询或 Shopify Admin 获取）
  PRODUCT_GID: 'gid://shopify/Product/8063372165309',

  // 店铺域名（用于 GraphQL 请求）
  SHOP_DOMAIN: 'lightsler-ai.myshopify.com',

  // Session 查询条件（必须与 SHOP_DOMAIN 匹配）
  SESSION_SHOP: 'lightsler-ai.myshopify.com',

  // API 版本
  API_VERSION: '2025-07'
};

// ============================
// 主程序
// ============================
const prisma = new PrismaClient();

async function verifyProductTranslatableFields() {
  console.log('\n🔍 Product translatableContent 验证\n');
  console.log('━'.repeat(70));
  console.log(`目标 GID: ${CONFIG.PRODUCT_GID}`);
  console.log(`店铺域名: ${CONFIG.SHOP_DOMAIN}`);
  console.log(`API 版本: ${CONFIG.API_VERSION}`);
  console.log('━'.repeat(70) + '\n');

  // 检查 GID 是否已替换
  if (CONFIG.PRODUCT_GID.includes('REPLACE_ME') || !CONFIG.PRODUCT_GID.startsWith('gid://shopify/Product/')) {
    console.error('❌ 错误: 必须先替换 PRODUCT_GID');
    console.error('提示: 使用实际的 Product GID');
    console.error('格式: gid://shopify/Product/数字ID');
    process.exit(1);
  }

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
    query GetProductTranslatableContent($resourceId: ID!) {
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
      variables: { resourceId: CONFIG.PRODUCT_GID }
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
    });
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
    process.exit(1);
  }

  const content = resource.translatableContent || [];

  console.log('📊 translatableContent 结构:\n');
  console.log('━'.repeat(70));

  if (content.length === 0) {
    console.log('  (空 - 该资源没有可翻译字段)');
  } else {
    content.forEach((item, i) => {
      const valuePreview = typeof item.value === 'string' && item.value.length > 80
        ? item.value.slice(0, 80) + '…'
        : item.value;

      console.log(`  ${i+1}. key: "${item.key}"`);
      console.log(`     value: ${valuePreview}`);
      console.log(`     digest: ${item.digest}`);
      console.log(`     locale: ${item.locale || '(default)'}`);
      console.log();
    });
  }

  // 关键分析：是否包含 option 相关字段
  console.log('🎯 关键分析:\n');
  console.log('━'.repeat(70));

  const optionRelatedKeys = content.filter(item =>
    item.key && (
      item.key.toLowerCase().includes('option') ||
      item.key.toLowerCase().includes('variant')
    )
  );

  console.log(`  ✓ 字段总数: ${content.length}`);
  console.log(`  ✓ option 相关字段数: ${optionRelatedKeys.length}`);

  if (optionRelatedKeys.length > 0) {
    console.log('\n  ✅ 发现 option 相关字段:');
    optionRelatedKeys.forEach(item => {
      console.log(`     - "${item.key}"`);
    });
  } else {
    console.log('\n  ❌ 未发现 option 相关字段');
  }

  // 标准字段统计
  const standardKeys = ['title', 'description', 'body_html', 'metafield'];
  const standardFields = content.filter(item =>
    standardKeys.some(key => item.key && item.key.toLowerCase().includes(key))
  );

  console.log(`\n  ℹ️  标准字段数: ${standardFields.length}`);
  if (standardFields.length > 0) {
    console.log('     包含: ' + standardFields.map(f => f.key).join(', '));
  }

  // 结论
  console.log('\n💡 结论:\n');
  console.log('━'.repeat(70));

  if (optionRelatedKeys.length > 0) {
    console.log('  ✅ Product 资源可能支持 option 翻译');
    console.log('  → 下一步: 研究如何通过这些字段发布 option 翻译');
    console.log('  → 验证: 尝试通过 Product 的 translationsRegister 发布');
  } else {
    console.log('  ❌ Product 资源不包含 option 相关可翻译字段');
    console.log('  → 结论: 无法通过 Product 资源发布 option 翻译');
    console.log('  → 建议: 继续调研其他发布路径（productOptionsUpdate 等）');
  }

  // 导出原始数据供调试
  if (process.env.DEBUG) {
    console.log('\n🔧 调试信息 (完整响应):');
    console.log(JSON.stringify(result, null, 2));
  }

  console.log('\n✅ 验证完成\n');
}

// 执行
verifyProductTranslatableFields()
  .catch(err => {
    console.error('\n❌ 执行错误:', err.message);
    if (err.stack && process.env.DEBUG) {
      console.error('\n堆栈追踪:');
      console.error(err.stack);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
