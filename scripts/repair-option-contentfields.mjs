#!/usr/bin/env node
/**
 * 修复 PRODUCT_OPTION 和 PRODUCT_METAFIELD 资源的 NULL contentFields
 *
 * 问题：早期扫描创建的 option/metafield 资源可能 contentFields 为 NULL
 * 影响：批量发布功能需要 contentFields.productGid，NULL 会导致跳过发布
 * 解决：从 Shopify GraphQL 重新获取完整数据并更新数据库
 *
 * 使用：
 * node scripts/repair-option-contentfields.mjs --dry-run  # 仅查看需要修复的记录
 * node scripts/repair-option-contentfields.mjs --shop=shop1  # 修复指定店铺
 * node scripts/repair-option-contentfields.mjs  # 修复所有店铺
 */

import { PrismaClient } from '@prisma/client';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

const prisma = new PrismaClient();

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shopArg = args.find(arg => arg.startsWith('--shop='));
const targetShop = shopArg ? shopArg.split('=')[1] : null;

console.log('🔧 PRODUCT_OPTION/METAFIELD contentFields 修复工具');
console.log('='.repeat(60));
console.log(`模式: ${isDryRun ? '🔍 预览模式 (不会修改数据)' : '✏️ 修复模式 (会更新数据库)'}`);
if (targetShop) {
  console.log(`目标店铺: ${targetShop}`);
}
console.log('='.repeat(60));

/**
 * 检查 Shopify GID 格式是否有效
 */
function isValidShopifyGid(value) {
  return typeof value === 'string' && value.startsWith('gid://shopify/');
}

/**
 * 从 GID 提取数字 ID
 */
function extractNumericId(gid) {
  if (!gid || typeof gid !== 'string') return null;
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/**
 * 从 GID 提取资源类型
 */
function extractResourceType(gid) {
  if (!gid || typeof gid !== 'string') return null;
  const match = gid.match(/gid:\/\/shopify\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * 通过 GraphQL 获取 Product Options
 */
async function fetchProductOptions(admin, productGid) {
  const query = `
    query GetProductOptions($id: ID!) {
      product(id: $id) {
        id
        options {
          id
          name
          values
          position
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: { id: productGid }
    });
    const data = await response.json();
    return data?.data?.product?.options || [];
  } catch (error) {
    console.error(`  ❌ GraphQL 获取 options 失败: ${error.message}`);
    return [];
  }
}

/**
 * 通过 GraphQL 获取 Product Metafields
 */
async function fetchProductMetafields(admin, productGid) {
  const query = `
    query GetProductMetafields($id: ID!) {
      product(id: $id) {
        id
        metafields(first: 100) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: { id: productGid }
    });
    const data = await response.json();
    return data?.data?.product?.metafields?.edges?.map(edge => edge.node) || [];
  } catch (error) {
    console.error(`  ❌ GraphQL 获取 metafields 失败: ${error.message}`);
    return [];
  }
}

/**
 * 获取店铺配置和 Admin API 客户端
 */
async function getShopAdminClient(shopId) {
  // 从环境变量或数据库获取店铺配置
  const shopConfig = {
    shop1: {
      shopDomain: process.env.SHOP1_DOMAIN || 'fynony.myshopify.com',
      accessToken: process.env.SHOP1_ACCESS_TOKEN
    },
    shop2: {
      shopDomain: process.env.SHOP2_DOMAIN || 'onewind.myshopify.com',
      accessToken: process.env.SHOP2_ACCESS_TOKEN
    }
  };

  const config = shopConfig[shopId];
  if (!config || !config.accessToken) {
    throw new Error(`无法获取 ${shopId} 的配置信息`);
  }

  const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: ['read_products', 'read_product_listings'],
    hostName: 'localhost',
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: false
  });

  const session = shopify.session.customAppSession(config.shopDomain);
  session.accessToken = config.accessToken;

  return new shopify.clients.Graphql({ session });
}

/**
 * 修复单个 PRODUCT_OPTION 记录
 */
async function repairOption(option, admin) {
  if (!option.gid || !isValidShopifyGid(option.gid)) {
    return { success: false, reason: 'INVALID_GID', details: { gid: option.gid } };
  }

  // 从 GID 推断 product GID
  const optionNumericId = extractNumericId(option.gid);

  // 尝试从 title 或其他字段推断 product
  // 这里需要更复杂的逻辑，暂时返回需要手动处理
  return { success: false, reason: 'CANNOT_INFER_PRODUCT', details: { optionGid: option.gid } };
}

/**
 * 主修复流程
 */
async function main() {
  try {
    // 1. 查询所有 contentFields 为 NULL 的 OPTION/METAFIELD 记录
    const whereClause = {
      resourceType: {
        in: ['PRODUCT_OPTION', 'PRODUCT_METAFIELD']
      },
      contentFields: null
    };

    if (targetShop) {
      whereClause.shopId = targetShop;
    }

    const brokenRecords = await prisma.resource.findMany({
      where: whereClause,
      select: {
        id: true,
        shopId: true,
        resourceType: true,
        gid: true,
        title: true,
        createdAt: true
      },
      orderBy: { shopId: 'asc' }
    });

    console.log(`\n📊 统计信息:`);
    console.log(`  总计找到 ${brokenRecords.length} 条 contentFields 为 NULL 的记录`);

    // 按店铺分组统计
    const byShop = {};
    const byType = {};

    for (const record of brokenRecords) {
      byShop[record.shopId] = (byShop[record.shopId] || 0) + 1;
      byType[record.resourceType] = (byType[record.resourceType] || 0) + 1;
    }

    console.log(`\n  按店铺分布:`);
    for (const [shop, count] of Object.entries(byShop)) {
      console.log(`    ${shop}: ${count} 条`);
    }

    console.log(`\n  按类型分布:`);
    for (const [type, count] of Object.entries(byType)) {
      console.log(`    ${type}: ${count} 条`);
    }

    if (isDryRun) {
      console.log(`\n✅ 预览完成，使用 --shop=shop1 或不带参数来执行实际修复`);
      return;
    }

    // 2. 实际修复（需要实现）
    console.log(`\n⚠️  实际修复功能需要：`);
    console.log(`  1. 配置各店铺的 Shopify Access Token`);
    console.log(`  2. 实现从 OPTION/METAFIELD GID 反向查找 Product 的逻辑`);
    console.log(`  3. 通过 GraphQL 重新获取完整数据`);
    console.log(`  4. 更新数据库 contentFields 字段`);
    console.log(`\n建议：使用"立即发布"功能直接同步，绕过 contentFields 验证`);

  } catch (error) {
    console.error(`\n❌ 执行失败:`, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
