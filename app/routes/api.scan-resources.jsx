import { getOrCreateShop, saveResources } from "../services/database.server.js";
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 通用资源扫描API
 * 支持多种资源类型：PRODUCT, COLLECTION, ARTICLE, BLOG, PAGE, MENU, FILTER
 */
async function handleScanResources({ request, admin, session }) {
  // 将服务端导入移到action函数内部，避免Vite构建错误
  const {
    fetchResourcesByType,
    fetchThemeResources,
    fetchProductOptions,
    fetchSellingPlans,
    fetchShopInfo,
    RESOURCE_TYPES
  } = await import("../services/shopify-graphql.server.js");

  const shopDomain = session.shop;

  // 解析请求体
  const body = await request.json();
  const { resourceType } = body;

  // 验证资源类型
  if (!resourceType || !Object.values(RESOURCE_TYPES).includes(resourceType.toUpperCase())) {
    throw new Error(`不支持的资源类型: ${resourceType}。支持的类型: ${Object.values(RESOURCE_TYPES).join(', ')}`);
  }

  const normalizedResourceType = resourceType.toUpperCase();

  console.log(`开始扫描${normalizedResourceType}资源 - 店铺: ${shopDomain}`);

  // 确保店铺记录存在
  const shop = await getOrCreateShop(shopDomain, session.accessToken);

  // 根据资源类型使用相应的获取函数
  let resources = [];

  // Theme相关资源
  if (normalizedResourceType.startsWith('ONLINE_STORE_THEME')) {
    resources = await fetchThemeResources(admin, normalizedResourceType);
  }
  // 产品选项和选项值
  else if (normalizedResourceType === 'PRODUCT_OPTION' || normalizedResourceType === 'PRODUCT_OPTION_VALUE') {
    resources = await fetchProductOptions(admin);
  }
  // 销售计划
  else if (normalizedResourceType === 'SELLING_PLAN' || normalizedResourceType === 'SELLING_PLAN_GROUP') {
    resources = await fetchSellingPlans(admin);
  }
  // 店铺信息和政策
  else if (normalizedResourceType === 'SHOP' || normalizedResourceType === 'SHOP_POLICY') {
    resources = await fetchShopInfo(admin, normalizedResourceType);
  }
  // 其他现有资源类型
  else {
    resources = await fetchResourcesByType(admin, normalizedResourceType);
  }

  if (resources.length === 0) {
    return {
      message: `未找到任何${normalizedResourceType}资源`,
      resources: [],
      count: 0
    };
  }

  // 保存资源到数据库
  console.log(`开始保存${resources.length}个${normalizedResourceType}资源到数据库`);
  const savedResources = await saveResources(shop.id, resources);

  // 同步Markets配置到数据库（异步执行，不阻塞响应）
  import("../services/market-urls.server.js").then(({ syncMarketConfig }) => {
    syncMarketConfig(shop.id, admin).catch(err => {
      console.error('同步Markets配置失败:', err);
    });
  });

  console.log(`${normalizedResourceType}资源扫描完成:`, {
    shopDomain,
    resourceType: normalizedResourceType,
    totalFound: resources.length,
    totalSaved: savedResources.length
  });

  return {
    message: `成功扫描${savedResources.length}个${normalizedResourceType}资源`,
    resources: savedResources,
    count: savedResources.length,
    resourceType: normalizedResourceType
  };
}

/**
 * GET请求处理函数 - 获取资源类型配置信息
 */
async function handleGetResourceTypes({ request }) {
  const { RESOURCE_TYPES } = await import("../services/shopify-graphql.server.js");

  return {
    supportedResourceTypes: Object.values(RESOURCE_TYPES),
    resourceTypeDescriptions: {
      PRODUCT: '产品',
      COLLECTION: '产品集合',
      ARTICLE: '博客文章',
      BLOG: '博客',
      PAGE: '页面',
      MENU: '菜单',
      LINK: '链接',
      FILTER: '过滤器'
    }
  };
}

export const action = createApiRoute(handleScanResources, {
  requireAuth: true,
  operationName: '扫描资源'
});

export const loader = createApiRoute(handleGetResourceTypes, {
  requireAuth: true,
  operationName: '获取资源类型配置'
});