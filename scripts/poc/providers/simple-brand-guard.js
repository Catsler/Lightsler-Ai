const UI_WHITELIST = new Set([
  'home',
  'shop',
  'orders',
  'catalog',
  'search',
  'cart',
  'size',
  'color',
  'style',
  'material',
  'filter',
  'sort',
  'view'
]);

/**
 * 简易品牌词守卫。
 * - UI 词汇（白名单）返回 false（不保护，允许翻译）
 * - vendor 字段始终保护
 * - 其他短单词按首字母大写判断是否可能为品牌
 *
 * @param {string} text
 * @param {Object} [context]
 * @param {string} [context.fieldType]
 * @returns {boolean}
 */
export default function simpleBrandGuard(text, context = {}) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();

  if (UI_WHITELIST.has(normalized)) {
    return false;
  }

  if (context.fieldType === 'vendor') {
    return true;
  }

  if (trimmed.length < 50 && /^[A-Z][a-z]+$/.test(trimmed)) {
    return true;
  }

  return false;
}
