/**
 * Market URLs Service
 * 获取和管理Shopify Markets多语言域名配置
 */

import { logger } from "../utils/logger.server.js";
import { captureError } from "../utils/error-handler.server.js";
import { prisma } from "../db.server.js";
import crypto from 'crypto';

/**
 * 获取Markets和Web Presences配置
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Object|null>} 返回解析后的域名配置或null
 */
export async function getMarketsWebPresences(admin) {
  const query = `
    query getMarketsWebPresences {
      markets(first: 250) {
        nodes {
          id
          name
          enabled
          primary
          webPresences(first: 10) {
            nodes {
              id
              domain {
                host
                url
              }
              subfolderSuffix
              defaultLocale {
                locale
              }
              alternateLocales {
                locale
              }
            }
          }
        }
      }
      shop {
        primaryDomain {
          host
          url
        }
        name
      }
    }
  `;

  try {
    logger.info('开始获取Markets配置');
    
    const response = await admin.graphql(query);
    const { data, errors } = await response.json();
    
    if (errors?.length) {
      logger.warn('Markets API返回错误', { errors });
      await captureError('MARKETS_API_ERROR', new Error(errors[0].message), { errors });
      return null;
    }
    
    if (!data?.markets?.nodes) {
      logger.warn('Markets数据为空');
      return null;
    }
    
    const result = parseMarketsConfig(data);
    logger.info('Markets配置获取成功', { 
      marketsCount: data.markets.nodes.length,
      languagesCount: Object.keys(result.mappings).length 
    });
    
    return result;
  } catch (error) {
    await captureError('MARKETS_FETCH_ERROR', error);
    logger.error('获取Markets配置失败', error);
    return null;
  }
}

/**
 * 解析Markets配置数据
 * @param {Object} data - GraphQL响应数据
 * @returns {Object} 解析后的配置
 */
function parseMarketsConfig(data) {
  const primaryHost = data.shop.primaryDomain.host;
  const primaryUrl = data.shop.primaryDomain.url.replace(/\/$/, ''); // 移除尾部斜杠
  const shopName = data.shop.name;
  
  const mappings = {};
  const marketsList = [];
  
  // 遍历所有市场
  data.markets.nodes.forEach(market => {
    if (!market.enabled) return; // 跳过未启用的市场
    
    const marketInfo = {
      id: market.id,
      name: market.name,
      primary: market.primary,
      languages: []
    };
    
    // 遍历市场的Web Presences
    market.webPresences.nodes.forEach(presence => {
      // 处理主要语言
      const defaultLocale = presence.defaultLocale?.locale;
      
      if (defaultLocale) {
        // 构建语言映射信息
        const localeConfig = {
          locale: defaultLocale,
          marketName: market.name,
          primary: market.primary
        };
        
        // 判断URL类型
        if (presence.subfolderSuffix) {
          // 子路径模式: example.com/fr
          localeConfig.type = 'subfolder';
          localeConfig.suffix = presence.subfolderSuffix;
          localeConfig.url = `${primaryUrl}/${presence.subfolderSuffix}`;
          localeConfig.path = `/${presence.subfolderSuffix}/`;
        } else if (presence.domain) {
          // 子域名或独立域名模式
          const domainHost = presence.domain.host;
          
          if (domainHost !== primaryHost) {
            // 不同的域名（可能是子域名或独立域名）
            if (domainHost.endsWith(primaryHost.replace('www.', ''))) {
              localeConfig.type = 'subdomain';
            } else {
              localeConfig.type = 'domain';
            }
            localeConfig.host = domainHost;
            localeConfig.url = presence.domain?.url?.replace(/\/$/, '') || '';
          } else {
            // 主域名（默认语言）
            localeConfig.type = 'primary';
            localeConfig.host = primaryHost;
            localeConfig.url = primaryUrl;
          }
        }
        
        // 保存映射（保留完整locale，避免冲突）
        mappings[defaultLocale] = localeConfig;
        marketInfo.languages.push({
          locale: defaultLocale,
          type: localeConfig.type,
          url: localeConfig.url
        });
        
        // 处理备用语言
        if (presence.alternateLocales && Array.isArray(presence.alternateLocales)) {
          presence.alternateLocales.forEach(altLocaleObj => {
            const altLocale = altLocaleObj.locale;
            if (altLocale && !mappings[altLocale]) {
              // 备用语言使用相同的URL配置
              mappings[altLocale] = {
                ...localeConfig,
                locale: altLocale,
                isAlternate: true
              };
              
              marketInfo.languages.push({
                locale: altLocale,
                type: localeConfig.type,
                url: localeConfig.url,
                isAlternate: true
              });
            }
          });
        }
      }
    });
    
    if (marketInfo.languages.length > 0) {
      marketsList.push(marketInfo);
    }
  });
  
  return {
    primaryHost,
    primaryUrl,
    shopName,
    mappings,
    markets: marketsList,
    timestamp: new Date().toISOString()
  };
}

/**
 * 获取语言URL配置的简化版本（用于展示）
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 返回语言配置数组
 */
export async function getLanguageUrlsForDisplay(admin) {
  const config = await getMarketsWebPresences(admin);
  
  if (!config) {
    return [];
  }
  
  const languageUrls = [];
  
  // 转换为展示格式
  Object.entries(config.mappings).forEach(([locale, localeConfig]) => {
    languageUrls.push({
      locale,
      name: getLanguageName(locale),
      type: localeConfig.type,
      url: localeConfig.url || config.primaryUrl,
      path: localeConfig.path,
      marketName: localeConfig.marketName,
      isPrimary: localeConfig.primary,
      isAlternate: localeConfig.isAlternate || false
    });
  });
  
  // 按语言代码排序
  languageUrls.sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return a.locale.localeCompare(b.locale);
  });
  
  return languageUrls;
}

/**
 * 获取语言显示名称
 * @param {string} locale - 语言代码
 * @returns {string} 语言显示名称
 */
function getLanguageName(locale) {
  const languageNames = {
    'en': 'English',
    'es': 'Spanish',
    'es-ES': 'Spanish (Spain)',
    'es-MX': 'Spanish (Mexico)',
    'fr': 'French',
    'fr-FR': 'French (France)',
    'fr-CA': 'French (Canada)',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'pt-BR': 'Portuguese (Brazil)',
    'pt-PT': 'Portuguese (Portugal)',
    'nl': 'Dutch',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
    'ru': 'Russian',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'th': 'Thai',
    'tr': 'Turkish',
    'pl': 'Polish',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'bg': 'Bulgarian',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'et': 'Estonian',
    'lv': 'Latvian',
    'lt': 'Lithuanian'
  };
  
  return languageNames[locale] || locale;
}

/**
 * 验证URL格式
 * @param {string} url - URL字符串
 * @returns {boolean} 是否为有效URL
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 标准化URL路径
 * @param {string} url - URL或路径
 * @returns {string} 标准化后的URL
 */
export function normalizeUrl(url) {
  if (!url) return '';
  
  // 移除多余的斜杠
  url = url.replace(/\/+/g, '/');
  
  // 确保URL格式正确
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url.replace(/\/$/, ''); // 移除尾部斜杠
  }
  
  return url;
}

/**
 * 生成配置版本哈希
 * @param {Object} config - 配置对象
 * @returns {string} 哈希值
 */
function generateConfigHash(config) {
  if (!config) return null;
  
  const configString = JSON.stringify(config, Object.keys(config).sort());
  return crypto.createHash('md5').update(configString).digest('hex');
}

/**
 * 同步Markets配置到数据库
 * @param {string} shopId - 店铺ID
 * @param {Object} admin - Admin API客户端
 * @returns {Promise<Object>} 配置对象
 */
export async function syncMarketConfig(shopId, admin) {
  try {
    logger.info('开始同步Markets配置', { shopId });
    
    // 获取最新的Markets配置
    const marketConfig = await getMarketsWebPresences(admin);
    
    if (!marketConfig) {
      logger.warn('无法获取Markets配置', { shopId });
      return null;
    }
    
    // 生成配置版本哈希
    const configVersion = generateConfigHash(marketConfig);
    
    // 检查是否需要更新
    const existingSettings = await prisma.shopSettings.findUnique({
      where: { shopId }
    });
    
    if (existingSettings?.configVersion === configVersion) {
      logger.info('Markets配置未变更，跳过更新', { shopId, configVersion });
      return existingSettings.marketConfig;
    }
    
    // 更新或创建配置
    const settings = await prisma.shopSettings.upsert({
      where: { shopId },
      update: {
        marketConfig,
        marketConfigAt: new Date(),
        configVersion
      },
      create: {
        shopId,
        marketConfig,
        marketConfigAt: new Date(),
        configVersion
      }
    });
    
    logger.info('Markets配置同步成功', { 
      shopId, 
      configVersion,
      languageCount: Object.keys(marketConfig.mappings).length 
    });
    
    return settings.marketConfig;
  } catch (error) {
    await captureError('SYNC_MARKET_CONFIG', error, { shopId });
    logger.error('同步Markets配置失败', error);
    return null;
  }
}

/**
 * 从数据库获取Markets配置
 * @param {string} shopId - 店铺ID
 * @param {number} maxAge - 最大缓存时间（毫秒），默认24小时
 * @returns {Promise<Object|null>} 配置对象
 */
export async function getCachedMarketConfig(shopId, maxAge = 24 * 60 * 60 * 1000) {
  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { shopId }
    });
    
    if (!settings?.marketConfig) {
      logger.info('数据库中无Markets配置', { shopId });
      return null;
    }
    
    // 检查配置是否过期
    if (settings.marketConfigAt) {
      const configAge = Date.now() - new Date(settings.marketConfigAt).getTime();
      
      if (configAge > maxAge) {
        logger.info('Markets配置已过期', { 
          shopId, 
          configAge: Math.round(configAge / 1000 / 60) + '分钟'
        });
        return null;
      }
    }
    
    logger.info('使用缓存的Markets配置', { 
      shopId,
      configVersion: settings.configVersion 
    });
    
    return settings.marketConfig;
  } catch (error) {
    await captureError('GET_CACHED_CONFIG', error, { shopId });
    return null;
  }
}

/**
 * 获取Markets配置（优先缓存，失败时同步）
 * @param {string} shopId - 店铺ID
 * @param {Object} admin - Admin API客户端
 * @returns {Promise<Object>} 配置对象
 */
export async function getMarketConfigWithCache(shopId, admin) {
  try {
    // 先尝试从缓存获取
    let config = await getCachedMarketConfig(shopId);
    
    // 如果缓存不存在或过期，同步新配置
    if (!config && admin) {
      config = await syncMarketConfig(shopId, admin);
    }
    
    return config;
  } catch (error) {
    await captureError('GET_MARKET_CONFIG', error, { shopId });
    return null;
  }
}

/**
 * 清除Markets配置缓存
 * @param {string} shopId - 店铺ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function clearMarketConfigCache(shopId) {
  try {
    await prisma.shopSettings.update({
      where: { shopId },
      data: {
        marketConfig: null,
        marketConfigAt: null,
        configVersion: null
      }
    });
    
    logger.info('Markets配置缓存已清除', { shopId });
    return true;
  } catch (error) {
    await captureError('CLEAR_CONFIG_CACHE', error, { shopId });
    return false;
  }
}

/**
 * 获取店铺URL转换设置
 * @param {string} shopId - 店铺ID
 * @returns {Promise<Object>} 设置对象
 */
export async function getUrlConversionSettings(shopId) {
  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { shopId },
      select: {
        urlStrategy: true,
        enableLinkConversion: true
      }
    });
    
    return settings || {
      urlStrategy: 'subfolder',
      enableLinkConversion: false
    };
  } catch (error) {
    await captureError('GET_URL_SETTINGS', error, { shopId });
    return {
      urlStrategy: 'subfolder',
      enableLinkConversion: false
    };
  }
}

/**
 * 设置链接转换开关
 * @param {string} shopId - 店铺ID
 * @param {boolean} enabled - 是否启用
 * @returns {Promise<Object|null>} 设置结果
 */
export async function setLinkConversionEnabled(shopId, enabled) {
  try {
    const settings = await prisma.shopSettings.upsert({
      where: { shopId },
      update: { enableLinkConversion: enabled },
      create: {
        shopId,
        enableLinkConversion: enabled,
        urlStrategy: 'subfolder'
      }
    });

    logger.info('链接转换设置已更新', {
      eventType: 'linkConversion',
      phase: 'config',
      shopId,
      enabled
    });

    return settings;
  } catch (error) {
    await captureError('SET_LINK_CONVERSION', error, { shopId, enabled });
    return null;
  }
}

/**
 * 更新店铺URL转换设置
 * @param {string} shopId - 店铺ID
 * @param {Object} settings - 设置对象
 * @returns {Promise<boolean>} 是否成功
 */
export async function updateUrlConversionSettings(shopId, settings) {
  try {
    await prisma.shopSettings.upsert({
      where: { shopId },
      update: settings,
      create: {
        shopId,
        ...settings
      }
    });

    logger.info('URL转换设置已更新', { shopId, settings });
    return true;
  } catch (error) {
    await captureError('UPDATE_URL_SETTINGS', error, { shopId, settings });
    return false;
  }
}