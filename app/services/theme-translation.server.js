/**
 * Theme资源专用翻译服务
 * 处理所有ONLINE_STORE_THEME相关资源的翻译逻辑
 * 与其他资源翻译逻辑完全独立，避免相互影响
 */

import { translateTextWithFallback, postProcessTranslation } from './translation/core.server.js';
import { logger } from '../utils/logger.server.js';

// 验证必需函数是否正确导入
if (typeof translateTextWithFallback !== 'function') {
  throw new Error('translateTextWithFallback未正确导入，请检查translation.server.js的导出');
}
if (typeof postProcessTranslation !== 'function') {
  throw new Error('postProcessTranslation未正确导入，请检查translation.server.js的导出');
}

async function translateThemeValue(text, targetLang) {
  if (typeof text !== 'string') {
    return text;
  }

  const result = await translateTextWithFallback(text, targetLang);
  if (!result.success && result.error) {
    logger.warn(`[Theme翻译] 字段翻译失败，保留原文`, { targetLang, error: result.error });
  }
  return result.text;
}

/**
 * 深度遍历JSON对象并翻译可翻译字段
 * @param {Object} obj - 要遍历的对象
 * @param {string} targetLang - 目标语言
 * @param {string} keyPrefix - 键前缀，用于路径跟踪
 * @param {number} depth - 当前深度，防止无限递归
 * @returns {Promise<Object>} 翻译后的对象
 */
async function translateObjectRecursively(obj, targetLang, keyPrefix = '', depth = 0) {
  // 防止过深递归
  if (depth > 10) {
    logger.warn(`[Theme翻译] 递归深度超限，停止处理: ${keyPrefix}`);
    return obj;
  }

  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    const translatedArray = [];
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      const itemKey = `${keyPrefix}[${i}]`;

      if (typeof item === 'string' && shouldTranslateThemeField(itemKey, item)) {
        try {
          const { protectedText, protectedMap } = protectLiquidVariables(item);
          let translatedText = await translateThemeValue(protectedText, targetLang);
          translatedText = restoreLiquidVariables(translatedText, protectedMap);
          translatedArray.push(translatedText);
          logger.debug(`[Theme翻译] 翻译数组项: ${itemKey}`);
        } catch (error) {
          logger.error(`[Theme翻译] 数组项翻译失败 ${itemKey}:`, error);
          translatedArray.push(item);
        }
      } else if (typeof item === 'object') {
        translatedArray.push(await translateObjectRecursively(item, targetLang, itemKey, depth + 1));
      } else {
        translatedArray.push(item);
      }
    }
    return translatedArray;
  }

  // 处理对象
  const translatedObj = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = keyPrefix ? `${keyPrefix}.${key}` : key;

    if (typeof value === 'string' && shouldTranslateThemeField(fullKey, value)) {
      try {
        const { protectedText, protectedMap } = protectLiquidVariables(value);
        let translatedText = await translateThemeValue(protectedText, targetLang);
        translatedText = restoreLiquidVariables(translatedText, protectedMap);
        translatedObj[key] = translatedText;
        logger.debug(`[Theme翻译] 翻译字段: ${fullKey}`);
      } catch (error) {
        logger.error(`[Theme翻译] 字段翻译失败 ${fullKey}:`, error);
        translatedObj[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      translatedObj[key] = await translateObjectRecursively(value, targetLang, fullKey, depth + 1);
    } else {
      translatedObj[key] = value;
    }
  }

  return translatedObj;
}

// Theme可翻译字段规则 - 基于Shopify官方文档和最佳实践
const THEME_TRANSLATABLE_PATTERNS = [
  // 文本内容类
  /^(.+\.)?(title|heading|label|name|text|content|description)$/i,
  /^(.+\.)?(subtitle|subheading|tagline|caption)$/i,
  
  // 按钮和交互类
  /^(.+\.)?(button_text|button_label|link_text|link_label)$/i,
  /^(.+\.)?(placeholder|input_label|field_label)$/i,
  
  // 辅助信息类
  /^(.+\.)?(help_text|helper_text|hint|tooltip|info_text)$/i,
  /^(.+\.)?(alt_text|image_alt|aria_label)$/i,
  
  // 消息和提示类
  /^(.+\.)?(message|error|error_message|success|success_message)$/i,
  /^(.+\.)?(warning|warning_message|info|info_message|notice)$/i,
  /^(.+\.)?(confirmation|confirm_text|alert|notification)$/i,
  
  // 导航和菜单类
  /^(.+\.)?(menu_item|nav_text|breadcrumb)$/i,
  
  // 表单相关
  /^(.+\.)?(form_label|form_text|validation_message)$/i,
  
  // 产品和商店相关
  /^(.+\.)?(product_text|collection_text|shop_text)$/i,
  /^(.+\.)?(price_text|discount_text|sale_text)$/i,
  
  // 更通用的模式 - 捕获更多可能包含文本的字段
  /^(.+\.)?(value|content_value|text_value)$/i,
  /^(.+\.)?(item|field|column|row|section).*?(text|content|title|label)$/i,
  /^(.+\.)?(tab_label|tab_title|tab_content)$/i,

  // 新增常见UI模式 - 提高覆盖率
  /^(.+\.)?(summary|excerpt|preview|intro|overview)$/i,
  /^(.+\.)?(footer_text|copyright|legal|disclaimer)$/i,
  /^(.+\.)?(quote|testimonial|review|comment)$/i,
  /^(.+\.)?(announcement|promo|promotion|offer)$/i,
  /^(.+\.)?(menu|dropdown|option|choice).*?(text|label)$/i,
  /^(.+\.)?(badge|status|tag|category).*?(text|label)$/i,
  /^(.+\.)?(instruction|step|guide|tutorial).*?(text|title)$/i,
  /^(.+\.)?(empty_state|no_results|not_found).*?(text|message)$/i,

  // 更宽泛的文本检测模式
  /.*_(text|title|label|heading|description|content|message)$/i,
  /.*text$/i,
  /.*(title|label|heading)$/i,

  // 增强的用户界面文本模式
  /^(.+\.)?(modal|popup|dialog|toast|alert).*?(text|title|message)$/i,
  /^(.+\.)?(sidebar|header|footer|navigation).*?(text|label)$/i,
  /^(.+\.)?(loading|error|success|warning).*?(text|message)$/i,

  // 产品和电商相关文本
  /^(.+\.)?(cart|checkout|payment|shipping).*?(text|label|message)$/i,
  /^(.+\.)?(product|collection|category).*?(text|description|name)$/i,
  /^(.+\.)?(search|filter|sort).*?(text|placeholder|label)$/i,

  // 表单和输入相关
  /^(.+\.)?(form|input|field|textarea).*?(text|placeholder|label)$/i,
  /^(.+\.)?(submit|cancel|save|delete).*?(text|label)$/i,

  // 通知和反馈相关
  /^(.+\.)?(notification|feedback|review|comment).*?(text|message)$/i,
  /^(.+\.)?(help|tip|hint|guide).*?(text|content)$/i,

  // 博客和内容相关
  /^(.+\.)?(blog|article|post|news).*?(text|title|excerpt)$/i,
  /^(.+\.)?(author|date|category|tag).*?(text|label)$/i,

  // 社交媒体和分享
  /^(.+\.)?(social|share|follow|like).*?(text|label)$/i,
  /^(.+\.)?(facebook|twitter|instagram|youtube).*?(text|title)$/i,

  // 特殊场景文本
  /^(.+\.)?(empty|no_results|not_found).*?(text|message)$/i,
  /^(.+\.)?(countdown|timer|progress).*?(text|label)$/i,

  // Shopify特有的主题字段
  /^(.+\.)?(collection_list|product_grid|featured_product).*?(text|heading|subheading)$/i,
  /^(.+\.)?(newsletter|contact|about).*?(text|description|heading)$/i
];

// Theme技术字段（不翻译）- 这些字段应该保持原值
const THEME_TECHNICAL_PATTERNS = [
  // 标识符和键值
  /^(.+\.)?(id|key|handle|slug|type|kind|variant)$/i,
  /^(.+\.)?(class|className|style|css|scss)$/i,
  
  // URL和路径
  /^(.+\.)?(url|href|src|path|endpoint|route|link)$/i,
  /^(.+\.)?(asset|assets|file|filename|image|icon)$/i,
  
  // 样式和布局
  /^(.+\.)?(color|colour|background|bg|font|font_size)$/i,
  /^(.+\.)?(size|width|height|margin|padding|spacing)$/i,
  /^(.+\.)?(position|align|alignment|justify|display)$/i,
  /^(.+\.)?(border|radius|shadow|opacity|z_index)$/i,
  
  // 配置和设置
  /^(.+\.)?(enabled|disabled|active|inactive|visible|hidden)$/i,
  /^(.+\.)?(required|optional|default|min|max|limit)$/i,
  /^(.+\.)?(setting|settings|config|configuration|option|options)$/i,
  
  // 数据和逻辑
  /^(.+\.)?(data|value|values|count|number|amount)$/i,
  /^(.+\.)?(condition|conditions|rule|rules|filter|filters)$/i,
  /^(.+\.)?(template|templates|layout|layouts|schema)$/i,
  
  // API和技术相关
  /^(.+\.)?(api|endpoint|method|param|params|query)$/i,
  /^(.+\.)?(script|scripts|code|function|callback)$/i,
  
  // Shopify特定
  /^(.+\.)?(metafield|metafields|namespace|collection_id|product_id)$/i,
  /^(.+\.)?(vendor|sku|barcode|inventory|variant_id)$/i
];

/**
 * 判断Theme字段是否需要翻译
 * @param {string} key - 字段键名
 * @param {any} value - 字段值
 * @returns {boolean} 是否需要翻译
 */
/**
 * 检查是否为Shopify默认主题内容
 * @param {Object} resource - Theme资源对象
 * @returns {Object} 检查结果 {shouldSkip: boolean, reason: string}
 */
function checkDefaultThemeContent(resource) {
  // Shopify官方默认主题列表
  const DEFAULT_THEMES = [
    'Dawn', 'Refresh', 'Craft', 'Sense', 'Studio', 'Colorblock',
    'Impulse', 'Minimal', 'Narrative', 'Supply', 'Venture', 'Brooklyn',
    'Simple', 'Debut', 'Expression', 'Symmetry', 'Streamline'
  ];

  // 检查主题名称
  const themeName = resource.title || '';
  const isDefaultTheme = DEFAULT_THEMES.some(defaultName => 
    themeName.toLowerCase().includes(defaultName.toLowerCase())
  );

  if (isDefaultTheme) {
    return {
      shouldSkip: true,
      reason: `Shopify默认主题"${themeName}"，由官方处理多语言`
    };
  }

  // 检查文件路径是否包含默认主题标识
  const resourceId = resource.id || '';
  const gid = resource.gid || '';
  
  const pathIndicators = [
    'shopify/themes/dawn',
    'shopify/themes/refresh', 
    'shopify/themes/craft',
    'shopify/themes/sense',
    'shopify/themes/studio',
    '/dawn/', '/refresh/', '/craft/', '/sense/', '/studio/'
  ];

  const hasDefaultThemePath = pathIndicators.some(indicator => 
    resourceId.toLowerCase().includes(indicator) || 
    gid.toLowerCase().includes(indicator)
  );

  if (hasDefaultThemePath) {
    return {
      shouldSkip: true,
      reason: 'Shopify默认主题路径，由官方处理多语言'
    };
  }

  // 检查内容特征：典型的默认主题占位符文本
  const contentFields = resource.contentFields || {};
  const defaultPlaceholders = [
    'Talk about your brand',
    'Share information about your brand',
    'Describe a product, share announcements',
    'Your content goes here',
    'Add your own custom content',
    'Use this text to share information'
  ];

  // 检查是否包含大量默认占位符文本
  let placeholderCount = 0;
  let totalTextFields = 0;

  function countPlaceholders(obj) {
    if (typeof obj === 'string') {
      totalTextFields++;
      if (defaultPlaceholders.some(placeholder => 
        obj.toLowerCase().includes(placeholder.toLowerCase())
      )) {
        placeholderCount++;
      }
    } else if (typeof obj === 'object' && obj !== null) {
      Object.values(obj).forEach(countPlaceholders);
    }
  }

  countPlaceholders(contentFields);

  // 如果80%以上的文本字段都是默认占位符，认为是默认主题
  if (totalTextFields > 0 && (placeholderCount / totalTextFields) >= 0.8) {
    return {
      shouldSkip: true,
      reason: `包含${placeholderCount}/${totalTextFields}个默认占位符，疑似默认主题内容`
    };
  }

  // 不跳过
  return {
    shouldSkip: false,
    reason: null
  };
}

function shouldTranslateThemeField(key, value) {
  // 1. 跳过非字符串值
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  
  // 2. 跳过技术字段（优先级高于可翻译字段）
  if (THEME_TECHNICAL_PATTERNS.some(pattern => pattern.test(key))) {
    logger.debug(`[Theme翻译] 跳过技术字段: ${key}`);
    return false;
  }
  
  // 3. 跳过Liquid模板变量和标签
  if (value.includes('{{') || value.includes('{%')) {
    logger.debug(`[Theme翻译] 跳过Liquid模板: ${key}`);
    return false;
  }
  
  // 4. 跳过纯数字或特殊格式
  if (/^\d+$/.test(value) || /^#[0-9A-Fa-f]{3,6}$/.test(value)) {
    logger.debug(`[Theme翻译] 跳过数字/颜色值: ${key}`);
    return false;
  }
  
  // 5. 跳过URL（但不跳过包含URL的文本）
  if (/^https?:\/\//.test(value) && !value.includes(' ')) {
    logger.debug(`[Theme翻译] 跳过纯URL: ${key}`);
    return false;
  }
  
  // 6. 检查是否匹配可翻译模式
  const isTranslatable = THEME_TRANSLATABLE_PATTERNS.some(pattern => pattern.test(key));
  
  if (isTranslatable) {
    logger.debug(`[Theme翻译] 需要翻译字段: ${key}`);
    return true;
  }
  
  // 7. 检查是否为需要翻译的占位符文本
  const placeholderTexts = [
    'Your content', 'Paragraph', 'Image with text', 
    'Subheading', 'Easy Setup', 'rear went mesh',
    'Item', 'Content', 'Title', 'Description'
  ];
  
  if (placeholderTexts.includes(value)) {
    logger.debug(`[Theme翻译] 检测到占位符文本，需要翻译: ${key} = "${value}"`);
    return true;
  }
  
  // 8. 对于未匹配的字段，如果包含实际文本内容，也考虑翻译
  if (value.length >= 2 && /[a-zA-Z]/.test(value)) {
    // 检查是否为品牌名（包含®、™符号或常见品牌名）
    if (/[®™]/.test(value) || /^(Onewind|Shopify|Amazon|Google|Facebook|Apple|Microsoft)/i.test(value)) {
      logger.debug(`[Theme翻译] 跳过品牌名: ${key} = "${value}"`);
      return false;
    }

    // 对于有多个单词的文本，考虑翻译
    if (value.split(' ').length > 1) {
      logger.debug(`[Theme翻译] 检测到多词文本内容，需要翻译: ${key} = "${value}"`);
      return true;
    }

    // 对于单个词但看起来像占位符的，也考虑翻译
    if (value.length >= 4 && /^[A-Z][a-z]+/.test(value)) {
      logger.debug(`[Theme翻译] 检测到可能的UI文本，需要翻译: ${key} = "${value}"`);
      return true;
    }

    // 9. 新增：对于短文本也考虑翻译（提高覆盖率）
    // 只要不是明显的技术值，就考虑翻译
    if (value.length >= 2 && value.length <= 20 &&
        !/^[0-9#.]/.test(value) && // 不是数字或颜色
        !/^\w+\.(jpg|png|gif|svg|webp|css|js)$/i.test(value) && // 不是文件名
        !/^(true|false|null|undefined)$/i.test(value)) { // 不是布尔值
      logger.debug(`[Theme翻译] 检测到短文本，考虑翻译: ${key} = "${value}"`);
      return true;
    }
  }

  logger.debug(`[Theme翻译] 跳过字段: ${key} = "${value}"`);
  return false;
}

/**
 * 保护Liquid变量和特殊标记
 * @param {string} text - 原始文本
 * @returns {object} 保护后的文本和映射
 */
function protectLiquidVariables(text) {
  const protectedMap = new Map();
  let protectedText = text;
  let index = 0;
  
  // 保护 {{ variable }} 格式
  protectedText = protectedText.replace(/\{\{[^}]+\}\}/g, (match) => {
    const placeholder = `__LIQUID_VAR_${index}__`;
    protectedMap.set(placeholder, match);
    index++;
    return placeholder;
  });
  
  // 保护 {% tag %} 格式
  protectedText = protectedText.replace(/\{%[^%]+%\}/g, (match) => {
    const placeholder = `__LIQUID_TAG_${index}__`;
    protectedMap.set(placeholder, match);
    index++;
    return placeholder;
  });
  
  return { protectedText, protectedMap };
}

/**
 * 恢复Liquid变量和特殊标记
 * @param {string} text - 翻译后的文本
 * @param {Map} protectedMap - 保护映射
 * @returns {string} 恢复后的文本
 */
function restoreLiquidVariables(text, protectedMap) {
  let restoredText = text;
  
  for (const [placeholder, original] of protectedMap) {
    restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
  }
  
  return restoredText;
}

/**
 * Theme JSON数据递归翻译
 * @param {any} data - JSON数据
 * @param {string} targetLang - 目标语言
 * @param {string} parentKey - 父级键名（用于上下文）
 * @returns {Promise<any>} 翻译后的数据
 */
async function translateThemeJsonData(data, targetLang, parentKey = '') {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // 处理数组
  if (Array.isArray(data)) {
    return Promise.all(
      data.map((item, index) => 
        translateThemeJsonData(item, targetLang, `${parentKey}[${index}]`)
      )
    );
  }

  // 处理对象
  const translated = {};
  
  for (const [key, value] of Object.entries(data)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    
    // 判断是否需要翻译
    if (shouldTranslateThemeField(fullKey, value)) {
      try {
        // 保护Liquid变量
        const { protectedText, protectedMap } = protectLiquidVariables(value);
        
        // 翻译文本
        let translatedText = await translateThemeValue(protectedText, targetLang);
        
        // 恢复Liquid变量
        translatedText = restoreLiquidVariables(translatedText, protectedMap);

        // 后处理
        translatedText = await postProcessTranslation(translatedText, targetLang, value, { linkConversion: options.linkConversion });

        translated[key] = translatedText;
        logger.debug(`[Theme翻译] 成功翻译 ${fullKey}: "${value.substring(0, 50)}..." -> "${translatedText.substring(0, 50)}..."`);
      } catch (error) {
        logger.error(`[Theme翻译] 翻译失败 ${fullKey}:`, error.message);
        translated[key] = value; // 失败时保留原值
      }
    } else if (typeof value === 'object' && value !== null) {
      // 递归处理嵌套对象
      translated[key] = await translateThemeJsonData(value, targetLang, fullKey);
    } else {
      // 保留原值
      translated[key] = value;
    }
  }

  return translated;
}

/**
 * Theme资源主翻译函数
 * @param {Object} resource - Theme资源对象
 * @param {string} targetLang - 目标语言
 * @returns {Promise<Object>} 翻译结果
 */
export async function translateThemeResource(resource, targetLang, options = {}) {
  logger.debug(`[Theme翻译] 开始翻译Theme资源: ${resource.resourceType} - ${resource.id}`);

  // 检查是否为Shopify默认主题内容（需要跳过）
  const defaultThemeCheck = checkDefaultThemeContent(resource);
  if (defaultThemeCheck.shouldSkip) {
    logger.warn('[Theme翻译] 跳过Shopify默认主题内容', {
      resourceId: resource.id,
      reason: defaultThemeCheck.reason,
      title: resource.title?.slice(0, 50)
    });

    return {
      titleTrans: resource.title,
      descTrans: null,
      handleTrans: null,
      seoTitleTrans: null,
      seoDescTrans: null,
      translationFields: {},
      skipped: true,
      skipReason: defaultThemeCheck.reason
    };
  }

  const result = {
    titleTrans: resource.title, // Theme资源的标题通常是文件名，保持原样
    descTrans: null,
    handleTrans: null,
    seoTitleTrans: null,
    seoDescTrans: null,
    translationFields: {}
  };

  // 获取contentFields
  const contentFields = resource.contentFields || {};

  // 验证contentFields是否有数据
  if (!contentFields || Object.keys(contentFields).length === 0) {
    logger.error(`[Theme翻译] 错误：Theme资源缺少contentFields数据: ${resource.id}`);
    throw new Error(`Theme资源缺少必要的contentFields数据。请重新扫描Theme资源。`);
  }
  
  // 处理不同类型的Theme资源
  const resourceType = resource.resourceType.toUpperCase();
  
  switch (resourceType) {
    case 'ONLINE_STORE_THEME':
    case 'ONLINE_STORE_THEME_JSON_TEMPLATE':
    case 'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS':
      logger.debug(`[Theme翻译] 处理JSON模板类型资源`);
      
      // 处理themeData字段（JSON内容）
      if (contentFields.themeData) {
        // 检查themeData是否为空或为0
        const hasValidThemeData = contentFields.themeData && 
          contentFields.themeData !== 0 && 
          contentFields.themeData !== '0' &&
          String(contentFields.themeData).trim() !== '';
          
        if (!hasValidThemeData && contentFields.dynamicFields) {
          logger.warn(`[Theme翻译] Theme资源缺少有效themeData，跳过翻译: ${resource.id}`);
          // 直接返回跳过状态，避免报错
          return {
            ...result,
            skipped: true,
            skipReason: 'Theme资源结构不匹配(无有效themeData)'
          };
        }
        
        try {
          logger.debug(`[Theme翻译] 解析并翻译themeData`);
          const themeData = typeof contentFields.themeData === 'string' 
            ? JSON.parse(contentFields.themeData) 
            : contentFields.themeData;
          
          const translatedData = await translateThemeJsonData(themeData, targetLang);
          result.translationFields.themeData = JSON.stringify(translatedData, null, 2);
          logger.debug(`[Theme翻译] themeData翻译完成`);
        } catch (error) {
          logger.error('[Theme翻译] 处理themeData失败:', error);
          // 保留原始数据
          result.translationFields.themeData = contentFields.themeData;
        }
      }
      
      // 处理dynamicFields（动态字段）
      if (contentFields.dynamicFields) {
        logger.debug(`[Theme翻译] 处理dynamicFields，共${Object.keys(contentFields.dynamicFields).length}个字段`);
        const translatedDynamic = {};
        
        for (const [key, fieldData] of Object.entries(contentFields.dynamicFields)) {
          // 使用hasOwnProperty避免空字符串被误判为falsy
          const fieldValue = Object.prototype.hasOwnProperty.call(fieldData, 'value')
            ? fieldData.value
            : fieldData;
          
          // 对Theme JSON Template使用更宽松的翻译策略
          let shouldTranslate = shouldTranslateThemeField(key, fieldValue);
          
          // 如果是JSON Template类型，对某些特定内容强制翻译
          if (!shouldTranslate && resourceType === 'ONLINE_STORE_THEME_JSON_TEMPLATE') {
            // 检查是否为常见的UI文本，即使字段名不匹配也要翻译
            if (typeof fieldValue === 'string' && fieldValue.length >= 2 && /[a-zA-Z]/.test(fieldValue)) {
              // 排除技术内容和品牌名
              const isTechnical = /^(https?:\/\/|#[0-9A-Fa-f]{3,6}|[\d]+px|[\d]+%)$/.test(fieldValue);
              const isBrand = /[®™]/.test(fieldValue) || /^(Onewind|Shopify)/i.test(fieldValue);
              
              if (!isTechnical && !isBrand && !fieldValue.includes('{{') && !fieldValue.includes('{%')) {
                logger.debug(`[Theme翻译] JSON Template特殊处理，强制翻译: ${key} = "${fieldValue}"`);
                shouldTranslate = true;
              }
            }
          }
          
          if (shouldTranslate) {
            try {
              const { protectedText, protectedMap } = protectLiquidVariables(fieldValue);
              let translatedText = await translateThemeValue(protectedText, targetLang);
              translatedText = restoreLiquidVariables(translatedText, protectedMap);
              
              // 保留digest用于后续注册
              translatedDynamic[key] = {
                value: translatedText,
                digest: fieldData.digest || null,
                original: fieldValue
              };
            } catch (error) {
              logger.error(`[Theme翻译] 翻译dynamicField失败 ${key}:`, error.message);
              translatedDynamic[key] = fieldData;
            }
          } else {
            translatedDynamic[key] = fieldData;
          }
        }
        
        result.translationFields.dynamicFields = translatedDynamic;
        logger.debug(`[Theme翻译] dynamicFields处理完成`);
      }
      
      // 处理translatableFields（如果存在）
      if (contentFields.translatableFields && Array.isArray(contentFields.translatableFields)) {
        logger.debug(`[Theme翻译] 处理translatableFields数组`);
        const translatedFields = [];
        
        for (const field of contentFields.translatableFields) {
          if (shouldTranslateThemeField(field.key, field.value)) {
            try {
              const { protectedText, protectedMap } = protectLiquidVariables(field.value);
              let translatedText = await translateThemeValue(protectedText, targetLang);
              translatedText = restoreLiquidVariables(translatedText, protectedMap);
              
              translatedFields.push({
                ...field,
                value: translatedText,
                original: field.value
              });
            } catch (error) {
              logger.error(`[Theme翻译] 翻译field失败 ${field.key}:`, error.message);
              translatedFields.push(field);
            }
          } else {
            translatedFields.push(field);
          }
        }
        
        result.translationFields.translatableFields = translatedFields;
      }
      break;

    case 'ONLINE_STORE_THEME_LOCALE_CONTENT':
      logger.debug(`[Theme翻译] 处理本地化内容类型资源`);
      
      // 处理本地化内容
      if (contentFields.localeContent) {
        try {
          result.translationFields.localeContent = await translateThemeValue(
            contentFields.localeContent, 
            targetLang
          );
        } catch (error) {
          logger.error('[Theme翻译] 翻译localeContent失败:', error);
          result.translationFields.localeContent = contentFields.localeContent;
        }
      }
      break;

    case 'ONLINE_STORE_THEME_APP_EMBED':
    case 'ONLINE_STORE_THEME_SECTION_GROUP':
    case 'ONLINE_STORE_THEME_SETTINGS_CATEGORY':
      logger.debug(`[Theme翻译] 处理设置类型资源`);
      
      // 通用处理其他Theme资源类型
      for (const [key, value] of Object.entries(contentFields)) {
        if (shouldTranslateThemeField(key, value)) {
          try {
            const { protectedText, protectedMap } = protectLiquidVariables(value);
            let translatedText = await translateThemeValue(protectedText, targetLang);
            translatedText = restoreLiquidVariables(translatedText, protectedMap);
            translatedText = await postProcessTranslation(translatedText, targetLang, value, { linkConversion: options.linkConversion });

            result.translationFields[key] = translatedText;
          } catch (error) {
            logger.error(`[Theme翻译] 翻译字段失败 ${key}:`, error);
            result.translationFields[key] = value;
          }
        } else if (typeof value === 'object' && value !== null) {
          // 递归处理嵌套对象
          result.translationFields[key] = await translateThemeJsonData(value, targetLang, key);
        } else {
          result.translationFields[key] = value;
        }
      }
      break;

    default:
      logger.debug(`[Theme翻译] 未知的Theme资源类型: ${resourceType}，使用通用处理`);
      
      // 默认处理方式
      for (const [key, value] of Object.entries(contentFields)) {
        if (typeof value === 'string' && shouldTranslateThemeField(key, value)) {
          try {
            result.translationFields[key] = await translateThemeValue(value, targetLang);
          } catch (error) {
            logger.error(`[Theme翻译] 翻译字段失败 ${key}:`, error);
            result.translationFields[key] = value;
          }
        } else {
          result.translationFields[key] = value;
        }
      }
  }

  logger.debug(`[Theme翻译] Theme资源翻译完成: ${resource.id}`);
  return result;
}

/**
 * 验证Theme翻译结果
 * @param {Object} original - 原始数据
 * @param {Object} translated - 翻译后数据
 * @returns {boolean} 验证是否通过
 */
export function validateThemeTranslation(original, translated) {
  // 验证JSON结构是否保持一致
  if (typeof original !== typeof translated) {
    logger.error('[Theme翻译] 验证失败：数据类型不一致');
    return false;
  }
  
  if (typeof original === 'object' && original !== null) {
    const originalKeys = Object.keys(original);
    const translatedKeys = Object.keys(translated);
    
    // 验证键的数量是否一致
    if (originalKeys.length !== translatedKeys.length) {
      logger.error('[Theme翻译] 验证失败：键数量不一致');
      return false;
    }
    
    // 验证所有键都存在
    for (const key of originalKeys) {
      if (!(key in translated)) {
        logger.error(`[Theme翻译] 验证失败：缺少键 ${key}`);
        return false;
      }
    }
  }
  
  return true;
}

// 导出工具函数供测试使用
export { 
  shouldTranslateThemeField, 
  protectLiquidVariables, 
  restoreLiquidVariables,
  translateThemeJsonData 
};
