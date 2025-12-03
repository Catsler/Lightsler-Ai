/**
 * 品牌词典服务 - KISS版本
 * 动态从店铺数据中获取品牌信息，用于翻译跳过决策
 */

import { logger } from '../utils/logger.server.js';
import { prisma } from '../db.server.js';
import { createServiceErrorHandler } from '../utils/service-error-handler.server.js';

/**
 * 简单的内存缓存实现
 */
class BrandCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 24 * 60 * 60 * 1000; // 24小时TTL
  }
  
  set(key, value) {
    this.cache.set(key, {
      value,
      expires: Date.now() + this.ttl
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  clear() {
    this.cache.clear();
  }
}

// 全局缓存实例
const brandCache = new BrandCache();

/**
 * 通用词黑名单 - 这些词不应被视为品牌词
 * 来源：常见的店铺装饰词、通用类别词
 */
const GENERIC_VENDOR_BLACKLIST = new Set([
  'home', 'shop', 'new', 'sale', 'collection', 'featured',
  'best', 'top', 'trending', 'popular', 'gift', 'gifts',
  'store', 'official', 'general', 'default', 'brand', 'custom',
  'main', 'premium', 'deluxe', 'limited', 'exclusive', 'special'
]);

/**
 * 获取品牌词典
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} shopDomain - 店铺域名
 * @returns {Set<string>} 品牌词集合
 */
const handleBrandDictionaryError = createServiceErrorHandler('BRAND_DICTIONARY', {
  throwErrors: false,
  getFallbackValue: () => new Set()
});

async function getBrandDictionaryInternal(admin, shopDomain) {
  const cacheKey = `brand_dict:${shopDomain}`;
  
  // 尝试从缓存获取
  const cached = brandCache.get(cacheKey);
  if (cached) {
    logger.debug('使用缓存的品牌词典', { 
      shopDomain, 
      brandCount: cached.size 
    });
    return cached;
  }
  
  const brandSet = new Set();

  const shopName = extractBrandFromDomain(shopDomain);
  if (shopName) {
    brandSet.add(shopName.toLowerCase());
    logger.debug('从域名提取品牌', { shopName });
  }

  const vendors = await getVendorsFromProducts(1000);
  let filteredCount = 0;
  vendors.forEach(vendor => {
    const normalized = vendor.toLowerCase().trim();
    if (normalized.length > 2 && !GENERIC_VENDOR_BLACKLIST.has(normalized)) {
      brandSet.add(normalized);
    } else {
      filteredCount++;
    }
  });

  logger.info('品牌词典构建完成', {
    shopDomain,
    totalBrands: brandSet.size,
    fromDomain: shopName ? 1 : 0,
    fromVendors: vendors.size,
    filteredGeneric: filteredCount
  });

  brandCache.set(cacheKey, brandSet);

  return brandSet;
}

export const getBrandDictionary = handleBrandDictionaryError(getBrandDictionaryInternal);

/**
 * 从域名提取品牌名
 * @param {string} domain - 店铺域名
 * @returns {string|null} 品牌名
 */
function extractBrandFromDomain(domain) {
  try {
    // lightsler-ai.myshopify.com -> lightsler-ai -> Lightsler Ai
    const shopName = domain.split('.')[0];
    
    if (!shopName || shopName.length < 2) {
      return null;
    }
    
    // 处理连字符，转为空格并首字母大写
    const brandName = shopName
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return brandName;
    
  } catch (error) {
    logger.warn('域名解析失败', { domain, error: error.message });
    return null;
  }
}

/**
 * 从产品中获取Vendor列表
 * @param {number} limit - 限制数量
 * @returns {Set<string>} Vendor集合
 */
async function getVendorsFromProducts(limit = 1000) {
  try {
    const products = await prisma.resource.findMany({
      where: { resourceType: 'PRODUCT' },
      select: { contentFields: true },
      take: limit
    });
    
    const vendors = new Set();
    let processedCount = 0;
    
    for (const product of products) {
      const vendor = product.contentFields?.vendor;
      if (vendor && typeof vendor === 'string') {
        const cleanVendor = vendor.trim();
        if (cleanVendor.length > 1) {
          vendors.add(cleanVendor);
          processedCount++;
        }
      }
    }
    
    logger.debug('Vendor提取完成', {
      totalProducts: products.length,
      processedCount,
      uniqueVendors: vendors.size
    });
    
    return vendors;
    
  } catch (error) {
    logger.error('获取Vendor失败', { error: error.message, limit });
    return new Set();
  }
}

/**
 * 检查文本是否匹配品牌词
 * @param {string} text - 待检查文本
 * @param {Set<string>} brandSet - 品牌词集合
 * @returns {boolean} 是否匹配
 */
export function isBrandMatch(text, brandSet) {
  if (!text || !brandSet || brandSet.size === 0) {
    return false;
  }

  const normalized = text.trim().toLowerCase();

  // 1. 精确匹配（最严格）
  if (brandSet.has(normalized)) {
    return true;
  }

  // 2. 词边界匹配（避免误判，仅对长度 >= 4 的品牌词）
  if (text.length < 100) {
    for (const brand of brandSet) {
      // 只对足够长的品牌词进行词边界检查
      if (brand.length >= 4) {
        // 转义正则特殊字符
        const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedBrand}\\b`, 'i');
        if (regex.test(text)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * 清理品牌词典缓存
 * @param {string} shopDomain - 可选，指定店铺域名
 */
export function clearBrandCache(shopDomain = null) {
  if (shopDomain) {
    const cacheKey = `brand_dict:${shopDomain}`;
    brandCache.cache.delete(cacheKey);
    logger.info('已清理指定店铺品牌缓存', { shopDomain });
  } else {
    brandCache.clear();
    logger.info('已清理所有品牌缓存');
  }
}

export default {
  getBrandDictionary,
  isBrandMatch,
  clearBrandCache
};
