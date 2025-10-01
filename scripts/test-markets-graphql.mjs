/**
 * GraphQL Markets API 验证脚本
 * 用于测试不同版本的 Shopify GraphQL API Markets 查询
 *
 * 使用方式：
 *   node scripts/test-markets-graphql.mjs
 *   node scripts/test-markets-graphql.mjs <shop-domain> <access-token>
 */

import 'dotenv/config';
import fetch from 'node-fetch';

// 配置
const SHOP_DOMAIN = process.argv[2] || process.env.SHOP || '';
const ACCESS_TOKEN = process.argv[3] || process.env.SHOPIFY_API_SECRET || '';

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

// 查询定义
const queries = {
  // 2025-01+ 版本（defaultLocale/alternateLocales 直接返回字符串）
  v2025_01: {
    name: '2025-01+ 版本（字符串类型）',
    query: `
      query testMarketsV2025 {
        markets(first: 1) {
          nodes {
            id
            name
            webPresences(first: 1) {
              nodes {
                id
                defaultLocale
                alternateLocales
              }
            }
          }
        }
      }
    `
  },

  // 最小字段集（最安全）
  minimal: {
    name: '最小字段集',
    query: `
      query testMarketsMinimal {
        markets(first: 1) {
          nodes {
            id
            name
            webPresences(first: 1) {
              nodes {
                id
              }
            }
          }
        }
      }
    `
  },

  // 旧版本（locale 有子字段）
  legacy: {
    name: '旧版本（对象类型）',
    query: `
      query testMarketsLegacy {
        markets(first: 1) {
          nodes {
            id
            name
            webPresences(first: 1) {
              nodes {
                id
                defaultLocale {
                  locale
                  name
                  primary
                }
                alternateLocales {
                  locale
                  name
                  primary
                }
              }
            }
          }
        }
      }
    `
  }
};

// 执行 GraphQL 查询
async function executeQuery(queryDef) {
  const url = `https://${SHOP_DOMAIN}/admin/api/2025-01/graphql.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN
      },
      body: JSON.stringify({ query: queryDef.query })
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      return {
        success: false,
        errors: result.errors
      };
    }

    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 主函数
async function main() {
  log('\n===== Shopify GraphQL Markets API 验证 =====\n', 'cyan');

  // 验证配置
  if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
    log('❌ 缺少配置！', 'red');
    log('\n请提供以下信息：', 'yellow');
    log('  方式1: 设置环境变量', 'yellow');
    log('    SHOP=your-shop.myshopify.com', 'yellow');
    log('    SHOPIFY_API_SECRET=shpat_xxxxx', 'yellow');
    log('  方式2: 命令行参数', 'yellow');
    log('    node scripts/test-markets-graphql.mjs <shop-domain> <token>\n', 'yellow');
    process.exit(1);
  }

  log(`店铺域名: ${SHOP_DOMAIN}`, 'blue');
  log(`Token: ${ACCESS_TOKEN.substring(0, 15)}...\n`, 'blue');

  // 测试所有查询版本
  const results = {};

  for (const [key, queryDef] of Object.entries(queries)) {
    log(`\n📋 测试: ${queryDef.name}`, 'cyan');
    log('─'.repeat(50), 'cyan');

    const result = await executeQuery(queryDef);
    results[key] = result;

    if (result.success) {
      log('✅ 查询成功', 'green');
      log('\n返回数据结构:', 'blue');
      log(JSON.stringify(result.data, null, 2), 'reset');
    } else {
      log('❌ 查询失败', 'red');

      if (result.errors) {
        log('\nGraphQL 错误:', 'red');
        result.errors.forEach((err, idx) => {
          log(`  ${idx + 1}. ${err.message}`, 'red');
          if (err.extensions) {
            log(`     code: ${err.extensions.code}`, 'yellow');
          }
        });
      } else if (result.error) {
        log(`\n错误: ${result.error}`, 'red');
      }
    }
  }

  // 总结
  log('\n\n===== 测试总结 =====\n', 'cyan');

  const successfulQueries = Object.entries(results)
    .filter(([_, result]) => result.success)
    .map(([key, _]) => queries[key].name);

  if (successfulQueries.length === 0) {
    log('❌ 所有查询都失败了', 'red');
    log('\n建议检查：', 'yellow');
    log('  1. Token 是否有效且有正确的权限', 'yellow');
    log('  2. 店铺域名是否正确', 'yellow');
    log('  3. 店铺是否启用了 Markets 功能', 'yellow');
  } else {
    log('✅ 成功的查询版本:', 'green');
    successfulQueries.forEach(name => {
      log(`  • ${name}`, 'green');
    });

    // 推荐使用的版本
    log('\n📌 推荐使用:', 'cyan');
    if (results.v2025_01.success) {
      log('  使用 2025-01+ 版本（字符串类型）', 'green');
      log('  defaultLocale 和 alternateLocales 直接返回字符串', 'blue');
    } else if (results.legacy.success) {
      log('  使用旧版本（对象类型）', 'yellow');
      log('  需要查询 locale 的子字段', 'blue');
    } else if (results.minimal.success) {
      log('  只能使用最小字段集', 'yellow');
      log('  locale 信息不可用', 'red');
    }
  }

  log('\n');
}

// 执行
main().catch(error => {
  log(`\n❌ 脚本执行失败: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
