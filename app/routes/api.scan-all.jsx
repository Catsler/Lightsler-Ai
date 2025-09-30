import { createApiRoute } from '../utils/base-route.server.js';
import { logger } from '../utils/logger.server.js';

/**
 * 需要串行扫描的资源类型（按优先级划分批次）
 * - 保持与拆分后的 /api/scan-resources 逻辑一致
 * - Theme 资源放在最后，避免影响核心数据同步
 */
const CORE_RESOURCE_TYPES = [
  'PRODUCT',
  'COLLECTION',
  'ARTICLE',
  'BLOG',
  'PAGE',
  'MENU',
  'LINK',
  'FILTER'
];

const SETTING_RESOURCE_TYPES = ['SHOP', 'SHOP_POLICY'];

const PRODUCT_EXTENSION_TYPES = [
  'PRODUCT_OPTION',
  'PRODUCT_OPTION_VALUE',
  'SELLING_PLAN',
  'SELLING_PLAN_GROUP'
];

const THEME_RESOURCE_TYPES = [
  'ONLINE_STORE_THEME_APP_EMBED',
  'ONLINE_STORE_THEME_SECTION_GROUP',
  'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS',
  'ONLINE_STORE_THEME_JSON_TEMPLATE',
  'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
  'ONLINE_STORE_THEME_LOCALE_CONTENT'
];

// Metafields 依赖具体产品上下文，不在全局扫描中暴露
const SCAN_RESOURCE_TYPES = [
  ...CORE_RESOURCE_TYPES,
  ...SETTING_RESOURCE_TYPES,
  ...PRODUCT_EXTENSION_TYPES,
  ...THEME_RESOURCE_TYPES
];

/**
 * 根据资源类型选择合适的抓取逻辑
 * @param {Object} options
 * @param {string} options.type - 资源类型（大写枚举值）
 * @param {any} options.admin - Shopify Admin API 实例
 * @param {Object} options.fetchers - 数据抓取函数集合
 * @returns {Promise<Array>} 对应资源列表
 */
async function fetchResourcesForType({ type, admin, fetchers }) {
  const {
    fetchResourcesByType,
    fetchThemeResources,
    fetchProductOptions,
    fetchSellingPlans,
    fetchShopInfo
  } = fetchers;

  if (type.startsWith('ONLINE_STORE_THEME')) {
    return fetchThemeResources(admin, type);
  }

  switch (type) {
    case 'PRODUCT_OPTION':
    case 'PRODUCT_OPTION_VALUE':
      return fetchProductOptions(admin);
    case 'SELLING_PLAN':
    case 'SELLING_PLAN_GROUP':
      return fetchSellingPlans(admin);
    case 'SHOP':
    case 'SHOP_POLICY':
      return fetchShopInfo(admin, type);
    default:
      return fetchResourcesByType(admin, type);
  }
}

/**
 * 执行全量扫描（保持对外契约不变）
 */
async function handleScanAllResources({ admin, session }) {
  if (!session?.shop) {
    throw new Error('缺少店铺会话信息，无法执行扫描');
  }

  const startTime = Date.now();
  const shopDomain = session.shop;

  const [databaseModule, graphqlModule] = await Promise.all([
    import('../services/database.server.js'),
    import('../services/shopify-graphql.server.js')
  ]);

  const { getOrCreateShop, saveResources } = databaseModule;
  const {
    RESOURCE_TYPES,
    fetchResourcesByType,
    fetchThemeResources,
    fetchProductOptions,
    fetchSellingPlans,
    fetchShopInfo
  } = graphqlModule;

  const resourceSequence = SCAN_RESOURCE_TYPES
    .map((key) => RESOURCE_TYPES[key] || key)
    .filter((value, index, array) => value && array.indexOf(value) === index);

  const shop = await getOrCreateShop(shopDomain, session.accessToken);

  logger.info('开始执行全量资源扫描', {
    shopDomain,
    resourceTypes: resourceSequence
  });

  const summary = [];
  let totalFound = 0;
  let totalSaved = 0;

  for (const resourceType of resourceSequence) {
    const typeStart = Date.now();
    const context = { shopDomain, resourceType };

    try {
      logger.debug('开始扫描资源类型', context);

      const resources = await fetchResourcesForType({
        type: resourceType,
        admin,
        fetchers: {
          fetchResourcesByType,
          fetchThemeResources,
          fetchProductOptions,
          fetchSellingPlans,
          fetchShopInfo
        }
      });

      const durationMs = Date.now() - typeStart;

      if (!Array.isArray(resources) || resources.length === 0) {
        summary.push({
          type: resourceType,
          status: 'empty',
          count: 0,
          saved: 0,
          durationMs
        });
        logger.info('扫描完成 - 未找到资源', { ...context, durationMs });
        continue;
      }

      const savedResources = await saveResources(shop.id, resources);

      totalFound += resources.length;
      totalSaved += savedResources.length;

      summary.push({
        type: resourceType,
        status: 'success',
        count: resources.length,
        saved: savedResources.length,
        durationMs
      });

      logger.info('扫描完成', {
        ...context,
        durationMs,
        found: resources.length,
        saved: savedResources.length
      });
    } catch (error) {
      const durationMs = Date.now() - typeStart;
      logger.error('扫描资源失败', {
        ...context,
        durationMs,
        error: error.message
      });

      summary.push({
        type: resourceType,
        status: 'error',
        count: 0,
        saved: 0,
        durationMs,
        error: error.message
      });
    }
  }

  // 同步 Markets 配置（保持原有异步降级策略）
  import('../services/market-urls.server.js').then(({ syncMarketConfig }) => {
    syncMarketConfig(shop.id, admin).catch((error) => {
      logger.warn('全量扫描完成，但同步 Markets 配置失败', {
        shopDomain,
        error: error.message
      });
    });
  });

  const durationMs = Date.now() - startTime;
  const failures = summary.filter((item) => item.status === 'error').map((item) => item.type);

  logger.info('全量资源扫描结束', {
    shopDomain,
    durationMs,
    totals: {
      types: resourceSequence.length,
      found: totalFound,
      saved: totalSaved,
      failures
    }
  });

  return {
    message: '全量资源扫描完成',
    totals: {
      resourceTypes: resourceSequence.length,
      resourcesFound: totalFound,
      resourcesSaved: totalSaved,
      durationMs
    },
    summary,
    failures,
    finishedAt: new Date().toISOString()
  };
}

export const action = createApiRoute(handleScanAllResources, {
  requireAuth: true,
  operationName: '全量扫描资源'
});
