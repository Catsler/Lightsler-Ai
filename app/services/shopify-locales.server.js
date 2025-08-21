/**
 * Shopify语言管理服务
 * 提供语言查询、启用和管理功能
 * 基于Shopify GraphQL Admin API 2025-01
 */

import prisma from '../db.server.js';

// 创建日志记录器
const logger = {
  info: (message, ...args) => console.log(`[shopify-locales] ${message}`, ...args),
  error: (message, ...args) => console.error(`[shopify-locales] ERROR: ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[shopify-locales] WARN: ${message}`, ...args),
  debug: (message, ...args) => console.log(`[shopify-locales] DEBUG: ${message}`, ...args)
};

/**
 * 获取Shopify支持的所有可用语言
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 可用语言列表
 */
export async function getAvailableLocales(admin) {
  const query = `
    query {
      availableLocales {
        isoCode
        name
      }
    }
  `;

  try {
    if (!admin || typeof admin.graphql !== 'function') {
      throw new Error('Invalid admin client provided');
    }
    
    logger.debug('Starting to fetch available locales...');
    const response = await admin.graphql(query);
    
    if (!response) {
      throw new Error('No response received from GraphQL API');
    }
    
    const result = await response.json();
    
    if (result.errors && result.errors.length > 0) {
      logger.error('获取可用语言失败:', result.errors);
      throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    if (!result.data || !result.data.availableLocales) {
      logger.error('Invalid response structure:', result);
      throw new Error('Invalid response structure from availableLocales query');
    }

    const locales = result.data.availableLocales;
    logger.info(`获取到 ${locales.length} 种可用语言`);
    
    // 验证数据完整性
    const validLocales = locales.filter(locale => locale.isoCode && locale.name);
    if (validLocales.length !== locales.length) {
      logger.warn(`过滤了 ${locales.length - validLocales.length} 个无效的语言条目`);
    }
    
    return validLocales;
  } catch (error) {
    logger.error('查询可用语言时出错:', error);
    // 返回一个基本的语言列表作为fallback
    return [
      { isoCode: 'zh-CN', name: 'Chinese (Simplified)' },
      { isoCode: 'en', name: 'English' },
      { isoCode: 'ja', name: 'Japanese' },
      { isoCode: 'ko', name: 'Korean' },
      { isoCode: 'fr', name: 'French' }
    ];
  }
}

/**
 * 获取店铺已启用的语言
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 已启用的语言列表
 */
export async function getShopLocales(admin) {
  const query = `
    query {
      shopLocales {
        locale
        name
        primary
        published
      }
    }
  `;

  try {
    if (!admin || typeof admin.graphql !== 'function') {
      throw new Error('Invalid admin client provided');
    }
    
    logger.debug('Starting to fetch shop locales...');
    const response = await admin.graphql(query);
    
    if (!response) {
      throw new Error('No response received from GraphQL API');
    }
    
    const result = await response.json();
    
    if (result.errors && result.errors.length > 0) {
      logger.error('获取店铺语言失败:', result.errors);
      throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    if (!result.data || !result.data.shopLocales) {
      logger.error('Invalid response structure:', result);
      throw new Error('Invalid response structure from shopLocales query');
    }

    const locales = result.data.shopLocales;
    logger.info(`店铺已启用 ${locales.length} 种语言`);
    
    // 验证数据完整性
    const validLocales = locales.filter(locale => locale.locale && locale.name);
    if (validLocales.length !== locales.length) {
      logger.warn(`过滤了 ${locales.length - validLocales.length} 个无效的店铺语言条目`);
    }
    
    return validLocales;
  } catch (error) {
    logger.error('查询店铺语言时出错:', error);
    // 返回一个基本的默认语言作为fallback
    return [
      { locale: 'en', name: 'English', primary: true, published: true }
    ];
  }
}

/**
 * 启用新的语言
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} locale - 语言代码（如 'zh-CN', 'fr', 'es'）
 * @returns {Promise<Object>} 启用的语言信息
 */
export async function enableLocale(admin, locale) {
  const mutation = `
    mutation enableLocale($locale: String!) {
      shopLocaleEnable(locale: $locale) {
        userErrors {
          message
          field
        }
        shopLocale {
          locale
          name
          primary
          published
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: { locale }
    });
    const result = await response.json();
    
    if (result.errors) {
      logger.error('启用语言失败:', result.errors);
      throw new Error('Failed to enable locale');
    }

    const { userErrors, shopLocale } = result.data.shopLocaleEnable;
    
    if (userErrors && userErrors.length > 0) {
      const errorMessages = userErrors.map(e => e.message).join(', ');
      logger.error(`启用语言 ${locale} 失败:`, errorMessages);
      throw new Error(errorMessages);
    }

    logger.info(`成功启用语言: ${shopLocale.locale} (${shopLocale.name})`);
    return shopLocale;
  } catch (error) {
    logger.error(`启用语言 ${locale} 时出错:`, error);
    throw error;
  }
}

/**
 * 禁用语言
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} locale - 语言代码
 * @returns {Promise<Object>} 操作结果
 */
export async function disableLocale(admin, locale) {
  const mutation = `
    mutation disableLocale($locale: String!) {
      shopLocaleDisable(locale: $locale) {
        userErrors {
          message
          field
        }
        locale
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: { locale }
    });
    const result = await response.json();
    
    if (result.errors) {
      logger.error('禁用语言失败:', result.errors);
      throw new Error('Failed to disable locale');
    }

    const { userErrors, locale: disabledLocale } = result.data.shopLocaleDisable;
    
    if (userErrors && userErrors.length > 0) {
      const errorMessages = userErrors.map(e => e.message).join(', ');
      logger.error(`禁用语言 ${locale} 失败:`, errorMessages);
      throw new Error(errorMessages);
    }

    logger.info(`成功禁用语言: ${disabledLocale}`);
    return { locale: disabledLocale };
  } catch (error) {
    logger.error(`禁用语言 ${locale} 时出错:`, error);
    throw error;
  }
}

/**
 * 同步店铺语言到本地数据库
 * @param {string} shopId - 店铺ID
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 同步后的语言列表
 */
export async function syncShopLocalesToDatabase(shopId, admin) {
  try {
    // 获取店铺已启用的语言
    const shopLocales = await getShopLocales(admin);
    
    // 获取当前数据库中的语言
    const existingLanguages = await prisma.language.findMany({
      where: { shopId }
    });
    
    const existingCodes = new Set(existingLanguages.map(l => l.code));
    const shopLocaleCodes = new Set(shopLocales.map(l => l.locale));
    
    // 找出需要添加的语言
    const toAdd = shopLocales.filter(l => !existingCodes.has(l.locale));
    
    // 找出需要更新的语言
    const toUpdate = shopLocales.filter(l => existingCodes.has(l.locale));
    
    // 找出需要禁用的语言（在数据库中但不在Shopify中）
    const toDisable = existingLanguages.filter(l => !shopLocaleCodes.has(l.code));
    
    // 批量操作
    const operations = [];
    
    // 添加新语言
    for (const locale of toAdd) {
      operations.push(
        prisma.language.create({
          data: {
            shopId,
            code: locale.locale,
            name: locale.name || locale.locale,
            isActive: locale.published
          }
        })
      );
    }
    
    // 更新现有语言
    for (const locale of toUpdate) {
      operations.push(
        prisma.language.update({
          where: {
            shopId_code: {
              shopId,
              code: locale.locale
            }
          },
          data: {
            name: locale.name || locale.locale,
            isActive: locale.published
          }
        })
      );
    }
    
    // 禁用不存在的语言
    for (const language of toDisable) {
      operations.push(
        prisma.language.update({
          where: {
            shopId_code: {
              shopId,
              code: language.code
            }
          },
          data: {
            isActive: false
          }
        })
      );
    }
    
    // 执行所有操作
    if (operations.length > 0) {
      await prisma.$transaction(operations);
      logger.info(`同步完成: 添加 ${toAdd.length} 个, 更新 ${toUpdate.length} 个, 禁用 ${toDisable.length} 个语言`);
    } else {
      logger.info('语言已同步，无需更新');
    }
    
    // 返回更新后的语言列表
    return await prisma.language.findMany({
      where: { shopId, isActive: true },
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    logger.error('同步语言到数据库失败:', error);
    throw error;
  }
}

/**
 * 检查是否可以添加更多语言
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Object>} 检查结果
 */
export async function checkLocaleLimit(admin) {
  try {
    if (!admin) {
      logger.error('Admin client not provided for locale limit check');
      throw new Error('Admin client required');
    }
    
    logger.debug('Checking locale limit...');
    const shopLocales = await getShopLocales(admin);
    const currentCount = Array.isArray(shopLocales) ? shopLocales.length : 0;
    const maxLimit = 20; // Shopify限制最多20个语言
    
    const limitInfo = {
      currentCount,
      maxLimit,
      canAddMore: currentCount < maxLimit,
      remainingSlots: Math.max(0, maxLimit - currentCount)
    };
    
    logger.info('Locale limit check completed:', limitInfo);
    return limitInfo;
  } catch (error) {
    logger.error('检查语言限制失败:', error);
    // 返回安全的默认值
    return {
      currentCount: 1, // 假设至少有一个默认语言
      maxLimit: 20,
      canAddMore: true,
      remainingSlots: 19
    };
  }
}

/**
 * 格式化语言列表以供UI使用
 * @param {Array} locales - 语言列表
 * @returns {Array} 格式化后的语言选项
 */
export function formatLocalesForUI(locales) {
  try {
    if (!Array.isArray(locales)) {
      logger.warn('formatLocalesForUI received non-array input:', typeof locales);
      return [];
    }
    
    return locales
      .filter(locale => locale && typeof locale === 'object') // 过滤无效条目
      .map(locale => {
        const value = locale.isoCode || locale.locale || locale.code;
        const label = locale.name || locale.isoCode || locale.locale || locale.code;
        
        // 确保至少有value和label
        if (!value || !label) {
          logger.warn('Skipping invalid locale entry:', locale);
          return null;
        }
        
        return {
          value,
          label,
          isPrimary: Boolean(locale.primary),
          isPublished: Boolean(locale.published || locale.isActive)
        };
      })
      .filter(Boolean); // 移除null条目
  } catch (error) {
    logger.error('Error in formatLocalesForUI:', error);
    return [];
  }
}

/**
 * 按地区分组语言
 * @param {Array} locales - 语言列表
 * @returns {Object} 按地区分组的语言
 */
export function groupLocalesByRegion(locales) {
  const regions = {
    Asia: ['zh-CN', 'zh-TW', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'hi', 'bn', 'ur', 'ar', 'he', 'fa'],
    Europe: ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'ru', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sr', 'sl', 'uk', 'el', 'tr'],
    Americas: ['en-US', 'es-MX', 'pt-BR', 'fr-CA'],
    Africa: ['af', 'am', 'sw', 'zu', 'yo', 'ig', 'ha'],
    Oceania: ['en-AU', 'en-NZ'],
    Global: ['en']
  };
  
  const grouped = {
    Asia: [],
    Europe: [],
    Americas: [],
    Africa: [],
    Oceania: [],
    Other: []
  };
  
  for (const locale of locales) {
    const code = locale.isoCode || locale.locale || locale.code;
    let placed = false;
    
    for (const [region, codes] of Object.entries(regions)) {
      if (codes.some(c => code.startsWith(c))) {
        if (region === 'Global') {
          grouped.Europe.push(locale); // 将全球语言归入欧洲组
        } else {
          grouped[region].push(locale);
        }
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      grouped.Other.push(locale);
    }
  }
  
  // 按名称排序每个地区的语言
  for (const region of Object.keys(grouped)) {
    grouped[region].sort((a, b) => {
      const nameA = a.name || a.isoCode || '';
      const nameB = b.name || b.isoCode || '';
      return nameA.localeCompare(nameB);
    });
  }
  
  return grouped;
}

export default {
  getAvailableLocales,
  getShopLocales,
  enableLocale,
  disableLocale,
  syncShopLocalesToDatabase,
  checkLocaleLimit,
  formatLocalesForUI,
  groupLocalesByRegion
};