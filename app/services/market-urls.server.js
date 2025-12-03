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
  // Shopify API 2025-01+: defaultLocale 和 alternateLocales 直接返回字符串
  // 验证脚本: scripts/test-markets-graphql.mjs
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
    logger.info('开始获取Markets配置', { apiVersion: '2025-07' });

    const response = await admin.graphql(query);
    const { data, errors } = await response.json();

    // DEBUG: 原始返回关键字段
    if (data?.markets?.nodes) {
      logger.info('[DEBUG] GraphQL Markets 原始响应', {
        totalMarkets: data.markets.nodes.length,
        shopPrimaryDomain: data.shop?.primaryDomain?.host,
        marketsDetail: data.markets.nodes.map((market) => ({
          marketId: market.id,
          marketName: market.name,
          enabled: market.enabled,
          isPrimary: market.primary,
          webPresencesCount: market.webPresences?.nodes?.length || 0,
          webPresences: (market.webPresences?.nodes || []).map((presence) => ({
            presenceId: presence.id,
            defaultLocale_RAW: presence.defaultLocale,
            defaultLocale_locale: presence.defaultLocale?.locale,
            alternateLocales_RAW: presence.alternateLocales,
            alternateLocales_count:
              Array.isArray(presence.alternateLocales)
                ? presence.alternateLocales.length
                : presence.alternateLocales?.nodes?.length || 0,
            subfolderSuffix: presence.subfolderSuffix,
            domain_host: presence.domain?.host,
            domain_url: presence.domain?.url
          }))
        }))
      });

      const germanyMarket = data.markets.nodes.find(
        (m) =>
          (m.name || '').toLowerCase().includes('german') ||
          (m.name || '').toLowerCase().includes('deutschland') ||
          (m.webPresences?.nodes || []).some(
            (p) =>
              p.defaultLocale?.locale === 'de' ||
              p.defaultLocale?.locale === 'de-de' ||
              p.subfolderSuffix === 'de' ||
              p.subfolderSuffix === 'de-de'
          )
      );

      if (germanyMarket) {
        logger.info('[DEBUG] Germany Market 详细信息', {
          marketId: germanyMarket.id,
          marketName: germanyMarket.name,
          webPresencesRaw: germanyMarket.webPresences?.nodes,
          firstPresence: germanyMarket.webPresences?.nodes?.[0]
        });
      } else {
        logger.warn('[DEBUG] 未找到 Germany Market');
      }
    }

    if (errors?.length) {
      // 记录详细错误（与日志格式一致）
      logger.error('[TRANSLATION] 获取Markets配置失败', {
        response: {},
        headers: response.headers?.raw?.() || {},
        body: {
          headers: {},
          errors: {
            networkStatusCode: response.status || 200,
            message: 'GraphQL Client: An error occurred while fetching from the API. Review \'graphQLErrors\' for details.',
            graphQLErrors: errors,
            response: {}
          }
        }
      });
      await captureError('MARKETS_API_ERROR', new Error(errors[0].message), { errors });

      // 降级：尝试最小字段集查询
      logger.info('尝试降级到最小字段集查询');
      return await getMarketsWebPresencesMinimal(admin);
    }

    if (!data?.markets?.nodes) {
      logger.warn('Markets数据为空');
      return null;
    }

    const result = parseMarketsConfig(data);

    // 结构化日志（用于统计）
    logger.info('[METRICS]', {
      type: 'graphql_markets_success',
      markets_count: data.markets.nodes.length,
      languages_count: Object.keys(result.mappings || {}).length,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    await captureError('MARKETS_FETCH_ERROR', error);
    logger.error('[TRANSLATION] 获取Markets配置失败', error);
    return null;
  }
}

/**
 * 降级方案：使用最小字段集查询 Markets
 * 当标准查询失败时使用（例如 API 版本不兼容）
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Object|null>} 返回基础配置或null
 */
async function getMarketsWebPresencesMinimal(admin) {
  const minimalQuery = `
    query getMarketsWebPresencesMinimal {
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
    logger.info('使用最小字段集查询Markets');

    const response = await admin.graphql(minimalQuery);
    const { data, errors } = await response.json();

    if (errors?.length) {
      logger.error('最小字段集查询也失败', { errors });
      return null;
    }

    if (!data?.markets?.nodes) {
      return null;
    }

    // 解析最小字段集数据（不包含 locale 信息）
    const result = parseMarketsConfig(data);
    logger.warn('Markets配置获取成功（使用降级方案，无locale信息）', {
      marketsCount: data.markets.nodes.length
    });

    return result;
  } catch (error) {
    logger.error('降级查询失败', error);
    return null;
  }
}

/**
 * 解析Markets配置数据
 * @param {Object} data - GraphQL响应数据
 * @returns {Object} 解析后的配置
 */
/**
 * 提取 Locale 信息
 * 根据 Shopify GraphQL Admin API 2025-01 规范，ShopLocale.locale 直接是 String 类型
 * @param {Object|string} shopLocale - ShopLocale 对象或语言代码字符串
 * @returns {{ code: string | null, tag: string | null }}
 */
function getLocaleInfo(shopLocale) {
  // 🆕 处理直接传入字符串的情况
  if (typeof shopLocale === 'string') {
    return { code: shopLocale, tag: shopLocale };
  }

  // 处理对象的情况
  if (!shopLocale || typeof shopLocale !== 'object') {
    return { code: null, tag: null };
  }

  // ShopLocale.locale 直接是 String（ISO 代码，如 "en"、"fr"、"zh-CN"）
  const locale = typeof shopLocale.locale === 'string' ? shopLocale.locale : null;

  return {
    code: locale,    // ISO 代码
    tag: locale      // 语言标签（使用相同值）
  };
}

/**
 * 将 GraphQL 返回的 alternateLocales 统一为数组
 * @param {unknown} raw
 * @returns {Array<unknown>}
 */
function normalizeLocaleEntries(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw;
  }

  // 支持 { nodes: [...] } 或 { edges: [{ node: ... }] }
  if (Array.isArray(raw.nodes)) {
    return raw.nodes;
  }
  if (Array.isArray(raw.edges)) {
    return raw.edges
      .map((edge) => edge && typeof edge === 'object' ? edge.node : null)
      .filter(Boolean);
  }

  return [];
}

/**
 * 构建包含市场后缀的子路径片段（支持 de-de / en-eu 等）
 * @param {string} locale - 语言代码
 * @param {string} subfolderSuffix - 市场后缀
 * @returns {string} 规范化后的子路径片段
 */
export function buildSubfolderSegment(locale, subfolderSuffix) {
  const localePart = (locale || '').toLowerCase();
  const rawSuffix = (subfolderSuffix || '').toLowerCase().replace(/^\/+|\/+$/g, '');

  // 规则 1：无自定义后缀 → 回退到语言码
  if (!rawSuffix) return localePart;

  // 规则 2：locale 已包含连字符（已是完整形式，如 en-gb），suffix 视为市场路径，保持原样
  if (localePart.includes('-')) {
    return rawSuffix;
  }

  // 规则 3：suffix 已包含连字符（商家已配置完整路径），保持原样
  if (rawSuffix.includes('-')) {
    return rawSuffix;
  }

  // 规则 4：suffix 等于 locale（单一市场），保持原样
  if (rawSuffix === localePart) {
    return localePart;
  }

  // 规则 5：简单语言码 + 纯市场后缀 → 组合语言-市场
  return `${localePart}-${rawSuffix}`;
}

export function parseMarketsConfig(data) {
  const primaryHost = data.shop.primaryDomain.host;
  const primaryUrl = data.shop.primaryDomain.url.replace(/\/$/, ''); // 移除尾部斜杠
  const shopName = data.shop.name;

  const mappings = {};
  const mappingVariants = {};
  const marketsList = [];

    const markets = Array.isArray(data.markets?.nodes) ? data.markets.nodes : [];

    markets.forEach((market) => {
      if (!market?.enabled) return;

      // DEBUG: 记录市场和 webPresence 规范化前后信息
      const presences = Array.isArray(market.webPresences?.nodes) ? market.webPresences.nodes : [];
      presences.forEach((presence, idx) => {
        const localeInfo = getLocaleInfo(presence?.defaultLocale);
        const normalizedSegment = buildSubfolderSegment(localeInfo.code, presence?.subfolderSuffix);
        logger.info(`[DEBUG] WebPresence ${idx + 1}/${presences.length}`, {
          marketName: market.name,
          defaultLocale_RAW: presence?.defaultLocale,
          defaultLocale_code: localeInfo.code,
          subfolderSuffix_RAW: presence?.subfolderSuffix,
          normalizedSegment,
          isNormalized: presence?.subfolderSuffix === normalizedSegment
        });
      });

      const marketInfo = {
        id: market.id,
        name: market.name,
        primary: market.primary,
        languages: []
      };

      presences.forEach((presence) => {
        const defaultLocaleInfo = getLocaleInfo(presence?.defaultLocale);
        const defaultLocale = defaultLocaleInfo.code;

      if (!defaultLocale) {
        return;
      }

      const localeConfig = {
        locale: defaultLocale,
        languageTag: defaultLocaleInfo.tag,
        marketName: market.name,
        primary: market.primary
      };

      if (presence?.subfolderSuffix) {
        // 子路径模式: example.com/fr
        const subfolderSegment = buildSubfolderSegment(defaultLocale, presence.subfolderSuffix);
        localeConfig.type = 'subfolder';
        localeConfig.suffix = subfolderSegment;
        localeConfig.url = `${primaryUrl}/${subfolderSegment}`;
        localeConfig.path = `/${subfolderSegment}/`;
      } else if (presence?.domain) {
        const domainHost = presence.domain.host;

        if (domainHost && domainHost !== primaryHost) {
          // 不同域名（可能是子域名或独立域名）
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
      } else {
        // 没有子路径也没有域名时归类为 primary
        localeConfig.type = 'primary';
        localeConfig.host = primaryHost;
        localeConfig.url = primaryUrl;
      }

      // 记录单一映射：主市场优先覆盖
      if (!mappings[defaultLocale] || market.primary) {
        mappings[defaultLocale] = localeConfig;
      }

      // 记录多映射列表，供展示多市场路径
      if (!mappingVariants[defaultLocale]) {
        mappingVariants[defaultLocale] = [];
      }
      mappingVariants[defaultLocale].push(localeConfig);
      marketInfo.languages.push({
        locale: defaultLocale,
        languageTag: defaultLocaleInfo.tag,
        type: localeConfig.type,
        url: localeConfig.url
      });

      const alternateLocales = normalizeLocaleEntries(presence?.alternateLocales);
      alternateLocales.forEach((alternateEntry) => {
        const alternateInfo = getLocaleInfo(alternateEntry);
        const altLocale = alternateInfo.code;
        if (!altLocale) return;

        let altConfig = {
          ...localeConfig,
          locale: altLocale,
          languageTag: alternateInfo.tag,
          isAlternate: true
        };

        if (localeConfig.type === 'subfolder' && presence?.subfolderSuffix) {
          const altSegment = buildSubfolderSegment(altLocale, presence.subfolderSuffix);
          altConfig = {
            ...altConfig,
            suffix: altSegment,
            url: `${primaryUrl}/${altSegment}`,
            path: `/${altSegment}/`
          };
        }

        if (!mappingVariants[altLocale]) {
          mappingVariants[altLocale] = [];
        }
        mappingVariants[altLocale].push(altConfig);
        if (!mappings[altLocale] || market.primary) {
          mappings[altLocale] = altConfig;
        }
        marketInfo.languages.push({
          locale: altLocale,
          languageTag: alternateInfo.tag,
          type: altConfig.type,
          url: altConfig.url,
          isAlternate: true
        });
      });
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
    mappingVariants,
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
 * 获取按市场分组的语言URL配置
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Array>} 返回按市场分组的语言配置
 */
export async function getMarketsLanguagesGrouped(admin) {
  const { getShopLocales } = await import("./shopify-locales.server.js");

  try {
    const [config, shopLocales] = await Promise.all([
      getMarketsWebPresences(admin),
      getShopLocales(admin).catch(err => {
        logger.warn('获取shopLocales失败', err);
        return [];
      })
    ]);

    if (!config?.markets) {
      logger.info('无Markets配置');
      return [];
    }

    // 增强每个市场的语言元数据
    const enhancedMarkets = config.markets.map(market => {
      const enhancedLanguages = market.languages.map(lang => {
        const localeKey = (lang.locale || '').toLowerCase();
        const shopLocale = shopLocales.find(l => (l.locale || '').toLowerCase() === localeKey);
        const localeConfig = config.mappings[lang.locale] || config.mappings[localeKey] || {};

        return {
          locale: lang.locale,
          name: shopLocale?.name || getLanguageName(lang.locale),
          type: lang.type,
          url: lang.url || localeConfig.url || `${config.primaryUrl}/${lang.locale}`,
          path: localeConfig.path,
          suffix: localeConfig.suffix,
          marketName: market.name,
          published: shopLocale?.published ?? false,
          primary: shopLocale?.primary ?? false,
          isAlternate: lang.isAlternate || false
        };
      });

      return {
        marketId: market.id,
        marketName: market.name,
        isPrimaryMarket: market.primary,
        languageCount: enhancedLanguages.length,
        languages: enhancedLanguages.sort((a, b) => {
          // 默认语言排在前面
          if (a.primary) return -1;
          if (b.primary) return 1;
          return a.locale.localeCompare(b.locale);
        })
      };
    });

    logger.info('按市场分组的语言配置生成成功', {
      marketsCount: enhancedMarkets.length,
      totalLanguages: enhancedMarkets.reduce((sum, m) => sum + m.languageCount, 0)
    });

    return enhancedMarkets;
  } catch (error) {
    await captureError('GET_MARKETS_LANGUAGES_GROUPED', error);
    logger.error('获取市场语言分组失败', error);
    return [];
  }
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
 * 更新语言的发布状态
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} locale - 语言代码
 * @param {boolean} published - 是否发布
 */
export async function updateShopLocalePublishStatus(admin, locale, published) {
  const mutation = `#graphql
    mutation shopLocaleUpdate($locale: String!, $shopLocale: ShopLocaleInput!) {
      shopLocaleUpdate(locale: $locale, shopLocale: $shopLocale) {
        shopLocale {
          locale
          published
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        locale,
        shopLocale: { published }
      }
    });

    const payload = await response.json();
    const result = payload?.data?.shopLocaleUpdate;
    const errors = result?.userErrors || payload?.errors;

    if (errors?.length) {
      const message = errors.map((e) => e.message || JSON.stringify(e)).join('; ');
      throw new Error(message);
    }

    return result?.shopLocale || null;
  } catch (error) {
    await captureError('SHOP_LOCALE_UPDATE', error, { locale, published });
    logger.error('更新语言发布状态失败', { locale, published, error: error?.message });
    throw error;
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
export async function syncMarketConfig(shopId, admin, forceRefresh = false) {
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
    
    if (!forceRefresh && existingSettings?.configVersion === configVersion) {
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

/**
 * 获取链接转换配置（供翻译路由使用）
 * @param {string} shopId - 店铺ID
 * @param {Object} admin - Admin API客户端（可选）
 * @param {string} targetLang - 目标语言
 * @returns {Promise<Object|null>} linkConversion配置对象，关闭时返回null
 */
export async function getLinkConversionConfig(shopId, admin, targetLang) {
  try {
    // 1. 先读缓存
    let marketConfig = await getCachedMarketConfig(shopId).catch(() => null);

    // 2. 缓存不存在且有admin，尝试同步
    if (!marketConfig && admin) {
      marketConfig = await syncMarketConfig(shopId, admin).catch(() => null);
    }

    // 3. 获取URL转换设置
    const urlSettings = await getUrlConversionSettings(shopId).catch(() => null);

    // 4. 读取环境变量默认值
    const { getConfig } = await import('../utils/config.server.js');
    const config = getConfig();
    const envConfig = config.linkConversion;

    // 5. 判断是否启用（数据库优先）
    const enabled = urlSettings?.enableLinkConversion ?? envConfig.enabled;

    // 6. 未启用或无配置，返回null
    if (!enabled || !marketConfig) {
      return null;
    }

    // 7. 返回完整配置
    const strategy = urlSettings?.urlStrategy || envConfig.strategy;
    return {
      enabled: true,
      locale: targetLang,
      marketConfig: marketConfig,
      options: {
        strategy,
        preserveQueryParams: true,
        preserveAnchors: true
      }
    };
  } catch (error) {
    logger.error('获取链接转换配置失败', error);
    await captureError('GET_LINK_CONVERSION_CONFIG', error, { shopId, targetLang });
    return null;  // 失败时返回null，不阻塞翻译
  }
}
