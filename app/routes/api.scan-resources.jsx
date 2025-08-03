import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, saveResources } from "../services/database.server.js";
import { 
  fetchResourcesByType, 
  RESOURCE_TYPES 
} from "../services/shopify-graphql.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

/**
 * 通用资源扫描API
 * 支持多种资源类型：PRODUCT, COLLECTION, ARTICLE, BLOG, PAGE, MENU, FILTER
 */
export const action = withErrorHandling(async ({ request }) => {
  // 验证Shopify应用认证
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // 解析请求体
  const body = await request.json();
  const { resourceType } = body;

  // 验证资源类型
  if (!resourceType || !Object.values(RESOURCE_TYPES).includes(resourceType.toUpperCase())) {
    return json({
      success: false,
      error: `不支持的资源类型: ${resourceType}。支持的类型: ${Object.values(RESOURCE_TYPES).join(', ')}`
    }, { status: 400 });
  }

  const normalizedResourceType = resourceType.toUpperCase();
  
  try {
    console.log(`开始扫描${normalizedResourceType}资源 - 店铺: ${shopDomain}`);

    // 确保店铺记录存在
    const shop = await getOrCreateShop(shopDomain, session.accessToken);

    // 使用通用函数获取资源
    const resources = await fetchResourcesByType(admin, normalizedResourceType);
    
    if (resources.length === 0) {
      return json({
        success: true,
        message: `未找到任何${normalizedResourceType}资源`,
        resources: [],
        count: 0
      });
    }

    // 保存资源到数据库
    console.log(`开始保存${resources.length}个${normalizedResourceType}资源到数据库`);
    const savedResources = await saveResources(shop.id, resources);

    console.log(`${normalizedResourceType}资源扫描完成:`, {
      shopDomain,
      resourceType: normalizedResourceType,
      totalFound: resources.length,
      totalSaved: savedResources.length
    });

    return json({
      success: true,
      message: `成功扫描${savedResources.length}个${normalizedResourceType}资源`,
      resources: savedResources,
      count: savedResources.length,
      resourceType: normalizedResourceType
    });

  } catch (error) {
    console.error(`${normalizedResourceType}资源扫描失败:`, error);
    throw error; // withErrorHandling会处理这个错误
  }
});

// 资源类型配置信息
export const loader = async ({ request }) => {
  return json({
    supportedResourceTypes: Object.values(RESOURCE_TYPES),
    resourceTypeDescriptions: {
      [RESOURCE_TYPES.PRODUCT]: '产品',
      [RESOURCE_TYPES.COLLECTION]: '产品集合',
      [RESOURCE_TYPES.ARTICLE]: '博客文章',
      [RESOURCE_TYPES.BLOG]: '博客',
      [RESOURCE_TYPES.PAGE]: '页面',
      [RESOURCE_TYPES.MENU]: '菜单',
      [RESOURCE_TYPES.LINK]: '链接',
      [RESOURCE_TYPES.FILTER]: '过滤器'
    }
  });
};