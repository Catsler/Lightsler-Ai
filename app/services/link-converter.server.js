/**
 * 链接转换服务
 * 将内容中的链接转换为目标语言的域名格式
 */

import { logger } from "../utils/logger.server.js";
import { captureError } from "../utils/error-handler.server.js";
import { getLocalizedErrorMessage } from "../utils/error-messages.server.js";
import { collectError, ERROR_TYPES } from "./error-collector.server.js";

/**
 * 转换HTML内容中的链接
 * @param {string} html - HTML内容
 * @param {string} targetLocale - 目标语言代码（如 fr, de, zh-CN）
 * @param {Object} marketConfig - Markets配置对象
 * @param {Object} options - 转换选项
 * @returns {string} 转换后的HTML内容
 */
export function convertLinksForLocale(html, targetLocale, marketConfig, options = {}) {
  if (!html || !targetLocale || !marketConfig) {
    return html;
  }

  const {
    enableConversion = true,
    strategy = 'conservative', // conservative: 只转换相对路径, aggressive: 转换所有内部链接
    preserveQueryParams = true,
    preserveAnchors = true
  } = options;

  if (!enableConversion) {
    return html;
  }

  // 🆕 转换统计
  const stats = {
    totalLinks: 0,
    successCount: 0,
    failedCount: 0,
    failedUrls: []  // 最多收集3条
  };

  try {
    // 标准化locale格式（zh-CN → zh, pt-BR → pt）
    const normalizedLocale = normalizeLocale(targetLocale);

    // 获取目标语言的域名配置
    const targetConfig = marketConfig.mappings?.[targetLocale] ||
                         marketConfig.mappings?.[normalizedLocale];

    if (!targetConfig) {
      logger.debug('未找到目标语言的域名配置', { targetLocale, normalizedLocale });
      return html;
    }

    const primaryHost = marketConfig.primaryHost;
    const primaryUrl = marketConfig.primaryUrl;

    // 转换所有<a>标签中的href
    let convertedHtml = html.replace(
      /<a([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
      (match, before, url, after) => {
        stats.totalLinks++;  // 🆕 统计总数

        try {
          const convertedUrl = transformUrl(
            url,
            targetConfig,
            primaryHost,
            primaryUrl,
            { strategy, preserveQueryParams, preserveAnchors }
          );
          stats.successCount++;  // 🆕 统计成功
          return `<a${before}href="${convertedUrl}"${after}>`;
        } catch (error) {
          // 🆕 统计失败并收集样本
          stats.failedCount++;

          if (stats.failedUrls.length < 3) {
            stats.failedUrls.push({
              url: url.substring(0, 200),           // 截断至200字符
              error: error.message.substring(0, 100) // 截断至100字符
            });
          }

          logger.warn('单个链接转换失败', {
            eventType: 'linkConversion',
            phase: 'url_error',
            originalUrl: url,
            targetLocale,
            error: error.message
          });
          return match;
        }
      }
    );
    
    // 如果启用aggressive策略，还要转换其他URL引用
    if (strategy === 'aggressive') {
      // 转换<link>标签的href
      convertedHtml = convertedHtml.replace(
        /<link([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
        (match, before, url, after) => {
          if (shouldConvertLink(url, primaryHost)) {
            const convertedUrl = transformUrl(url, targetConfig, primaryHost, primaryUrl, options);
            return `<link${before}href="${convertedUrl}"${after}>`;
          }
          return match;
        }
      );
    }

    // 🆕 转换成功率监控
    if (stats.totalLinks > 0) {
      const successRate = (stats.successCount / stats.totalLinks) * 100;

      logger.info('URL转换完成', {
        eventType: 'linkConversion',
        locale: targetLocale,
        stats: {
          ...stats,
          successRate: `${successRate.toFixed(1)}%`
        }
      });

      // 成功率过低告警
      if (successRate < 80 && stats.totalLinks >= 5) {
        const message = getLocalizedErrorMessage('LINK_CONVERSION_LOW_SUCCESS_RATE', 'zh-CN', {
          rate: successRate.toFixed(1),
          total: stats.totalLinks,
          failed: stats.failedCount
        });

        logger.warn(message, {
          eventType: 'linkConversion',
          phase: 'low_success_rate',
          stats
        });

        // Fire-and-forget error collection (非阻塞)
        collectError({
          errorType: ERROR_TYPES.TRANSLATION,
          errorCategory: 'WARNING',
          errorCode: 'LINK_CONVERSION_LOW_SUCCESS_RATE',
          message,
          context: {
            targetLocale,
            strategy,
            stats: {
              total: stats.totalLinks,
              success: stats.successCount,
              failed: stats.failedCount,
              rate: successRate.toFixed(1)
            },
            failedSamples: stats.failedUrls,  // 最多3条，已截断
          },
          operation: 'convertLinksForLocale',
          severity: 2,
          isTranslationError: true
        }).catch(err => logger.error('Error collection failed', { error: err.message }));
      }
    }

    return convertedHtml;
  } catch (error) {
    logger.error('链接转换过程出错', {
      eventType: 'linkConversion',
      phase: 'process_error',
      targetLocale,
      error: error.message
    });
    captureError('LINK_CONVERSION_ERROR', error, { targetLocale });
    return html; // 出错时返回原内容
  }
}

/**
 * 转换单个URL
 * @param {string} originalUrl - 原始URL
 * @param {Object} targetConfig - 目标语言配置
 * @param {string} primaryHost - 主域名
 * @param {string} primaryUrl - 主URL
 * @param {Object} options - 转换选项
 * @returns {string} 转换后的URL
 */
export function transformUrl(originalUrl, targetConfig, primaryHost, primaryUrl, options = {}) {
  const {
    strategy = 'conservative',
    preserveQueryParams = true,
    preserveAnchors = true
  } = options;
  
  // 1. 跳过特殊URL
  if (shouldSkipUrl(originalUrl)) {
    return originalUrl;
  }
  
  // 2. 处理相对路径
  if (originalUrl.startsWith('/') && !originalUrl.startsWith('//')) {
    // 跳过已经包含语言前缀的路径
    if (hasLocalePrefix(originalUrl)) {
      return originalUrl;
    }
    
    // 根据目标配置类型转换
    switch (targetConfig.type) {
      case 'subfolder':
        // /products/shirt → /fr/products/shirt
        return `/${targetConfig.suffix}${originalUrl}`;
        
      case 'subdomain':
        // /products/shirt → https://fr.example.com/products/shirt
        return `${targetConfig.url}${originalUrl}`;
        
      case 'domain':
        // /products/shirt → https://example.fr/products/shirt
        return `${targetConfig.url}${originalUrl}`;
        
      case 'primary':
        // 主语言，保持不变
        return originalUrl;
        
      default:
        return originalUrl;
    }
  }
  
  // 3. 处理完整URL（仅在aggressive策略下）
  if (strategy === 'aggressive' && isFullUrl(originalUrl)) {
    try {
      const url = new URL(originalUrl);
      
      // 检查是否为内部链接
      if (!isInternalUrl(url.host, primaryHost)) {
        return originalUrl;
      }
      
      // 提取路径和参数
      let path = url.pathname;
      const queryString = preserveQueryParams ? url.search : '';
      const anchor = preserveAnchors ? url.hash : '';
      
      // 移除已有的语言前缀
      path = removeLocalePrefix(path);
      
      // 根据目标配置类型转换
      switch (targetConfig.type) {
        case 'subfolder':
          // https://example.com/products → https://example.com/fr/products
          return `${primaryUrl}/${targetConfig.suffix}${path}${queryString}${anchor}`;
          
        case 'subdomain':
        case 'domain':
          // https://example.com/products → https://fr.example.com/products
          return `${targetConfig.url}${path}${queryString}${anchor}`;
          
        case 'primary':
          return originalUrl;
          
        default:
          return originalUrl;
      }
    } catch (error) {
      // URL解析失败，返回原URL
      return originalUrl;
    }
  }
  
  return originalUrl;
}

/**
 * 判断是否应该跳过URL转换
 * @param {string} url - URL
 * @returns {boolean}
 */
function shouldSkipUrl(url) {
  if (!url || typeof url !== 'string') return true;
  
  // 跳过特殊协议
  const skipProtocols = ['mailto:', 'tel:', 'sms:', 'javascript:', 'data:', '#'];
  for (const protocol of skipProtocols) {
    if (url.startsWith(protocol)) {
      return true;
    }
  }
  
  // 跳过纯锚点
  if (url === '#' || url.startsWith('#')) {
    return true;
  }
  
  // 跳过外部协议链接（但不包括http/https）
  if (url.includes(':') && !url.startsWith('http://') && !url.startsWith('https://')) {
    return true;
  }
  
  return false;
}

/**
 * 判断URL是否已包含语言前缀
 * @param {string} url - URL路径
 * @returns {boolean}
 */
function hasLocalePrefix(url) {
  // 支持市场后缀形式：/de-de, /en-eu, /fr-ca 等
  const localePattern = /^\/[a-z]{2}(?:-[a-z0-9]{2,4})?(\/|$)/i;
  return localePattern.test(url);
}

/**
 * 移除URL中的语言前缀
 * @param {string} path - URL路径
 * @returns {string}
 */
function removeLocalePrefix(path) {
  const localePattern = /^\/[a-z]{2}(?:-[a-z0-9]{2,4})?\//i;
  return path.replace(localePattern, '/');
}

/**
 * 判断是否为完整URL
 * @param {string} url - URL
 * @returns {boolean}
 */
function isFullUrl(url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * 判断是否为内部链接
 * @param {string} urlHost - URL的主机名
 * @param {string} primaryHost - 主域名
 * @returns {boolean}
 */
function isInternalUrl(urlHost, primaryHost) {
  if (!urlHost || !primaryHost) return false;
  
  // 移除www前缀进行比较
  const normalizedUrlHost = urlHost.replace(/^www\./, '');
  const normalizedPrimaryHost = primaryHost.replace(/^www\./, '');
  
  // 检查是否为同一域名或子域名
  return normalizedUrlHost === normalizedPrimaryHost ||
         normalizedUrlHost.endsWith(`.${normalizedPrimaryHost}`) ||
         normalizedPrimaryHost.endsWith(`.${normalizedUrlHost}`);
}

/**
 * 判断是否应该转换<link>标签
 * @param {string} url - URL
 * @param {string} primaryHost - 主域名
 * @returns {boolean}
 */
function shouldConvertLink(url, primaryHost) {
  // 只转换内部CSS和canonical链接
  if (url.startsWith('/') || isInternalUrl(new URL(url, `https://${primaryHost}`).host, primaryHost)) {
    return true;
  }
  return false;
}

/**
 * 标准化locale代码
 * @param {string} locale - 语言代码
 * @returns {string}
 */
function normalizeLocale(locale) {
  if (!locale) return '';
  
  // zh-CN → zh, pt-BR → pt
  const parts = locale.split('-');
  return parts[0].toLowerCase();
}

/**
 * 批量转换链接（性能优化版本）
 * @param {string} html - HTML内容
 * @param {Array<string>} targetLocales - 目标语言数组
 * @param {Object} marketConfig - Markets配置
 * @param {Object} options - 转换选项
 * @returns {Object} 各语言的转换结果
 */
export function batchConvertLinks(html, targetLocales, marketConfig, options = {}) {
  const results = {};
  
  for (const locale of targetLocales) {
    try {
      results[locale] = convertLinksForLocale(html, locale, marketConfig, options);
    } catch (error) {
      logger.error('批量链接转换失败', {
        eventType: 'linkConversion',
        phase: 'batch_error',
        targetLocale: locale,
        error: error.message
      });
      results[locale] = html; // 失败时使用原内容
    }
  }
  
  return results;
}

/**
 * 验证Markets配置是否有效
 * @param {Object} marketConfig - Markets配置
 * @returns {boolean}
 */
export function validateMarketConfig(marketConfig) {
  if (!marketConfig) return false;
  
  const required = ['primaryHost', 'primaryUrl', 'mappings'];
  for (const field of required) {
    if (!marketConfig[field]) {
      logger.warn('Markets配置缺少必需字段', { field });
      return false;
    }
  }
  
  if (typeof marketConfig.mappings !== 'object') {
    logger.warn('Markets配置mappings格式错误');
    return false;
  }
  
  return true;
}

/**
 * 获取支持的语言列表
 * @param {Object} marketConfig - Markets配置
 * @returns {Array<string>}
 */
export function getSupportedLocales(marketConfig) {
  if (!marketConfig?.mappings) return [];
  
  return Object.keys(marketConfig.mappings);
}

/**
 * 获取URL转换预览
 * @param {string} originalUrl - 原始URL
 * @param {string} targetLocale - 目标语言
 * @param {Object} marketConfig - Markets配置
 * @returns {Object} 预览结果
 */
export function getUrlPreview(originalUrl, targetLocale, marketConfig) {
  try {
    const normalizedLocale = normalizeLocale(targetLocale);
    const targetConfig = marketConfig.mappings?.[targetLocale] || 
                         marketConfig.mappings?.[normalizedLocale];
    
    if (!targetConfig) {
      return {
        original: originalUrl,
        converted: originalUrl,
        type: 'unchanged',
        reason: '未找到目标语言配置'
      };
    }
    
    const convertedUrl = transformUrl(
      originalUrl,
      targetConfig,
      marketConfig.primaryHost,
      marketConfig.primaryUrl
    );
    
    return {
      original: originalUrl,
      converted: convertedUrl,
      type: targetConfig.type,
      locale: targetLocale,
      changed: originalUrl !== convertedUrl
    };
  } catch (error) {
    return {
      original: originalUrl,
      converted: originalUrl,
      type: 'error',
      error: error.message
    };
  }
}
