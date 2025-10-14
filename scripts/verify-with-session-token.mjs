#!/usr/bin/env node
/**
 * 对比数据库 syncStatus 与 Shopify 实际翻译状态（使用 Session token）
 *
 * 依赖：从 Session 表读取 OAuth access token，调用 Shopify GraphQL API
 *
 * Access Token 获取方式：
 *   从 Session 表读取最新有效的 offline access token：
 *   SELECT accessToken FROM Session
 *   WHERE shop = 'sshvdt-ai.myshopify.com'
 *     AND isOnline = false
 *   ORDER BY expires DESC
 *   LIMIT 1
 *
 * 用法：
 *   node scripts/verify-with-session-token.mjs --shopId=sshvdt-ai.myshopify.com --language=da --sample=5
 *   node scripts/verify-with-session-token.mjs --shopId=sshvdt-ai.myshopify.com --language=ja --sample=10 --resourceType=PRODUCT_METAFIELD
 *
 * 参数：
 *   --shopId       (必填) 店铺ID（Shopify domain）
 *   --language     (必填) 语言代码（如 da, et, ja）
 *   --sample       (可选) 抽样数量，默认5
 *   --resourceType (可选) 资源类型，默认PRODUCT_OPTION
 *
 * 输出格式：
 *   1. 表格：ID | Resource | Lang | DB | Shopify
 *      - DB：数据库 syncStatus (pending/synced/failed)
 *      - Shopify：HAS_TRANSLATION 或 NO_TRANSLATION 或 ERROR
 *
 *   2. JSON（不一致记录）：
 *      {
 *        "translationId": "cmgilptkd0001ozf3x7v41xny",
 *        "resourceTitle": "Color",
 *        "language": "da",
 *        "dbStatus": "pending",
 *        "shopifyStatus": "HAS_TRANSLATION",
 *        "shopifyTranslationCount": 1,
 *        "mismatch": true
 *      }
 *
 * 提取 translationId 用于修复：
 *   cat verify-results.log | grep -A 9999 '不一致记录详情（JSON）' | jq '.[].translationId'
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

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

// 从 Session 表获取有效的 access token
async function getAccessToken(shopDomain) {
  const session = await prisma.session.findFirst({
    where: {
      shop: shopDomain,
      isOnline: false
    },
    orderBy: {
      expires: 'desc'
    }
  });

  if (!session) {
    throw new Error(`未找到店铺 ${shopDomain} 的有效 Session`);
  }

  if (!session.accessToken) {
    throw new Error(`Session 中缺少 accessToken`);
  }

  // 检查是否过期
  if (session.expires && new Date(session.expires) < new Date()) {
    throw new Error(`Session 已过期: ${session.expires}`);
  }

  return session.accessToken;
}

// 查询 Shopify translationsRegister
async function queryShopifyTranslations(shopDomain, accessToken, resourceGid, locale) {
  const query = `
    query getTranslations($resourceId: ID!, $locale: String!) {
      translatableResource(resourceId: $resourceId) {
        resourceId
        translations(locale: $locale) {
          key
          value
          locale
        }
      }
    }
  `;

  const url = `https://${shopDomain}/admin/api/2025-07/graphql.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query,
        variables: { resourceId: resourceGid, locale }
      })
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const result = await response.json();

    if (result.errors) {
      return { error: result.errors[0].message };
    }

    return { data: result.data };
  } catch (error) {
    return { error: error.message };
  }
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
  const language = params.language;
  const sample = parseInt(params.sample) || 5;
  const resourceType = params.resourceType || 'PRODUCT_OPTION';

  log('\n===== Shopify 同步状态验证（使用 Session Token）=====\n', 'cyan');
  log(`店铺: ${shopId}`, 'blue');
  log(`语言: ${language}`, 'blue');
  log(`资源类型: ${resourceType}`, 'blue');
  log(`抽样数量: ${sample}\n`, 'blue');

  // 获取 access token
  log('🔑 从 Session 表获取 access token...', 'yellow');
  let accessToken;
  try {
    accessToken = await getAccessToken(shopId);
    log(`✅ Access token 获取成功 (${accessToken.substring(0, 10)}...)\n`, 'green');
  } catch (error) {
    log(`❌ 获取 access token 失败: ${error.message}`, 'red');
    await prisma.$disconnect();
    process.exit(1);
  }

  // 查询数据库中 pending 的翻译
  const translations = await prisma.translation.findMany({
    where: {
      resource: {
        resourceType: resourceType,
        shopId: shopId
      },
      syncStatus: 'pending',
      language: language
    },
    include: {
      resource: {
        select: {
          id: true,
          gid: true,
          title: true,
          resourceType: true
        }
      }
    },
    take: sample
  });

  if (translations.length === 0) {
    log('✅ 没有找到符合条件的 pending 翻译', 'green');
    await prisma.$disconnect();
    return;
  }

  log(`找到 ${translations.length} 条 pending 翻译，开始验证...\n`, 'cyan');

  // 验证每条翻译
  const results = [];

  for (const translation of translations) {
    const resourceGid = translation.resource.gid;
    const resourceTitle = translation.resource.title;

    log(`验证: ${resourceTitle} (${language})...`, 'yellow');

    const shopifyResult = await queryShopifyTranslations(
      shopId,
      accessToken,
      resourceGid,
      language
    );

    if (shopifyResult.error) {
      results.push({
        translationId: translation.id,
        resourceTitle,
        language,
        dbStatus: 'pending',
        shopifyStatus: 'ERROR',
        error: shopifyResult.error,
        mismatch: true
      });
      continue;
    }

    const shopifyTranslations = shopifyResult.data?.translatableResource?.translations || [];
    const hasShopifyTranslation = shopifyTranslations.length > 0;

    results.push({
      translationId: translation.id,
      resourceTitle,
      language,
      dbStatus: 'pending',
      shopifyStatus: hasShopifyTranslation ? 'HAS_TRANSLATION' : 'NO_TRANSLATION',
      shopifyTranslationCount: shopifyTranslations.length,
      mismatch: hasShopifyTranslation // pending但Shopify有翻译 = 不一致
    });
  }

  // 输出结果
  log('\n===== 验证结果 =====\n', 'cyan');

  const mismatches = results.filter(r => r.mismatch);

  if (mismatches.length === 0) {
    log('✅ 所有记录一致：数据库pending，Shopify也无翻译', 'green');
  } else {
    log(`⚠️  发现 ${mismatches.length} 条不一致记录：\n`, 'yellow');

    // 表格头
    console.log('ID'.padEnd(30) + 'Resource'.padEnd(30) + 'Lang'.padEnd(8) + 'DB'.padEnd(12) + 'Shopify');
    console.log('-'.repeat(100));

    mismatches.forEach(r => {
      const id = r.translationId.substring(0, 28);
      const title = r.resourceTitle.substring(0, 28);
      const lang = r.language;
      const dbStatus = r.dbStatus;
      const shopifyStatus = r.shopifyStatus;

      console.log(
        id.padEnd(30) +
        title.padEnd(30) +
        lang.padEnd(8) +
        dbStatus.padEnd(12) +
        shopifyStatus
      );
    });

    log('\n不一致记录详情（JSON）：', 'cyan');
    console.log(JSON.stringify(mismatches, null, 2));
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
