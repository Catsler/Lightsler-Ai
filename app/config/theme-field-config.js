/**
 * Theme字段显示配置
 * 用于控制Theme JSON对比页面中哪些字段需要显示/隐藏
 *
 * 遵循KISS原则，只定义必要的规则
 */

// 黑名单：明确不需要显示的技术字段
export const SKIP_FIELDS = [
  'digest',     // SHA-256哈希值
  'locale',     // 语言代码（在其他地方显示）
  'id',         // 技术ID
  'key',        // 技术键值
  'handle',     // Shopify handle
  'checksum',   // 校验和
  'hash',       // 哈希值
  'fingerprint' // 指纹
];

// 白名单：明确需要翻译的字段后缀
export const TRANSLATABLE_FIELD_PATTERNS = [
  'title',
  'heading',
  'label',
  'name',
  'text',
  'content',
  'description',
  'subtitle',
  'button_text',
  'button_label',
  'placeholder',
  'message',
  'error',
  'warning',
  'help_text',
  'tooltip',
  'alt_text',
  'value' // 仅当包含实际文本时
];

// 特殊值过滤：这些值即使在可翻译字段中也应该跳过
export const SKIP_VALUES = [
  /^[a-f0-9]{64}$/i,                    // SHA-256哈希值
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // UUID
  /^#[0-9A-Fa-f]{3,6}$/,                // 颜色值
  /^\d+$/,                              // 纯数字
  /^https?:\/\/[^\s]+$/,                // 纯URL（无空格）
  /^\{\{.*\}\}$/,                       // Liquid变量
  /^\{%.*%\}$/                          // Liquid标签
];

/**
 * 判断字段是否应该显示在对比视图中
 * @param {string} fieldPath - 字段路径（如 'sections.title'）
 * @param {string} value - 字段值
 * @returns {boolean} 是否显示
 */
export function shouldShowField(fieldPath, value) {
  // 提取字段名（路径的最后一部分）
  const fieldName = fieldPath.split('.').pop();

  // 1. 检查黑名单
  if (SKIP_FIELDS.includes(fieldName.toLowerCase())) {
    return false;
  }

  // 2. 检查空值
  if (!value || value === '' || value === 'null' || value === 'undefined') {
    return false;
  }

  // 3. 检查特殊值（哈希、UUID等）
  const valueStr = String(value);
  if (SKIP_VALUES.some(pattern => pattern.test(valueStr))) {
    return false;
  }

  // 4. 检查白名单（包含这些关键词的字段优先显示）
  const fieldLower = fieldName.toLowerCase();
  const hasTranslatablePattern = TRANSLATABLE_FIELD_PATTERNS.some(pattern =>
    fieldLower.includes(pattern)
  );

  if (hasTranslatablePattern) {
    return true;
  }

  // 5. 默认策略：暂时显示（后续根据真实数据调整）
  // 如果是多词文本，可能需要翻译
  if (valueStr.includes(' ') && valueStr.length > 2) {
    return true;
  }

  // 6. 其他情况暂时保留，等待更多数据验证
  return true;
}

/**
 * 获取字段的显示类型
 * @param {any} value - 字段值
 * @returns {object} 类型信息
 */
export function getFieldDisplayType(value) {
  if (Array.isArray(value)) {
    return { type: 'array', label: '数组' };
  }
  if (value && typeof value === 'object') {
    return { type: 'object', label: '对象' };
  }
  if (typeof value === 'string' && value.length > 100) {
    return { type: 'longtext', label: '长文本' };
  }
  return { type: 'string', label: '文本' };
}

/**
 * 模块显示名称映射
 */
export const MODULE_DISPLAY_NAMES = {
  sections: '版块',
  settings: '设置',
  blocks: '块',
  layout: '布局',
  order: '顺序',
  presets: '预设',
  locales: '本地化',
  content: '内容'
};

/**
 * 获取模块的友好显示名称
 * @param {string} moduleName - 模块名
 * @returns {string} 显示名称
 */
export function getModuleDisplayName(moduleName) {
  return MODULE_DISPLAY_NAMES[moduleName] || moduleName;
}