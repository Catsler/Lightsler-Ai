// 占位符/品牌词相关处理逻辑，供核心与后处理共用

// 🆕 占位符回退统计（内存存储，重启清空）
export const placeholderFallbackStats = new Map();

// 产品选项字段白名单：这些字段不进行品牌词检测
// 避免误判常见选项名（如Size/Color）为品牌词
export const SKIP_BRAND_CHECK_FIELDS = [
  'name',           // PRODUCT_OPTION.name
  'value',          // PRODUCT_OPTION_VALUE.name
  'optionName',     // contentFields.optionName
  'valueName'       // contentFields.valueName
];

// 品牌词和专有词词库（不翻译的词汇）
const BRAND_WORDS = new Set([
  // 科技品牌
  'apple', 'iphone', 'ipad', 'mac', 'macbook', 'macbook pro', 'imac', 'airpods', 'samsung', 'galaxy', 'pixel',
  'google', 'google pixel', 'google nest', 'google home', 'chromecast', 'microsoft', 'surface', 'xbox', 'playstation',
  'sony', 'ps4', 'ps5', 'nintendo', 'switch', 'lenovo', 'thinkpad', 'yoga', 'asus', 'rog', 'dell', 'alienware',
  'hp', 'omen', 'acer', 'predator', 'msi', 'razer', 'huawei', 'mate', 'p30', 'p40', 'matebook',
  'xiaomi', 'redmi', 'oppo', 'vivo', 'oneplus', 'motorola', 'nokia',
  
  // 时尚品牌
  'gucci', 'prada', 'louis vuitton', 'lv', 'chanel', 'hermes', 'burberry', 'versace', 'armani', 'dior', 'balenciaga',
  'fendi', 'celine', 'ysl', 'saint laurent', 'givenchy', 'loewe', 'valentino', 'tiffany', 'cartier',
  
  // 运动品牌
  'nike', 'adidas', 'puma', 'reebok', 'under armour', 'new balance', 'asics', 'fila', 'salomon', 'columbia',
  
  // 汽车品牌
  'tesla', 'bmw', 'audi', 'mercedes', 'mercedes-benz', 'benz', 'toyota', 'honda', 'nissan', 'lexus', 'porsche', 'volkswagen',
  'vw', 'ford', 'chevrolet', 'mazda', 'subaru', 'hyundai', 'kia', 'ferrari', 'lamborghini', 'aston martin',
  
  // 奢表与珠宝
  'rolex', 'omega', 'patek philippe', 'cartier', 'bvlgari', 'breitling', 'tag heuer',
  
  // 食品饮料品牌
  'coca-cola', 'coke', 'pepsi', 'starbucks', 'mcdonald', 'mcdonalds', 'kfc', 'subway', 'dominos', 'pizza hut',
  
  // 电商与支付
  'shopify', 'amazon', 'alibaba', 'aliexpress', 'paypal', 'stripe', 'visa', 'mastercard',
  
  // 通用技术词
  'usb', 'hdmi', 'bluetooth', 'wifi', 'gps', 'nfc', 'led', 'oled', 'lcd', 'amoled',
  'cpu', 'gpu', 'ram', 'ssd', 'hdd', 'api', 'sdk', 'app', 'web', 'ios', 'mac', 'pc',
  
  // 尺寸和单位
  'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl', 'oz', 'lb', 'kg', 'mm', 'cm',
  
  // 常见缩写
  'id', 'url', 'seo', 'ui', 'ux', 'css', 'html', 'js', 'php', 'sql', 'json', 'xml', 'pdf'
]);

// 技术术语模式 - 用于识别应该保持原文的技术内容
const TECHNICAL_PATTERNS = [
  /\b[A-Z]{2,}\b/g, // 全大写缩写 (GPS, USB, LED等)
  /\b\d+[a-zA-Z]+\b/g, // 数字+字母组合 (4K, 8GB, 256GB等)
  /\b[a-zA-Z]+\d+[a-zA-Z]*\b/g, // 字母+数字组合 (iPhone14, GTX1080等)
  /\b\w*-\w*\b/g, // 连字符词汇 (gore-tex, dry-fit等)
];

// 检查是否为技术术语
function isTechnicalTerm(word) {
  return TECHNICAL_PATTERNS.some(pattern => pattern.test(word));
}

export function isBrandWord(word) {
  if (!word) return false;
  // 检查是否在品牌词列表中
  if (BRAND_WORDS.has(word.toLowerCase())) {
    return true;
  }
  
  // 检查是否为技术术语模式
  if (isTechnicalTerm(word)) {
    return true;
  }
  
  // 检查是否为数字（版本号、尺寸等）
  if (/^\d+(\.\d+)?$/.test(word)) {
    return true;
  }
  
  // 检查是否为单位或度量
  if (/^(ml|kg|lb|oz|cm|mm|in|ft|yd|gal|qt|pt|fl|°c|°f)$/i.test(word)) {
    return true;
  }
  
  return false;
}

/**
 * 检查品牌词保护（最小版本）
 */
export function checkBrandWords(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { shouldSkip: false };
  }

  const trimmedText = text.trim();

  // 只对短文本生效（<50字符），降低误判
  if (trimmedText.length >= 50) {
    return { shouldSkip: false };
  }

  // 白名单字段跳过品牌词检测
  if (options.fieldName && SKIP_BRAND_CHECK_FIELDS.includes(options.fieldName)) {
    return { shouldSkip: false };
  }

  // 1. 产品Vendor字段保护
  if (options.fieldName === 'vendor' && trimmedText.length > 0) {
    return {
      shouldSkip: true,
      reason: 'vendor_field_protection'
    };
  }

  // 2. 常见品牌词模式
  if (/^[A-Z][a-z]+$/.test(trimmedText) && trimmedText.length >= 3) {
    return {
      shouldSkip: true,
      reason: 'brand_word_pattern'
    };
  }

  // 3. 产品代码/SKU模式
  if (/^[A-Z]{2,}[-_]?\d+/.test(trimmedText)) {
    return {
      shouldSkip: true,
      reason: 'product_code_pattern'
    };
  }

  // 4. 技术术语（全大写）
  if (/^[A-Z]{2,}$/.test(trimmedText)) {
    return {
      shouldSkip: true,
      reason: 'technical_acronym'
    };
  }

  return { shouldSkip: false };
}

/**
 * 占位符/配置键回退处理
 * 返回 { handled: true, result } 表示已处理；否则 { handled: false }
 */
export async function handlePlaceholderFallback(params) {
  const {
    originalText,
    translatedText,
    targetLang,
    statsMap = placeholderFallbackStats,
    logger,
    isLikelyConfigKey,
    translateConfigKeyWithFallback
  } = params || {};

  if (!originalText || typeof translatedText !== 'string') {
    return { handled: false };
  }

  if (originalText.includes('__PROTECTED_')) {
    return { handled: false };
  }

  if (!translatedText.includes('__PROTECTED_')) {
    return { handled: false };
  }

  const placeholderPattern = /^__PROTECTED_[A-Z_]+_?[A-Z_]*__$/;
  if (!placeholderPattern.test(translatedText.trim())) {
    return { handled: false };
  }

  if (typeof isLikelyConfigKey === 'function' && isLikelyConfigKey(originalText)) {
    logger?.info?.('检测到配置键占位符，尝试使用备用策略', {
      originalText,
      targetLang,
      textLength: originalText.length
    });

    if (typeof translateConfigKeyWithFallback === 'function') {
      const fallbackResponse = await translateConfigKeyWithFallback(originalText, targetLang);
      if (fallbackResponse?.success) {
        return { handled: true, result: fallbackResponse };
      }
      logger?.warn?.('配置键备用翻译策略未能产出有效结果', {
        originalText,
        targetLang,
        fallbackError: fallbackResponse?.error
      });
    }
  }

  // 更新占位符回退统计
  const currentCount = statsMap.get(targetLang) || 0;
  statsMap.set(targetLang, currentCount + 1);

  logger?.warn?.('检测到异常占位符生成，回退到原文', {
    originalText,
    translatedText,
    textLength: originalText.length,
    targetLang
  });

  logger?.info?.('[METRICS] placeholder_fallback', {
    type: 'placeholder_fallback',
    language: targetLang,
    text_length: originalText.length,
    original_text: originalText.substring(0, 50),
    placeholder: translatedText,
    fallback_count: statsMap.get(targetLang),
    timestamp: Date.now()
  });

  if (originalText.length < 50 && !originalText.includes('<') && !originalText.includes('>')) {
    logger?.error?.('短文本被错误转换为占位符', {
      text: originalText,
      translatedText,
      targetLang
    });
  }

  return { handled: true, result: { success: true, text: originalText, fallback: 'placeholder_error', isOriginal: true, language: targetLang } };
}
