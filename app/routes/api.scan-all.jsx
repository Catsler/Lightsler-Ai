import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, saveResources } from "../services/database.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

/**
 * 扫描所有支持的资源类型
 */
export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    // 将服务端导入移到action函数内部，避免Vite构建错误
    const { 
      fetchResourcesByType,
      fetchThemeResources,
      fetchProductOptions,
      fetchSellingPlans,
      fetchShopInfo,
      RESOURCE_TYPES 
    } = await import("../services/shopify-graphql.server.js");
    
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    
    console.log(`开始扫描所有资源类型 - 店铺: ${shopDomain}`);
    
    // 确保店铺记录存在
    const shop = await getOrCreateShop(shopDomain, session.accessToken);
    
    // 定义要扫描的主要资源类型
    const mainResourceTypes = [
      'PRODUCT',
      'COLLECTION',
      'ARTICLE',
      'BLOG',
      'PAGE',
      'MENU',
      'LINK',
      'FILTER'
    ];
    
    const scanResults = {
      success: [],
      failed: [],
      totalScanned: 0
    };
    
    // 扫描主要资源类型
    for (const resourceType of mainResourceTypes) {
      try {
        console.log(`正在扫描 ${resourceType}...`);
        const resources = await fetchResourcesByType(admin, resourceType);
        
        if (resources && resources.length > 0) {
          const saved = await saveResources(shop.id, resources, resourceType);
          scanResults.success.push({
            type: resourceType,
            count: saved.length
          });
          scanResults.totalScanned += saved.length;
          console.log(`✓ ${resourceType}: 扫描并保存了 ${saved.length} 个资源`);
        } else {
          console.log(`✓ ${resourceType}: 没有找到资源`);
        }
      } catch (error) {
        console.error(`✗ ${resourceType} 扫描失败:`, error);
        scanResults.failed.push({
          type: resourceType,
          error: error.message
        });
      }
    }
    
    // 扫描主题相关资源
    const themeResourceTypes = [
      'ONLINE_STORE_THEME_APP_EMBED',
      'ONLINE_STORE_THEME_JSON_TEMPLATE',
      'ONLINE_STORE_THEME_LOCALE_CONTENT',
      'ONLINE_STORE_THEME_SECTION_GROUP',
      'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
      'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS'
    ];
    
    for (const resourceType of themeResourceTypes) {
      try {
        console.log(`正在扫描 ${resourceType}...`);
        const resources = await fetchThemeResources(admin, resourceType);
        
        if (resources && resources.length > 0) {
          const saved = await saveResources(shop.id, resources, resourceType);
          scanResults.success.push({
            type: resourceType,
            count: saved.length
          });
          scanResults.totalScanned += saved.length;
          console.log(`✓ ${resourceType}: 扫描并保存了 ${saved.length} 个资源`);
        }
      } catch (error) {
        console.error(`✗ ${resourceType} 扫描失败:`, error);
        scanResults.failed.push({
          type: resourceType,
          error: error.message
        });
      }
    }
    
    // 扫描产品选项
    try {
      console.log(`正在扫描产品选项...`);
      const productOptions = await fetchProductOptions(admin);
      if (productOptions && productOptions.length > 0) {
        const saved = await saveResources(shop.id, productOptions, 'PRODUCT_OPTION');
        scanResults.success.push({
          type: 'PRODUCT_OPTION',
          count: saved.length
        });
        scanResults.totalScanned += saved.length;
        console.log(`✓ PRODUCT_OPTION: 扫描并保存了 ${saved.length} 个资源`);
      }
    } catch (error) {
      console.error(`✗ PRODUCT_OPTION 扫描失败:`, error);
      scanResults.failed.push({
        type: 'PRODUCT_OPTION',
        error: error.message
      });
    }
    
    // 扫描销售计划
    try {
      console.log(`正在扫描销售计划...`);
      const sellingPlans = await fetchSellingPlans(admin);
      if (sellingPlans && sellingPlans.length > 0) {
        const saved = await saveResources(shop.id, sellingPlans, 'SELLING_PLAN');
        scanResults.success.push({
          type: 'SELLING_PLAN',
          count: saved.length
        });
        scanResults.totalScanned += saved.length;
        console.log(`✓ SELLING_PLAN: 扫描并保存了 ${saved.length} 个资源`);
      }
    } catch (error) {
      console.error(`✗ SELLING_PLAN 扫描失败:`, error);
      scanResults.failed.push({
        type: 'SELLING_PLAN',
        error: error.message
      });
    }
    
    // 扫描店铺信息
    try {
      console.log(`正在扫描店铺信息...`);
      const shopInfo = await fetchShopInfo(admin);
      if (shopInfo) {
        const saved = await saveResources(shop.id, [shopInfo], 'SHOP');
        scanResults.success.push({
          type: 'SHOP',
          count: 1
        });
        scanResults.totalScanned += 1;
        console.log(`✓ SHOP: 扫描并保存了店铺信息`);
      }
    } catch (error) {
      console.error(`✗ SHOP 扫描失败:`, error);
      scanResults.failed.push({
        type: 'SHOP',
        error: error.message
      });
    }
    
    // 同步Markets配置到数据库（异步执行，不阻塞响应）
    import("../services/market-urls.server.js").then(({ syncMarketConfig }) => {
      syncMarketConfig(shop.id, admin).then(config => {
        if (config) {
          console.log(`✓ Markets配置已同步: ${Object.keys(config.mappings || {}).length}种语言`);
        }
      }).catch(err => {
        console.error('✗ Markets配置同步失败:', err);
      });
    });
    
    // 返回扫描结果
    return json({
      success: true,
      message: `扫描完成！共扫描 ${scanResults.totalScanned} 个资源`,
      data: scanResults
    });
    
  }, "扫描所有资源", request.headers.get("shopify-shop-domain") || "");
};