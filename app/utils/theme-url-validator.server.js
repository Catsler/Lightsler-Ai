/**
 * Theme URL 校验工具
 * 支持 Shopify 主题中常见的链接格式：绝对 URL、相对路径、锚点、shopify 协议、Liquid 变量等。
 */

const PATTERNS = {
  liquid: /\{\{.*\}\}/, // Liquid 变量或表达式
  relative: /^\/(?!\/)[^\s]*$/, // /collections/all
  anchor: /^#[\w-]+$/, // #section-id
  absolute: /^https?:\/\/[^\s]+$/i, // https://example.com
  protocolRelative: /^\/\/[^\s]+$/, // //cdn.shopify.com
  shopifyScheme: /^shopify:\/\/[^\s]+$/i, // shopify://pages/about
  mail: /^mailto:[^\s]+$/i,
  tel: /^tel:[^\s]+$/i
};

export function validateThemeUrl(url, context = {}) {
  if (typeof url !== 'string' || !url.trim()) {
    return {
      valid: false,
      error: '空URL',
      context
    };
  }

  if (PATTERNS.liquid.test(url)) {
    return { valid: true, type: 'liquid' };
  }

  for (const [type, pattern] of Object.entries(PATTERNS)) {
    if (type === 'liquid') continue;
    if (pattern.test(url)) {
      return { valid: true, type };
    }
  }

  // 最后尝试使用 WHATWG URL 解析（允许绝对 URL）
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return { valid: true, type: 'absolute' };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL format: ${url}`,
      context
    };
  }
}

export default validateThemeUrl;
