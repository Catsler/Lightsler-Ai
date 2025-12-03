/**
 * Shopify语言管理服务
 * 提供语言查询、启用和管理功能
 * 基于Shopify GraphQL Admin API 2025-01
 */

import prisma from '../db.server.js';
import { logger as baseLogger } from '../utils/logger.server.js';
import { createServiceErrorHandler } from '../utils/service-error-handler.server.js';

// 创建日志记录器
const localesLogger = {
  info: (message, meta = {}) => baseLogger.info(message, { service: 'shopify-locales', ...meta }),
  error: (message, meta = {}) => baseLogger.error(message, { service: 'shopify-locales', ...meta }),
  warn: (message, meta = {}) => baseLogger.warn(message, { service: 'shopify-locales', ...meta }),
  debug: (message, meta = {}) => baseLogger.debug(message, { service: 'shopify-locales', ...meta })
};

/**
 * 验证语言配置一致性
 * @param {string} code - 语言代码
 * @param {string} name - 语言名称
 * @returns {boolean} 是否一致
 */
function validateLanguageConsistency(code, name) {
  const knownMappings = {
    'de': ['German', '德语', 'Deutsch'],
    'nl': ['Dutch', '荷兰语', 'Nederlands'],
    'en': ['English', '英语'],
    'zh-CN': ['Chinese (Simplified)', '简体中文', '中文'],
    'zh-TW': ['Chinese (Traditional)', '繁体中文'],
    'fr': ['French', '法语', 'Français'],
    'es': ['Spanish', '西班牙语', 'Español'],
    'ja': ['Japanese', '日语', '日本語'],
    'ko': ['Korean', '韩语', '한국어']
  };

  // 如果没有已知映射，则认为是一致的
  if (!knownMappings[code]) {
    return true;
  }

  const validNames = knownMappings[code];
  const isValid = validNames.some(validName =>
    name.toLowerCase().includes(validName.toLowerCase()) ||
    validName.toLowerCase().includes(name.toLowerCase())
  );

  if (!isValid) {
    localesLogger.error(`检测到语言配置错误: code=${code}, name=${name}, 期望name包含: ${validNames.join(', ')}`);
  }

  return isValid;
}

/**
 * 获取Shopify支持的所有可用语言
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 可用语言列表
 */
const handleLocalesServiceError = createServiceErrorHandler('SHOPIFY_LOCALES');

async function getAvailableLocalesInternal(admin) {
  const query = `
    query {
      availableLocales {
        isoCode
        name
      }
    }
  `;

  const response = await admin.graphql(query);
  const result = await response.json();

  if (result.errors) {
    const error = new Error('Failed to fetch available locales');
    error.code = 'SHOPIFY_AVAILABLE_LOCALES_ERROR';
    error.context = { errors: result.errors };
    throw error;
  }

  localesLogger.info(`获取到 ${result.data.availableLocales.length} 种可用语言`);
  return result.data.availableLocales;
}

export const getAvailableLocales = handleLocalesServiceError(getAvailableLocalesInternal);

/**
 * 获取店铺已启用的语言
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 已启用的语言列表
 */
async function getShopLocalesInternal(admin) {
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

  const response = await admin.graphql(query);
  const result = await response.json();

  if (result.errors) {
    const error = new Error('Failed to fetch shop locales');
    error.code = 'SHOPIFY_SHOP_LOCALES_ERROR';
    error.context = { errors: result.errors };
    throw error;
  }

  localesLogger.info(`店铺已启用 ${result.data.shopLocales.length} 种语言`);
  return result.data.shopLocales;
}

export const getShopLocales = handleLocalesServiceError(getShopLocalesInternal);

/**
 * 启用新的语言
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} locale - 语言代码（如 'zh-CN', 'fr', 'es'）
 * @returns {Promise<Object>} 启用的语言信息
 */
async function enableLocaleInternal(admin, locale) {
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

  const response = await admin.graphql(mutation, {
    variables: { locale }
  });
  const result = await response.json();

  if (result.errors) {
    const error = new Error('Failed to enable locale');
    error.code = 'SHOPIFY_ENABLE_LOCALE_ERROR';
    error.context = { errors: result.errors, locale };
    throw error;
  }

  const { userErrors, shopLocale } = result.data.shopLocaleEnable;

  if (userErrors && userErrors.length > 0) {
    const errorMessages = userErrors.map(e => e.message).join(', ');
    const error = new Error(errorMessages);
    error.code = 'SHOPIFY_ENABLE_LOCALE_USER_ERROR';
    error.context = { userErrors, locale };
    throw error;
  }

  localesLogger.info(`成功启用语言: ${shopLocale.locale} (${shopLocale.name})`);
  return shopLocale;
}

export const enableLocale = handleLocalesServiceError(enableLocaleInternal);

/**
 * 禁用语言
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} locale - 语言代码
 * @returns {Promise<Object>} 操作结果
 */
async function disableLocaleInternal(admin, locale) {
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

  const response = await admin.graphql(mutation, {
    variables: { locale }
  });
  const result = await response.json();

  if (result.errors) {
    const error = new Error('Failed to disable locale');
    error.code = 'SHOPIFY_DISABLE_LOCALE_ERROR';
    error.context = { errors: result.errors, locale };
    throw error;
  }

  const { userErrors, locale: disabledLocale } = result.data.shopLocaleDisable;

  if (userErrors && userErrors.length > 0) {
    const errorMessages = userErrors.map(e => e.message).join(', ');
    const error = new Error(errorMessages);
    error.code = 'SHOPIFY_DISABLE_LOCALE_USER_ERROR';
    error.context = { userErrors, locale };
    throw error;
  }

  localesLogger.info(`成功禁用语言: ${disabledLocale}`);
  return { locale: disabledLocale };
}

export const disableLocale = handleLocalesServiceError(disableLocaleInternal);

/**
 * 同步店铺语言到本地数据库
 * @param {string} shopId - 店铺ID
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 同步后的语言列表
 */
async function syncShopLocalesToDatabaseInternal(shopId, admin) {
  const shopLocales = await getShopLocalesInternal(admin);

  const existingLanguages = await prisma.language.findMany({
    where: { shopId }
  });

  const existingCodes = new Set(existingLanguages.map(l => l.code));
  const shopLocaleCodes = new Set(shopLocales.map(l => l.locale));

  const toAdd = shopLocales.filter(l => !existingCodes.has(l.locale));
  const toUpdate = shopLocales.filter(l => existingCodes.has(l.locale));
  const toDisable = existingLanguages.filter(l => !shopLocaleCodes.has(l.code));

  const operations = [];

  for (const locale of toAdd) {
    if (!validateLanguageConsistency(locale.locale, locale.name)) {
      localesLogger.warn(`语言配置不一致，已自动纠正: code=${locale.locale}, name=${locale.name}`);
    }

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

  for (const locale of toUpdate) {
    if (!validateLanguageConsistency(locale.locale, locale.name)) {
      localesLogger.warn(`语言配置不一致，已自动纠正: code=${locale.locale}, name=${locale.name}`);
    }

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

  if (operations.length > 0) {
    await prisma.$transaction(operations);
    localesLogger.info(`同步完成: 添加 ${toAdd.length} 个, 更新 ${toUpdate.length} 个, 禁用 ${toDisable.length} 个语言`);
  } else {
    localesLogger.info('语言已同步，无需更新');
  }

  return prisma.language.findMany({
    where: { shopId, isActive: true },
    orderBy: { name: 'asc' }
  });
}

export const syncShopLocalesToDatabase = handleLocalesServiceError(syncShopLocalesToDatabaseInternal);

/**
 * 检查是否可以添加更多语言
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Object>} 检查结果
 */
async function checkLocaleLimitInternal(admin, shopLocalesOverride) {
  const shopLocales = shopLocalesOverride ?? await getShopLocalesInternal(admin);
  const primaryLocale = shopLocales.find((locale) => locale.primary) || null;
  const alternateLocales = shopLocales.filter((locale) => !locale.primary);
  const maxAlternate = 20;
  const remainingAlternateSlots = Math.max(maxAlternate - alternateLocales.length, 0);

  return {
    primaryLocale: primaryLocale ? formatLocalesForUI([primaryLocale])[0] : null,
    alternateCount: alternateLocales.length,
    maxAlternate,
    canAddMore: alternateLocales.length < maxAlternate,
    remainingAlternateSlots,
    totalLocales: shopLocales.length,
    currentCount: alternateLocales.length,
    maxLimit: maxAlternate,
    remainingSlots: remainingAlternateSlots
  };
}

export const checkLocaleLimit = handleLocalesServiceError(checkLocaleLimitInternal);

/**
 * 格式化语言列表以供UI使用
 * @param {Array} locales - 语言列表
 * @returns {Array} 格式化后的语言选项
 */
export function formatLocalesForUI(locales) {
  return locales.map(locale => ({
    value: locale.isoCode || locale.locale || locale.code,
    label: locale.name || locale.isoCode || locale.locale || locale.code,
    isPrimary: locale.primary || false,
    isPublished: locale.published || locale.isActive || false
  }));
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
