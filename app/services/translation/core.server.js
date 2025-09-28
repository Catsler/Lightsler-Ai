/**
 * GPT翻译API服务
 */

import { config } from '../../utils/config.server.js';
import { collectError, ERROR_TYPES } from '../error-collector.server.js';

// 导入新的工具函数
import {
  createTranslationAPIClient,
  createInMemoryCache,
  createRequestDeduplicator
} from './api-client.server.js';
import {
  chunkText,
  protectHtmlTags,
  restoreHtmlTags,
  isLikelyHtml
} from './chunking.server.js';
import { applyPostProcessors } from './post-processors.server.js';
import { 
  TranslationError, 
  withErrorHandling, 
  createErrorResponse, 
  ErrorCollector 
} from '../../utils/error-handler.server.js';
import {
  logger,
  apiLogger,
  validationLogger,
  logShortTextTranslation,
  logTranslationQuality,
  logEnglishRemnants,
  createTranslationLogger,
  memoryLogReader,
  persistentLogReader,
  forceFlushPersistentLogs,
  persistenceConfig
} from '../../utils/logger.server.js';

// 导入质量分析器
import { qualityErrorAnalyzer } from '../quality-error-analyzer.server.js';

// 导入内存缓存服务
import {
  getCachedTranslation,
  setCachedTranslation,
  getMemoryCache
} from '../memory-cache.server.js';

// 提示词与语言名称
import {
  buildConfigKeyPrompt,
  buildEnhancedPrompt,
  buildSimplePrompt,
  getLanguageName
} from './prompts.server.js';
import {
  evaluateCompleteness,
  evaluateTranslationQuality
} from './validators.server.js';
import { recordTranslationCall, getTranslationMetrics } from './metrics.server.js';

// 导入crypto用于生成哈希
import crypto from 'crypto';

// 导入Sequential Thinking核心服务
import {
  DecisionEngine,
  TranslationScheduler
} from '../sequential-thinking-core.server.js';

const translationLogger = createTranslationLogger('TRANSLATION');

const translationApiCache = createInMemoryCache({ ttlSeconds: config.translation.cacheTTL ?? 3600 });
const translationApiDeduplicator = createRequestDeduplicator();

const translationClient = createTranslationAPIClient({
  maxRetries: config.translation.maxRetries ?? 2,
  retryDelay: config.translation.retryDelay ?? 1000,
  useExponentialBackoff: true,
  cache: translationApiCache,
  cacheTTL: config.translation.cacheTTL ?? 3600,
  deduplicate: translationApiDeduplicator
});

async function executeTranslationRequest({ text, targetLang, systemPrompt, strategy, context = {}, fallbacks = [] }) {
  const response = await translationClient.execute({
    text,
    targetLang,
    systemPrompt,
    context,
    strategy,
    fallbacks
  });

  recordTranslationCall({
    success: response.success,
    strategy: response.meta?.strategy ?? strategy,
    targetLang,
    duration: response.meta?.duration ?? 0,
    cached: response.meta?.cached ?? false,
    retries: response.meta?.retries ?? 0
  });

  return response;
}

const CONFIG_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

function isLikelyConfigKey(text) {
  if (typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 120) {
    return false;
  }

  return CONFIG_KEY_PATTERN.test(trimmed);
}

function toReadableConfigKey(text) {
  return text
    .split('_')
    .filter(Boolean)
    .map(segment => segment.trim())
    .join(' ');
}

async function translateConfigKeyWithFallback(originalText, targetLang) {
  const normalizedText = toReadableConfigKey(originalText);
  const startTime = Date.now();

  logger.info('配置键备用翻译策略触发', {
    originalText,
    normalizedText,
    targetLang
  });

  const fallbackPrompt = buildConfigKeyPrompt(targetLang);

  const result = await executeTranslationRequest({
    text: normalizedText,
    targetLang,
    systemPrompt: fallbackPrompt,
    strategy: 'config-key',
    context: {
      functionName: 'translateConfigKeyWithFallback',
      originalText,
      normalizedText
    }
  });

  if (!result.success) {
    return {
      success: false,
      text: originalText,
      error: result.error || '备用翻译调用失败',
      isOriginal: true,
      language: targetLang
    };
  }

  const translatedText = (result.text || '').trim();

  // 清理错误生成的占位符 - 如果整个翻译变成了占位符，使用标准化的原文
  const cleanedText = translatedText.replace(/^__PROTECTED_[A-Z_]+__$/, normalizedText);

  if (!cleanedText) {
    return {
      success: false,
      text: originalText,
      error: '备用翻译返回空结果',
      isOriginal: true,
      language: targetLang
    };
  }

  // 检查清理后的文本是否仍包含占位符
  if (cleanedText.includes('__PROTECTED_')) {
    return {
      success: false,
      text: originalText,
      error: '备用翻译仍返回占位符',
      isOriginal: true,
      language: targetLang
    };
  }

  const processingTime = Date.now() - startTime;

  logger.logTranslationSuccess(originalText, cleanedText, {
    processingTime,
    strategy: 'config-key-fallback',
    tokenUsage: result.tokenLimit
  });

  return {
    success: true,
    text: cleanedText,
    isOriginal: false,
    language: targetLang,
    processingTime
  };
}
export { translationLogger };

/**
 * 带超时的fetch函数
 * @param {string} url - 请求URL
 * @param {Object} options - fetch选项
 * @param {number} timeout - 超时时间（毫秒），默认30秒
 */
async function fetchWithTimeout(url, options, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeout/1000}秒）`);
    }
    throw error;
  }
}

/**
 * 语言代码到语言名称的映射
 * @param {string} langCode - 语言代码
 * @returns {string} 语言名称
 */

/**
 * 调用GPT翻译API，支持重试机制
 * @param {string} text - 待翻译文本
 * @param {string} targetLang - 目标语言代码
 * @param {number} retryCount - 当前重试次数
 * @returns {Promise<string>} 翻译结果
 */
// 品牌词和专有词词库（不翻译的词汇）
const BRAND_WORDS = new Set([
  // 科技品牌
  'shopify', 'apple', 'google', 'microsoft', 'samsung', 'huawei', 'xiaomi', 'oppo', 'vivo',
  'intel', 'amd', 'nvidia', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'msi',
  
  // 产品名称
  'iphone', 'android', 'macbook', 'ipad', 'xbox', 'playstation', 'nintendo', 'airpods',
  'surface', 'galaxy', 'pixel', 'oneplus', 'realme', 'redmi',
  
  // 服装和运动品牌
  'nike', 'adidas', 'puma', 'reebok', 'under', 'armour', 'new', 'balance', 'converse',
  'vans', 'timberland', 'columbia', 'patagonia', 'north', 'face', 'uniqlo', 'zara',
  
  // 食品饮料品牌
  'coca-cola', 'pepsi', 'starbucks', 'mcdonalds', 'kfc', 'subway', 'dominos', 'pizza', 'hut',
  
  // 汽车品牌
  'toyota', 'honda', 'nissan', 'mazda', 'subaru', 'bmw', 'mercedes', 'benz', 'audi',
  'volkswagen', 'ford', 'tesla', 'chevrolet', 'hyundai', 'kia',
  
  // 材料和规格术语
  'cotton', 'polyester', 'nylon', 'spandex', 'lycra', 'fleece', 'denim', 'canvas',
  'leather', 'suede', 'mesh', 'ripstop', 'cordura', 'gore-tex', 'dry-fit',
  
  // 技术规格
  'usb', 'hdmi', 'bluetooth', 'wifi', 'gps', 'nfc', 'led', 'oled', 'lcd', 'amoled',
  'cpu', 'gpu', 'ram', 'ssd', 'hdd', 'api', 'sdk', 'app', 'web', 'ios', 'mac', 'pc',
  
  // 尺寸和单位
  'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl', 'oz', 'lb', 'kg', 'mm', 'cm',
  
  // 常见缩写
  'id', 'url', 'seo', 'ui', 'ux', 'css', 'html', 'js', 'php', 'sql', 'json', 'xml', 'pdf',
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

// 语言特定的断句规则
const SEGMENTATION_RULES = {
  'zh-CN': {
    // 中文：按完整词语单位断句，每个词作为独立语义单元
    segmentLength: 1,
    connector: '-',
    // 改进的正则：识别完整的中文词汇单元，不限制长度，让GPT决定语义边界
    wordPattern: /[\u4e00-\u9fff]+|[a-zA-Z]+(?:\s+[a-zA-Z]+)*\d*|[0-9]+[a-zA-Z]*|\d{4}/g
  },
  'ja': {
    // 日文：按词汇单位，品牌在前功能在后
    segmentLength: 1,
    connector: '-',
    // 改进的正则：识别日文词汇、片假名外来语、汉字词
    wordPattern: /[\u3040-\u309f]+|[\u30a0-\u30ff]+|[\u4e00-\u9fff]+|[a-zA-Z]+(?:\s+[a-zA-Z]+)*\d*|[0-9]+/g
  },
  'ko': {
    // 韩文：按词汇单位，保持自然语序
    segmentLength: 1,
    connector: '-',
    // 改进的正则：识别韩文音节组合、汉字词
    wordPattern: /[\uac00-\ud7af]+|[\u1100-\u11ff]+|[\u3130-\u318f]+|[\ua960-\ua97f]+|[\ud7b0-\ud7ff]+|[a-zA-Z]+(?:\s+[a-zA-Z]+)*\d*|[0-9]+/g
  },
  'en': {
    // 英文：按单词单位，每个词作为语义单元
    segmentLength: 1,
    connector: '-',
    // 识别完整单词、缩写、数字组合
    wordPattern: /\b[a-zA-Z]+(?:[-'][a-zA-Z]+)*\b|\b\d+[a-zA-Z]*\b|\b[A-Z]{2,}\b/g
  },
  'es': {
    // 西班牙语：类似英文处理
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b[a-zA-Z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00d1]+\b|\b\d+[a-zA-Z]*\b/g
  },
  'fr': {
    // 法语：处理特殊字符
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b[a-zA-Z\u00e0\u00e2\u00e4\u00e6\u00e7\u00e9\u00e8\u00ea\u00eb\u00ef\u00ee\u00f4\u00f9\u00fb\u00fc\u00ff\u0153\u00c0\u00c2\u00c4\u00c6\u00c7\u00c9\u00c8\u00ca\u00cb\u00cf\u00ce\u00d4\u00d9\u00db\u00dc\u0178\u0152]+\b|\b\d+[a-zA-Z]*\b/g
  },
  'de': {
    // 德语：处理复合词和特殊字符
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b[a-zA-Z\u00e4\u00f6\u00fc\u00df\u00c4\u00d6\u00dc]+\b|\b\d+[a-zA-Z]*\b/g
  },
  'default': {
    // 其他语言：通用处理
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b\w+\b/g
  }
};;;

// 标准化URL handle格式
// 清理翻译结果，移除乱码和冗余词
function cleanTranslationResult(text, targetLang) {
  if (!text || !text.trim()) {
    return text;
  }
  
  // 移除常见的翻译乱码和无意义字符
  let cleaned = text
    .replace(/[^\w\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u00c0-\u017f\u0100-\u024f\u1e00-\u1eff.-]/g, ' ') // 保留基本字符和扩展拉丁字符
    .replace(/\s+/g, ' ') // 合并多个空格
    .trim();
  
  // 检测并移除可能的乱码模式
  // 移除单独的无意义字符或数字
  cleaned = cleaned.replace(/\b[a-z]\b/gi, ' '); // 移除单独的字母
  cleaned = cleaned.replace(/\b\d{1,2}\b/g, ' '); // 移除单独的1-2位数字（保留年份等）
  
  // 按语言特定规则清理
  if (targetLang === 'zh-CN') {
    // 中文：移除常见冗余词和虚词
    cleaned = cleaned
      .replace(/\b(的|了|是|在|有|和|与|或|等|及|以及|还有|另外|此外|包括|含有|具有|拥有|带有|所有|全部|整个|各种|多种|某些|一些|这个|那个|这些|那些)\b/g, ' ')
      .replace(/\b(产品|商品|物品|用品|设备|装置|系列|款式|型号|规格|类型|种类|品种|版本|样式)\b/g, ' ')
      .replace(/\b(新款|新品|新型|最新|全新|正品|原装|正版|官方|专用|通用|适用|专业|高级|优质|精品|特价|促销|热销|畅销)\b/g, ' ');
  } else if (targetLang === 'ja') {
    // 日文：移除常见助词、冗余词和形式名词
    cleaned = cleaned
      .replace(/\b(の|が|を|に|で|と|は|へ|から|まで|より|など|や|か|も|で|として|について|における|による|によって|のための|ための|もの|こと|ところ)\b/g, ' ')
      .replace(/\b(製品|商品|アイテム|用品|機器|装置|シリーズ|モデル|タイプ|スタイル|バージョン|エディション)\b/g, ' ')
      .replace(/\b(新しい|新品|新型|最新|全新|正品|オリジナル|公式|専用|汎用|適用|専門|高級|優良|特価|セール|人気|売れ筋)\b/g, ' ');
  } else if (targetLang === 'ko') {
    // 韩文：移除常见助词和冗余词
    cleaned = cleaned
      .replace(/\b(의|이|가|을|를|에|에서|와|과|로|으로|부터|까지|보다|등|나|도|만|라서|하고|그리고|또는|혹은|및|그리고|또한|역시)\b/g, ' ')
      .replace(/\b(제품|상품|용품|기기|장치|시리즈|모델|타입|스타일|버전|에디션)\b/g, ' ')
      .replace(/\b(새로운|신품|신형|최신|정품|오리지널|공식|전용|범용|적용|전문|고급|우수|특가|세일|인기|베스트)\b/g, ' ');
  } else {
    // 英文及其他语言：移除常见冗余词、冠词、介词等
    cleaned = cleaned
      .replace(/\b(the|a|an|and|or|of|for|with|in|on|at|by|from|to|as|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|can|must|shall|very|really|quite|rather|too|so|such|more|most|much|many|some|any|all|each|every|this|that|these|those)\b/gi, ' ')
      .replace(/\b(product|products|item|items|goods|equipment|device|devices|series|collection|style|styles|type|types|model|models|version|versions|edition|editions|set|sets|kit|kits|pack|packs|bundle|bundles)\b/gi, ' ')
      .replace(/\b(new|newest|latest|original|official|genuine|authentic|professional|premium|quality|special|sale|hot|best|top|super|ultra|mega|extra)\b/gi, ' ');
  }
  
  // 最终清理
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .trim();
  
  // 如果清理后为空或过短，返回原文的安全版本
  if (cleaned.length < 2) {
    return text.replace(/[^\w\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af-]/g, '').replace(/\s+/g, ' ').trim();
  }
  
  return cleaned;
}

function normalizeHandle(text) {
  if (!text || !text.trim()) {
    return '';
  }
  
  return text
    .toLowerCase()
    // 保留字母、数字、中日韩文字符、扩展拉丁字符，以及少数安全标点
    .replace(/[^\w\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u00c0-\u017f\u0100-\u024f\u1e00-\u1eff.-]/g, ' ')
    // 替换各种空白字符为标准空格
    .replace(/[\s\u00a0\u2000-\u200b\u202f\u3000\ufeff]+/g, ' ')
    // 处理点号：连续的点号合并为一个
    .replace(/\.{2,}/g, '.')
    // 移除孤立的点号（前后都是空格的点）
    .replace(/\s+\.\s+/g, ' ')
    // 确保使用连字符作为唯一分词符
    // 空格、下划线、多个连字符都统一替换为单个连字符
    .replace(/[\s_]+/g, '-')
    // 合并多个连字符
    .replace(/-{2,}/g, '-')
    // 清理开头和结尾的连字符或点号
    .replace(/^[-.]+|[-.]+$/g, '')
    // 确保不会过长（URL友好）
    .substring(0, 60)
    // 再次清理结尾可能产生的连字符
    .replace(/[-.]+$/, '')
    // 最终检查：如果结果太短或为空，返回一个基于时间戳的默认值
    || 'untitled-' + Date.now().toString(36).slice(-6);
}

// 检查是否为品牌词
export function isBrandWord(word) {
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

// 智能分词和断句
function intelligentSegmentation(text, targetLang) {
  const rules = SEGMENTATION_RULES[targetLang] || SEGMENTATION_RULES['default'];
  
  // 扩展的品牌词和专有名词列表（保持不变）
  // 包含更多科技、时尚、汽车、食品等行业品牌
  const brandWords = /\b(?:apple|iphone|ipad|macbook|imac|airpods|nike|adidas|puma|reebok|under\s?armour|samsung|galaxy|google|pixel|chrome|microsoft|windows|office|xbox|facebook|meta|instagram|whatsapp|amazon|aws|tesla|model\s?[sxy3]|bmw|mercedes|benz|audi|toyota|honda|mazda|ford|chevrolet|volkswagen|porsche|ferrari|lamborghini|rolex|omega|cartier|tiffany|gucci|prada|louis\s?vuitton|lv|chanel|hermes|burberry|versace|armani|dior|balenciaga|zara|h&m|uniqlo|gap|levis|sony|playstation|ps[45]|canon|nikon|fujifilm|gopro|dji|bose|jbl|beats|starbucks|mcdonald|kfc|subway|coca\s?cola|pepsi|nestle|visa|mastercard|paypal|stripe|shopify|wordpress|adobe|photoshop|netflix|spotify|youtube|tiktok|linkedin|twitter|reddit|alibaba|taobao|tmall|jd|baidu|tencent|wechat|qq|huawei|xiaomi|oppo|vivo|oneplus|lenovo|dell|hp|asus|acer|intel|amd|nvidia|qualcomm|bluetooth|wifi|usb|hdmi|4k|5g|ai|ml|vr|ar|nft|crypto|bitcoin|ethereum|java|python|javascript|react|vue|angular|node|docker|kubernetes|aws|azure|gcp)\b/gi;
  
  // 保护品牌词 - 确保品牌词不被分割
  const protectedText = text.replace(brandWords, (match) => {
    // 保持品牌词完整，将内部空格临时替换为特殊标记
    return match.replace(/\s+/g, '___BRAND_SPACE___');
  });
  
  // 提取所有词汇单元
  let words = protectedText.match(rules.wordPattern) || [];
  
  // 还原品牌词中的空格
  words = words.map(word => word.replace(/___BRAND_SPACE___/g, ' '));
  
  // 过滤和清理
  words = words
    .map(word => word.trim())
    .filter(word => word.length > 0)
    .filter(word => {
      // 过滤纯标点符号和无意义字符
      return !/^[\s\u00a0\u2000-\u200b\u202f\u3000\ufeff]*$/.test(word) && 
             !/^[^\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]*$/.test(word);
    });
  
  // 智能去重 - 保留语义不同的词
  const uniqueWords = [];
  const seenWords = new Set();
  const seenBrands = new Set();
  
  for (let word of words) {
    const normalizedWord = word.toLowerCase();
    
    // 检查是否为品牌词
    if (brandWords.test(word)) {
      // 品牌词特殊处理：即使重复也可能需要保留（如 "Apple iPhone Apple Watch"）
      const brandKey = word.toLowerCase().replace(/\s+/g, '');
      if (!seenBrands.has(brandKey)) {
        seenBrands.add(brandKey);
        uniqueWords.push(word);
      }
    } else if (!seenWords.has(normalizedWord)) {
      // 非品牌词正常去重
      seenWords.add(normalizedWord);
      
      // 对于中文，检查是否为完整的语义单元
      if (targetLang === 'zh-CN' && /[\u4e00-\u9fff]/.test(word)) {
        // 确保中文词是完整的语义单元，不是单个字符（除非是有意义的单字词）
        if (word.length === 1) {
          // 单字词白名单（常见的有意义的单字词）
          const singleCharWhitelist = /^[买卖租售新旧大小好坏高低快慢男女老少]$/;
          if (singleCharWhitelist.test(word)) {
            uniqueWords.push(word);
          }
        } else {
          uniqueWords.push(word);
        }
      } else {
        uniqueWords.push(word);
      }
    }
  }
  
  // 根据目标语言调整词序
  let finalWords = uniqueWords;
  
  // 某些语言可能需要调整词序以符合自然语序
  if (targetLang === 'ja' || targetLang === 'ko') {
    // 日韩语言：品牌/产品名通常在前，描述在后
    const brands = [];
    const others = [];
    
    for (let word of finalWords) {
      if (brandWords.test(word)) {
        brands.push(word);
      } else {
        others.push(word);
      }
    }
    
    finalWords = [...brands, ...others];
  }
  
  // 限制词汇数量，避免过长的URL
  // 中日韩语言词汇更紧凑，可以少一些；西方语言可以多一些
  const maxWords = (targetLang === 'zh-CN' || targetLang === 'ja' || targetLang === 'ko') ? 5 : 6;
  
  // 优先保留品牌词和关键词
  if (finalWords.length > maxWords) {
    const prioritizedWords = [];
    const brandWordsInList = [];
    const otherWords = [];
    
    for (let word of finalWords) {
      if (brandWords.test(word)) {
        brandWordsInList.push(word);
      } else {
        otherWords.push(word);
      }
    }
    
    // 先加入品牌词
    prioritizedWords.push(...brandWordsInList);
    
    // 再加入其他词直到达到限制
    const remainingSlots = maxWords - prioritizedWords.length;
    prioritizedWords.push(...otherWords.slice(0, remainingSlots));
    
    finalWords = prioritizedWords;
  }
  
  return finalWords.join(rules.connector);
}

/**
 * @deprecated 不再自动翻译 URL handle（SEO 最佳实践）
 * 保留此函数仅供未来手动/审核场景使用
 * 自动翻译功能已禁用 - 2025-01-19
 *
 * URL handle 应保持原始状态以维护：
 * - SEO 排名稳定性
 * - 外部链接有效性
 * - 用户书签和分享链接
 * - Shopify 平台最佳实践
 */
export async function translateUrlHandle(handle, targetLang, retryCount = 0) {
  logger.debug(`[translateUrlHandle] 函数被调用: handle="${handle}", targetLang="${targetLang}", retry=${retryCount}`);
  
  if (!handle || !handle.trim()) {
    logger.debug(`[translateUrlHandle] Handle为空，返回原值`);
    return handle;
  }

  // 如果没有配置API密钥，返回原handle
  if (!config.translation.apiKey) {
    logger.warn('[translateUrlHandle] 未配置GPT_API_KEY，返回原handle');
    return handle;
  }

  // 首先标准化输入的handle
  const normalizedHandle = handle.replace(/-/g, ' ').replace(/[_]/g, ' ');
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.translation.apiKey}`,
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.translation.timeout);
    
    // 构建专门的URL handle翻译提示词
    const systemPrompt = `你是专业的URL handle翻译和语义分析专家。请将用户输入的文本翻译成${getLanguageName(targetLang)}，生成URL友好的标识符。

核心原则：
1. 【品牌保护】品牌名、专有名词、产品型号保持原文不译（如：Apple、Nike、iPhone、Model 3、PS5等）
2. 【语义单元】每个词必须是独立的、完整的语义单元，有明确含义
3. 【自然语序】按${getLanguageName(targetLang)}的自然语序排列词汇，确保符合目标语言习惯
4. 【避免冗余】去除所有重复词汇、填充词、无意义修饰词、助词、介词等
5. 【关键词优先】只保留最核心的3-5个关键词，删除所有冗余描述
6. 【字符净化】避免产生乱码、特殊符号、无意义字符、单独的字母或数字

翻译规则：
- 每个词都必须有独立的语义价值，能够单独传达意义
- 输出格式：用空格分隔的关键词序列（系统会自动转换为连字符）
- ${targetLang === 'zh-CN' ? '中文特别注意：按完整词汇分割，不按字符。例如"手机壳"是一个完整词，不应分成"手机"和"壳"；"蓝牙耳机"应保持为一个词或分为"蓝牙 耳机"两个语义单元' : ''}
- ${targetLang === 'zh-CN' ? '中文核心词提取：名词和核心动词，去除"的、了、是、在、有"等虚词' : ''}
- ${targetLang === 'ja' ? '日文：品牌在前，功能描述在后，去除助词"の、が、を、に、で"等' : ''}
- ${targetLang === 'ko' ? '韩文：保持自然语序，去除助词"의、이、가、을、를"等' : ''}
- ${targetLang.startsWith('en') ? '英文：去除冠词、介词、连词，只保留名词和关键形容词' : ''}
- 结果必须简洁有力，突出产品/内容的核心特征
- 只返回最终的关键词序列，用空格分隔，无需任何解释

品牌词典（保持不变）：
Apple|iPhone|iPad|MacBook|iMac|AirPods|Samsung|Galaxy|Nike|Adidas|Puma|Reebok|Under Armour|
Sony|PlayStation|PS4|PS5|Canon|Nikon|Fujifilm|GoPro|DJI|BMW|Mercedes|Benz|Audi|Toyota|Honda|
Google|Microsoft|Amazon|Tesla|Model S|Model 3|Model X|Model Y|Facebook|Meta|Instagram|WhatsApp|
Starbucks|McDonald|KFC|Coca-Cola|Pepsi|Visa|MasterCard|PayPal|Shopify|
Gucci|Prada|Louis Vuitton|LV|Chanel|Hermes|Burberry|Versace|Armani|Dior|Balenciaga|
Rolex|Omega|Cartier|Tiffany|Zara|H&M|Uniqlo|Gap|Levis|
Intel|AMD|NVIDIA|Qualcomm|Bluetooth|WiFi|USB|HDMI|4K|5G|AI|ML|VR|AR|NFT等。

示例（严格按语义单元分词）：
- "Apple iPhone 15 Pro Max Case" → "${targetLang === 'zh-CN' ? 'Apple iPhone 15 Pro Max 手机壳' : targetLang === 'ja' ? 'Apple iPhone 15 Pro Max ケース' : 'Apple iPhone 15 Pro Max Case'}"
- "Nike Running Shoes for Men" → "${targetLang === 'zh-CN' ? 'Nike 男士 跑鞋' : targetLang === 'ja' ? 'Nike メンズ ランニング シューズ' : 'Nike Mens Running Shoes'}"
- "Wireless Bluetooth Headphones" → "${targetLang === 'zh-CN' ? '无线蓝牙耳机' : targetLang === 'ja' ? 'ワイヤレス Bluetooth ヘッドホン' : 'Wireless Bluetooth Headphones'}"
- "Smart Home Security Camera" → "${targetLang === 'zh-CN' ? '智能家居 安防摄像头' : targetLang === 'ja' ? 'スマートホーム セキュリティ カメラ' : 'Smart Home Security Camera'}"
- "Organic Green Tea" → "${targetLang === 'zh-CN' ? '有机绿茶' : targetLang === 'ja' ? 'オーガニック 緑茶' : 'Organic Green Tea'}"`;
    
    try {
      logger.debug(`正在翻译URL handle: "${normalizedHandle}" -> ${getLanguageName(targetLang)}`);
      
      const response = await fetchWithTimeout(`${config.translation.apiUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.translation.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: normalizedHandle
            }
          ],
          temperature: 0.2, // 更低的温度确保一致性
          max_tokens: Math.floor(100), // URL handle不需要太长
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`URL handle翻译API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // 安全地解析 JSON 响应
      let result;
      const responseText = await response.text();
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('URL handle JSON 解析错误', { error: parseError.message, targetLang });
        logger.error('响应内容前1000字符', { sample: responseText.substring(0, 1000) });
        throw new Error(`URL handle API响应JSON解析失败: ${parseError.message}`);
      }
      
      if (result.choices && result.choices[0] && result.choices[0].message) {
        const translatedText = result.choices[0].message.content.trim();
        
        // 清理翻译结果，移除乱码和冗余词
        const cleanedText = cleanTranslationResult(translatedText, targetLang);
        
        // 应用智能断句规则
        const segmentedText = intelligentSegmentation(cleanedText, targetLang);
        
        // 标准化为URL friendly格式
        const finalHandle = normalizeHandle(segmentedText);
        
        logger.debug('URL handle翻译完成', { handle, finalHandle, targetLang });
        return finalHandle;
      }
      
      throw new Error('URL handle翻译API响应格式异常');
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
    
  } catch (error) {
    logger.error(`URL handle翻译服务错误 (尝试 ${retryCount + 1}/${config.translation.maxRetries}):`, error);
    
    // 网络错误重试逻辑
    if ((error.name === 'AbortError' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed')) 
        && retryCount < config.translation.maxRetries - 1) {
      logger.debug(`URL handle翻译失败，${2000 * (retryCount + 1)}ms后进行第${retryCount + 2}次尝试...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return translateUrlHandle(handle, targetLang, retryCount + 1);
    }
    
    // 如果翻译失败，应用基本的智能断句到原handle
    logger.warn(`URL handle翻译失败，应用智能断句到原文: ${error.message}`);
    const segmentedHandle = intelligentSegmentation(normalizedHandle, targetLang);
    return normalizeHandle(segmentedHandle);
  }
}

export async function translateTextWithFallback(text, targetLang, options = {}) {
  const normalizedText = typeof text === 'string' ? text : '';

  if (!normalizedText.trim()) {
    return {
      success: true,
      text: normalizedText,
      isOriginal: true,
      language: targetLang
    };
  }

  const allowSimplePrompt = options.allowSimplePrompt !== false;
  const retryCount = options.retryCount ?? 0;
  const additionalFallbacks = Array.isArray(options.fallbacks) ? options.fallbacks : [];
  const postProcessOptions = options.postProcess || {};
  const linkConversion = options.linkConversion;

  const fallbackStrategies = [];

  if (allowSimplePrompt) {
    fallbackStrategies.push({
      name: 'simple',
      prepare: ({ text: originalText, targetLang: lang }) => ({
        text: originalText,
        targetLang: lang,
        systemPrompt: buildSimplePrompt(lang),
        strategy: 'simple',
        extras: { mode: 'simple' },
        cacheKeyExtras: { mode: 'simple' },
        optionsOverride: { maxRetries: 1 }
      })
    });
  }

  for (const fallback of additionalFallbacks) {
    if (fallback) {
      fallbackStrategies.push(fallback);
    }
  }

  const response = await translationClient.execute({
    text: normalizedText,
    targetLang,
    systemPrompt: buildEnhancedPrompt(targetLang),
    strategy: 'enhanced',
    context: {
      functionName: options.context?.functionName || 'translateTextWithFallback',
      retryCount,
      ...options.context
    },
    fallbacks: fallbackStrategies
  });

  if (response.success) {
    const postProcessContext = {
      targetLang,
      originalText: normalizedText,
      ...postProcessOptions,
      linkConversion: linkConversion || postProcessOptions.linkConversion
    };

    response.text = await applyPostProcessors(response.text, postProcessContext);
    return response;
  }

  if (options.allowOriginalFallback === false) {
    return response;
  }

  logger.warn('所有翻译策略失败，已保留原文', {
    targetLang,
    textLength: normalizedText.length,
    lastError: response.error
  });

  return {
    ...response,
    success: false,
    text: normalizedText,
    isOriginal: true,
    error: response.error || '翻译失败，已保留原文',
    meta: {
      ...(response.meta || {}),
      degraded: {
        name: 'return-original'
      }
    }
  };
}

export async function postProcessTranslation(translatedText, targetLang, originalText = '', options = {}) {
  if (translatedText == null || typeof translatedText !== 'string') {
    return translatedText;
  }

  const context = {
    targetLang,
    originalText,
    ...(options || {})
  };

  return applyPostProcessors(translatedText, context);
}

export async function translateText(text, targetLang, options = {}) {
  let retryCount = 0;
  let optionPayload = {};

  if (typeof options === 'number') {
    retryCount = options;
    optionPayload = { retryCount };
  } else if (options && typeof options === 'object') {
    retryCount = options.retryCount ?? 0;
    optionPayload = { ...options, retryCount };
  } else {
    optionPayload = { retryCount };
  }

  const result = await translateTextWithFallback(text, targetLang, optionPayload);

  if (!result.success) {
    throw new TranslationError(`翻译失败: ${result.error || '未知错误'}`, {
      code: result.errorCode || 'TRANSLATION_FAILED',
      category: 'TRANSLATION',
      retryable: result.retryable ?? true,
      context: {
        targetLang,
        retryCount,
        isOriginal: result.isOriginal ?? false
      }
    });
  }

  const normalizedOriginal = (text || '').trim().toLowerCase();
  const normalizedTranslated = (result.text || '').trim().toLowerCase();

  if ((result.isOriginal || normalizedOriginal === normalizedTranslated) && normalizedOriginal) {
    throw new TranslationError('翻译未生效，返回原文', {
      code: 'TRANSLATION_NOT_EFFECTIVE',
      category: 'TRANSLATION',
      retryable: true,
      context: {
        targetLang,
        retryCount,
        originalSample: (text || '').trim().slice(0, 200),
        translatedSample: (result.text || '').trim().slice(0, 200)
      }
    });
  }

  return result.text;
}

/**
 * 增强版翻译函数，返回详细的状态信息
 * @param {string} text - 要翻译的文本
 * @param {string} targetLang - 目标语言
 * @param {number} retryCount - 重试次数
 * @returns {Promise<{success: boolean, text: string, error?: string, isOriginal?: boolean, language?: string}>}
 */
export async function translateTextEnhanced(text, targetLang, options = {}) {
  const runtimeOptions = typeof options === 'number' ? { retryCount: options } : { ...(options || {}) };
  const retryCount = runtimeOptions.retryCount ?? 0;
  const postProcessOptions = runtimeOptions.postProcess || {};
  const linkConversion = runtimeOptions.linkConversion;

  if (!text || !text.trim()) {
    return {
      success: true,
      text,
      isOriginal: true
    };
  }

  if (!config.translation.apiKey) {
    logger.warn('API密钥未配置，返回原文');
    return createErrorResponse(new Error('API密钥未配置'), text);
  }

  if (text.length > config.translation.longTextThreshold) {
    logger.info('文本超过长度阈值，使用长文本翻译策略', {
      textLength: text.length,
      threshold: config.translation.longTextThreshold
    });
    return translateLongTextEnhanced(text, targetLang, {
      postProcess: postProcessOptions,
      linkConversion,
      maxChunkSize: runtimeOptions.maxChunkSize
    });
  }

  logger.logTranslationStart(text, targetLang, { strategy: 'enhanced' });

  const systemPrompt = buildEnhancedPrompt(targetLang);

  const translationFunction = withErrorHandling(async () => {
    const startTime = Date.now();

    const result = await executeTranslationRequest({
      text,
      targetLang,
      systemPrompt,
      strategy: 'enhanced',
      context: {
        functionName: 'translateTextEnhanced',
        attempt: retryCount + 1
      }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const translatedText = result.text;
    const processingTime = Date.now() - startTime;

    if (text.length <= 100) {
      logShortTextTranslation(text, translatedText, targetLang, {
        processingTime,
        tokenLimit: result.tokenLimit,
        isBoundaryCase: text.length >= 15 && text.length <= 20
      });
    }

    if (translatedText === "TEXT_TOO_LONG" || translatedText.includes("TEXT_TOO_LONG")) {
      logger.warn('API返回TEXT_TOO_LONG标识', {
        originalText: text.substring(0, 100),
        originalLength: text.length,
        targetLang,
        returnedText: translatedText,
        tokenLimit: result.tokenLimit
      });

      if (text.length < 100) {
        logger.error('短文本被错误判断为过长', {
          text,
          length: text.length,
          targetLang
        });
        return {
          success: false,
          text,
          error: '短文本被API错误判断为过长',
          isOriginal: true,
          retryable: true
        };
      }

      return {
        success: false,
        text,
        error: '文本过长，需要分块处理',
        isOriginal: true
      };
    }

    const completeness = await validateTranslationCompleteness(text, translatedText, targetLang);
    if (!completeness.isComplete) {
      logger.warn('翻译不完整', {
        reason: completeness.reason,
        originalLength: text.length,
        translatedLength: translatedText.length
      });

      if (text.length <= 100) {
        logger.warn('短文本翻译验证失败详情', {
          originalText: text,
          translatedText,
          reason: completeness.reason
        });
      }

      return {
        success: false,
        text,
        error: `翻译不完整: ${completeness.reason}`,
        isOriginal: true
      };
    }

    const minLengthRatio = (targetLang === 'zh-CN' || targetLang === 'zh-TW') ? 0.2 : 0.3;
    if (translatedText.length < text.length * minLengthRatio) {
      if (text.length < 50) {
        if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && /[\u4e00-\u9fff]/.test(translatedText)) {
          logger.info('短文本翻译长度比例低但包含中文，继续处理', {
            originalLength: text.length,
            translatedLength: translatedText.length,
            ratio: (translatedText.length / text.length).toFixed(2)
          });
        } else {
          logger.warn('翻译结果可能不完整，长度异常短', {
            originalLength: text.length,
            translatedLength: translatedText.length,
            ratio: (translatedText.length / text.length).toFixed(2)
          });

          return {
            success: false,
            text,
            error: '翻译结果不完整，长度异常短',
            isOriginal: true
          };
        }
      } else {
        logger.warn('翻译结果可能不完整，长度异常短', {
          originalLength: text.length,
          translatedLength: translatedText.length,
          ratio: (translatedText.length / text.length).toFixed(2)
        });

        return {
          success: false,
          text,
          error: '翻译结果不完整，长度异常短',
          isOriginal: true
        };
      }
    }

    const lastChar = translatedText[translatedText.length - 1];
    const isCompleteSentence = ['.', '!', '?', '。', '！', '？', '"', '"', ')', '）', '>', '》'].includes(lastChar);
    if (!isCompleteSentence && text.length > 100 && !translatedText.includes('...')) {
      logger.warn('翻译可能被截断，未以完整句子结尾');
      if (text.length > config.translation.longTextThreshold / 2) {
        return {
          success: false,
          text,
          error: '翻译被截断，需要分块处理',
          isOriginal: true
        };
      }
    }

    const isTranslated = await validateTranslation(text, translatedText, targetLang);

    if (!text.includes('__PROTECTED_') && translatedText.includes('__PROTECTED_')) {
      const placeholderPattern = /^__PROTECTED_[A-Z_]+_?[A-Z_]*__$/;
      if (placeholderPattern.test(translatedText.trim())) {
        if (isLikelyConfigKey(text)) {
          logger.info('检测到配置键占位符，尝试使用备用策略', {
            originalText: text,
            targetLang,
            textLength: text.length
          });

          const fallbackResponse = await translateConfigKeyWithFallback(text, targetLang);
          if (fallbackResponse.success) {
            return fallbackResponse;
          }

          logger.warn('配置键备用翻译策略未能产出有效结果', {
            originalText: text,
            targetLang,
            fallbackError: fallbackResponse.error
          });
        }

        logger.warn('检测到异常占位符生成，回退到原文', {
          originalText: text,
          translatedText,
          textLength: text.length,
          targetLang
        });

        if (text.length < 50 && !text.includes('<') && !text.includes('>')) {
          logger.error('短文本被错误转换为占位符', {
            text,
            translatedText,
            targetLang
          });
        }

        return { success: false, text, error: '异常占位符检测', isOriginal: true, language: targetLang };
      }
    }

    const finalContext = {
      targetLang,
      originalText: text,
      ...postProcessOptions,
      linkConversion: linkConversion || postProcessOptions.linkConversion
    };

    const finalText = await applyPostProcessors(translatedText, finalContext);

    logger.logTranslationSuccess(text, finalText, {
      processingTime,
      strategy: 'enhanced',
      tokenUsage: result.tokenLimit
    });

    return {
      success: true,
      text: finalText,
      isOriginal: !isTranslated,
      language: targetLang,
      processingTime
    };

  }, {
    context: {
      textLength: text.length,
      targetLang,
      retryCount
    },
    logger,
    rethrow: false
  });

  try {
    return await translationFunction();
  } catch (error) {
    logger.logTranslationFailure(text, error, {
      attempt: retryCount + 1,
      maxRetries: config.translation.maxRetries,
      strategy: 'enhanced'
    });

    if (error.retryable && retryCount < config.translation.maxRetries - 1) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      logger.info(`翻译失败，${delay}ms后进行第${retryCount + 2}次尝试`, {
        error: error.message,
        strategy: 'exponential_backoff'
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      const nextOptions = { ...runtimeOptions, retryCount: retryCount + 1 };
      return translateTextEnhanced(text, targetLang, nextOptions);
    }

    return createErrorResponse(error, text);
  }
}

/**
 * 验证翻译结果是否真的被翻译了
 * @param {string} originalText - 原始文本
 * @param {string} translatedText - 翻译后的文本
 * @param {string} targetLang - 目标语言
 * @returns {Promise<boolean>}
 */
// 增强的翻译完整性验证
// 增强的翻译完整性验证
async function validateTranslationCompleteness(originalText, translatedText, targetLang) {
  const evaluation = evaluateCompleteness(originalText, translatedText, targetLang);

  for (const event of evaluation.events) {
    const { level = 'debug', message, meta } = event;
    if (logger[level]) {
      logger[level](message, meta);
    }
  }

  return {
    isComplete: evaluation.isComplete,
    reason: evaluation.reason
  };
}

export async function validateTranslation(originalText, translatedText, targetLang) {
  const evaluation = evaluateTranslationQuality(originalText, translatedText, targetLang);

  for (const event of evaluation.events) {
    const { level = 'debug', message, meta } = event;
    if (logger[level]) {
      logger[level](message, meta);
    }
  }

  for (const record of evaluation.records) {
    await collectError({
      errorType: ERROR_TYPES.VALIDATION,
      errorCategory: record.category,
      errorCode: record.code,
      message: record.message,
      operation: 'validateTranslation',
      severity: record.severity,
      retryable: record.retryable,
      context: record.context
    });
  }

  return evaluation.isValid;
}



/**
 * 翻译服务健康检查和配置验证
 */
// 配置验证缓存
let configValidationCache = {
  result: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5分钟缓存
};

export async function validateTranslationConfig(forceRefresh = false) {
  // 检查缓存是否有效
  const now = Date.now();
  if (!forceRefresh && configValidationCache.result && 
      (now - configValidationCache.timestamp) < configValidationCache.ttl) {
    return configValidationCache.result;
  }

  const result = {
    valid: false,
    apiKeyConfigured: false,
    apiConnectable: false,
    supportedLanguages: [],
    error: null,
    warnings: []
  };

  try {
    // 检查API密钥配置
    if (!config.translation.apiKey) {
      result.error = 'GPT_API_KEY未配置';
      result.warnings.push('翻译功能将无法使用，所有翻译请求将返回原文');
      // 缓存结果
      configValidationCache.result = result;
      configValidationCache.timestamp = now;
      return result;
    }
    result.apiKeyConfigured = true;

    // 检查API URL配置
    if (!config.translation.apiUrl) {
      result.error = 'GPT_API_URL未配置';
      // 缓存结果
      configValidationCache.result = result;
      configValidationCache.timestamp = now;
      return result;
    }

    // 测试API连通性 - 只在缓存过期时执行
    if (!configValidationCache.result || configValidationCache.result.apiConnectable === false) {
      logger.debug('正在测试翻译API连通性...');
    }
    
    const testResult = await testTranslationAPI();
    if (testResult.success) {
      result.apiConnectable = true;
      result.valid = true;
      result.supportedLanguages = [
        'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es'
      ];
      // 只在状态变化时输出日志
      if (!configValidationCache.result || !configValidationCache.result.apiConnectable) {
        logger.debug('✅ 翻译API配置验证通过');
      }
    } else {
      result.error = testResult.error;
      result.warnings.push('API连接失败，翻译功能可能不稳定');
      // 只在状态变化时输出日志
      if (!configValidationCache.result || configValidationCache.result.apiConnectable !== false) {
        logger.debug('❌ 翻译API连接失败:', testResult.error);
      }
    }

  } catch (error) {
    result.error = `配置验证失败: ${error.message}`;
    logger.error('翻译配置验证错误:', error);
  }

  // 更新缓存
  configValidationCache.result = result;
  configValidationCache.timestamp = now;

  return result;
}

/**
 * 测试翻译API连通性
 */
async function testTranslationAPI() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const response = await fetchWithTimeout(`${config.translation.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.translation.apiKey}`,
      },
      body: JSON.stringify({
        model: config.translation.model,
        messages: [
          {
            role: 'user',
            content: 'Test'
          }
        ],
        max_tokens: Math.floor(10),
        temperature: 0
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      // 安全地解析 JSON 响应
      let data;
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('API测试 JSON 解析错误:', parseError.message);
        logger.error('响应内容前1000字符', { sample: responseText.substring(0, 1000) });
        return { 
          success: false, 
          error: `API响应JSON解析失败: ${parseError.message}` 
        };
      }
      
      return { 
        success: true, 
        model: data.model,
        usage: data.usage 
      };
    } else if (response.status === 401) {
      return { 
        success: false, 
        error: 'API密钥无效或已过期' 
      };
    } else if (response.status === 429) {
      return { 
        success: false, 
        error: 'API调用频率限制，但连接正常' 
      };
    } else {
      const errorText = await response.text();
      return { 
        success: false, 
        error: `API调用失败: ${response.status} ${response.statusText} - ${errorText}` 
      };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { 
        success: false, 
        error: 'API连接超时' 
      };
    } else if (error.message.includes('fetch failed')) {
      return { 
        success: false, 
        error: '无法连接到翻译API服务器' 
      };
    } else {
      return { 
        success: false, 
        error: `连接测试失败: ${error.message}` 
      };
    }
  }
}

/**
 * 获取翻译服务状态
 */
export async function getTranslationServiceStatus() {
  const configCheck = await validateTranslationConfig();
  
  return {
    status: configCheck.valid ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    config: {
      apiKeyConfigured: configCheck.apiKeyConfigured,
      apiUrl: config.translation.apiUrl,
      model: config.translation.model,
      timeout: config.translation.timeout,
      maxRetries: config.translation.maxRetries
    },
    connectivity: {
      reachable: configCheck.apiConnectable,
      lastChecked: new Date().toISOString()
    },
    supportedLanguages: configCheck.supportedLanguages,
    errors: configCheck.error ? [configCheck.error] : [],
    warnings: configCheck.warnings
  };
}




function normalizeMemoryLog(entry) {
  const context = entry.data ?? null;
  let durationMs = null;

  if (typeof context?.durationMs === 'number') {
    durationMs = Math.round(context.durationMs);
  } else if (typeof context?.duration === 'number') {
    durationMs = Math.round(context.duration);
  } else if (typeof context?.duration === 'string') {
    const match = context.duration.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      durationMs = Math.round(parseFloat(match[1]));
    }
  }

  return {
    id: entry.id || `mem-${entry.timestamp.getTime()}-${Math.random().toString(16).slice(2, 6)}`,
    timestamp: entry.timestamp,
    level: entry.level,
    category: entry.category || 'TRANSLATION',
    message: entry.message,
    shopId: entry.shopId ?? context?.shopId ?? null,
    resourceId: entry.resourceId ?? context?.resourceId ?? null,
    resourceType: context?.resourceType ?? null,
    language: context?.targetLanguage ?? context?.language ?? null,
    durationMs,
    context,
    tags: [],
    source: 'memory'
  };
}

function normalizePersistentLog(entry) {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    category: entry.category,
    message: entry.message,
    shopId: entry.shopId,
    resourceId: entry.resourceId,
    resourceType: entry.resourceType,
    language: entry.language,
    durationMs: entry.durationMs ?? null,
    context: entry.context ?? null,
    tags: Array.isArray(entry.tags) ? entry.tags : entry.tags ? [entry.tags].flat() : [],
    source: 'database'
  };
}

function mergeLogs(memoryLogs, persistentLogs, limit) {
  const combined = [];
  const seen = new Set();

  const add = (log) => {
    const timestampValue = log.timestamp instanceof Date
      ? log.timestamp.getTime()
      : new Date(log.timestamp).getTime();
    const key = `${timestampValue}-${log.level}-${log.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    combined.push(log);
  };

  memoryLogs.forEach(add);
  persistentLogs.forEach(add);

  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (combined.length > limit) {
    return combined.slice(0, limit);
  }
  return combined;
}

/**
 * 获取翻译统计信息
 */
export function getTranslationStats() {
  const memoryLogs = memoryLogReader.getRecent({
    category: 'TRANSLATION',
    limit: 200
  });

  const stats = {
    totalTranslations: 0,
    successfulTranslations: 0,
    failedTranslations: 0,
    averageDuration: 0,
    recentErrors: [],
    recentActivity: []
  };

  let totalDuration = 0;
  let durationCount = 0;

  memoryLogs.forEach(rawLog => {
    const log = normalizeMemoryLog(rawLog);
    const context = log.context || {};

    if (log.message.includes('翻译完成')) {
      stats.totalTranslations++;
      if (context.success) {
        stats.successfulTranslations++;
      }

      if (typeof log.durationMs === 'number') {
        totalDuration += log.durationMs;
        durationCount++;
      }
    } else if (log.message.includes('翻译失败')) {
      stats.failedTranslations++;
      stats.recentErrors.push({
        timestamp: log.timestamp,
        message: log.message,
        error: context?.error || context
      });
    }

    if (stats.recentActivity.length < 10) {
      stats.recentActivity.push({
        timestamp: log.timestamp,
        level: log.level,
        message: log.message
      });
    }
  });

  if (durationCount > 0) {
    stats.averageDuration = Math.round(totalDuration / durationCount);
  }

  stats.recentErrors = stats.recentErrors.slice(0, 5);
  stats.apiMetrics = getTranslationMetrics();

  return stats;
}

/**
 * 获取详细的翻译日志
 */
export async function getTranslationLogs(input = {}) {
  const options = typeof input === 'number' ? { limit: input } : input || {};
  const limit = Math.max(Math.min(options.limit ?? options.count ?? 50, 500), 1);
  const levelFilter = options.level ? [options.level] : undefined;

  const memoryLogs = memoryLogReader.getRecent({
    category: 'TRANSLATION',
    levels: levelFilter,
    shopId: options.shopId,
    resourceId: options.resourceId,
    limit,
    since: options.startTime
  });

  const persistentLogs = persistenceConfig.enabled
    ? await persistentLogReader({
        limit,
        level: options.level,
        shopId: options.shopId,
        resourceId: options.resourceId,
        resourceType: options.resourceType,
        language: options.language,
        startTime: options.startTime,
        endTime: options.endTime
      })
    : [];

  const normalizedMemoryLogs = memoryLogs.map(normalizeMemoryLog);
  const normalizedPersistentLogs = (persistentLogs || []).map(normalizePersistentLog);

  return mergeLogs(normalizedMemoryLogs, normalizedPersistentLogs, limit);
}

export function getTranslationOrchestratorStatus() {
  const cacheStats = typeof translationApiCache.stats === 'function'
    ? translationApiCache.stats()
    : {
        size: null,
        hits: null,
        misses: null,
        hitRate: null
      };

  const dedupeSize = typeof translationApiDeduplicator.size === 'function'
    ? translationApiDeduplicator.size()
    : null;

  return {
    cache: cacheStats,
    deduplicator: {
      inFlight: dedupeSize
    }
  };
}

/**
 * 翻译资源 - 核心翻译函数
 * @param {Object} resource - 资源对象
 * @param {string} targetLang - 目标语言
 * @param {Object} options - 选项参数
 * @returns {Promise<Object>} 翻译结果
 */
export async function translateResource(resource, targetLang, options = {}) {
  const { admin } = options || {};
  
  translationLogger.info('开始翻译资源', { 
    resourceId: resource.id,
    resourceType: resource.resourceType,
    targetLang 
  });

  // 检查是否为Theme资源，如果是则使用独立的Theme翻译逻辑
  if (resource.resourceType && resource.resourceType.includes('THEME')) {
    translationLogger.info('检测到Theme资源，使用专用翻译逻辑', { 
      resourceType: resource.resourceType 
    });
    
    try {
      const themeResult = await translateThemeResource(resource, targetLang);
      return {
        ...themeResult,
        skipped: false,
        translations: themeResult
      };
    } catch (error) {
      translationLogger.error('Theme资源翻译失败', { error: error.message });
      throw error;
    }
  }
  
  // 初始化翻译结果对象
  const translated = {
    titleTrans: null,
    descTrans: null,
    handleTrans: null,
    summaryTrans: null,
    labelTrans: null,
    seoTitleTrans: null,
    seoDescTrans: null,
  };

  try {
    // 翻译标题（关键字段）
    if (resource.title) {
      translated.titleTrans = await translateText(resource.title, targetLang);
      translated.titleTrans = await postProcessTranslation(
        translated.titleTrans, 
        targetLang, 
        resource.title
      );
      translationLogger.info('标题翻译完成', { 
        original: resource.title,
        translated: translated.titleTrans 
      });
    }

    // 翻译描述（根据资源类型选择正确的内容字段）
    let descriptionToTranslate = null;
    if (resource.resourceType === 'page') {
      descriptionToTranslate = resource.description || resource.descriptionHtml;
    } else {
      descriptionToTranslate = resource.descriptionHtml || resource.description;
    }
    
    if (descriptionToTranslate) {
      translated.descTrans = await translateText(descriptionToTranslate, targetLang);
      translated.descTrans = await postProcessTranslation(
        translated.descTrans, 
        targetLang, 
        descriptionToTranslate
      );
      translationLogger.info('描述翻译完成', { 
        length: descriptionToTranslate.length 
      });
    }

    // URL handle 不再翻译（SEO最佳实践）
    if (resource.handle) {
      translationLogger.info('URL handle保持原始值（不翻译）', { 
        handle: resource.handle 
      });
      translated.handleTrans = null;
    }

    // 翻译摘要（主要用于文章）
    if (resource.summary) {
      translated.summaryTrans = await translateText(resource.summary, targetLang);
      translated.summaryTrans = await postProcessTranslation(
        translated.summaryTrans, 
        targetLang, 
        resource.summary
      );
    }

    // 翻译标签（主要用于过滤器）
    if (resource.label) {
      translated.labelTrans = await translateText(resource.label, targetLang);
      translated.labelTrans = await postProcessTranslation(
        translated.labelTrans, 
        targetLang, 
        resource.label
      );
    }

    // 翻译SEO标题（关键字段）
    if (resource.seoTitle) {
      translated.seoTitleTrans = await translateText(resource.seoTitle, targetLang);
      translated.seoTitleTrans = await postProcessTranslation(
        translated.seoTitleTrans, 
        targetLang, 
        resource.seoTitle
      );
      translationLogger.info('SEO标题翻译完成', { 
        original: resource.seoTitle,
        translated: translated.seoTitleTrans 
      });
    }

    // 翻译SEO描述（关键字段）
    if (resource.seoDescription) {
      translated.seoDescTrans = await translateText(resource.seoDescription, targetLang);
      translated.seoDescTrans = await postProcessTranslation(
        translated.seoDescTrans, 
        targetLang, 
        resource.seoDescription
      );
      translationLogger.info('SEO描述翻译完成');
    }

    // 处理动态字段（产品选项、元字段等）
    const contentFields = resource.contentFields || {};
    const dynamicTranslationFields = {};

    switch ((resource.resourceType || '').toUpperCase()) {
      case 'PRODUCT_OPTION':
      case 'PRODUCT_OPTION_VALUE':
        if (contentFields.name) {
          dynamicTranslationFields.name = await translateText(contentFields.name, targetLang);
          dynamicTranslationFields.name = await postProcessTranslation(
            dynamicTranslationFields.name,
            targetLang,
            contentFields.name
          );
        }
        if (Array.isArray(contentFields.values) && contentFields.values.length > 0) {
          dynamicTranslationFields.values = [];
          for (const value of contentFields.values) {
            if (typeof value !== 'string' || !value.trim()) {
              dynamicTranslationFields.values.push(value);
              continue;
            }
            const translatedValue = await translateText(value, targetLang);
            dynamicTranslationFields.values.push(
              await postProcessTranslation(translatedValue, targetLang, value)
            );
          }
        }
        break;

      case 'PRODUCT_METAFIELD':
        if (typeof contentFields.value === 'string' && contentFields.value.trim()) {
          const translatedValue = await translateText(contentFields.value, targetLang);
          dynamicTranslationFields.value = await postProcessTranslation(
            translatedValue,
            targetLang,
            contentFields.value
          );
        }
        break;

      default:
        break;
    }

    if (Object.keys(dynamicTranslationFields).length > 0) {
      translated.translationFields = {
        ...(translated.translationFields || {}),
        ...dynamicTranslationFields
      };
    }

    // 统计翻译结果
    const totalFields = Object.values(translated).filter(v => v !== null).length;
    const processedFields = Object.keys(translated).filter(key => translated[key] !== null);
    
    translationLogger.info('翻译完成统计', {
      totalFields,
      processedFields: processedFields.join(', ')
    });

    // 返回兼容对象：同时支持扁平访问和嵌套访问
    return {
      // 保留扁平字段（向后兼容）
      ...translated,
      // 新增标准结构（向前兼容）
      skipped: false,
      translations: translated
    };

  } catch (error) {
    translationLogger.error('资源翻译失败', { 
      resourceId: resource.id,
      error: error.message 
    });
    throw error;
  }
}

/**
 * 长文本翻译的增强版本
 */
async function translateLongTextEnhanced(text, targetLang, options = {}) {
  const maxChunkSize = options.maxChunkSize ?? config.translation.maxChunkSize ?? 1000;
  const htmlDetected = isLikelyHtml(text);

  let workingText = text;
  let tagMap = null;

  try {
    if (htmlDetected) {
      const protection = protectHtmlTags(text);
      workingText = protection.text;
      tagMap = protection.tagMap;
    }

    const chunks = chunkText(workingText, maxChunkSize, { isHtml: htmlDetected });
    const chunkCount = chunks.length || 1;

    logger.debug('长文本分块结果', {
      chunkCount,
      maxChunkSize,
      htmlDetected
    });

    const translatedChunks = [];

    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = chunks[index] ?? '';

      const response = await executeTranslationRequest({
        text: chunk,
        targetLang,
        systemPrompt: buildEnhancedPrompt(targetLang),
        strategy: chunkCount > 1 ? 'long-text-chunk' : 'long-text',
        context: {
          functionName: 'translateLongTextEnhanced',
          chunkIndex: index,
          chunkCount
        }
      });

      if (!response.success) {
        throw new Error(response.error || `分块 ${index + 1} 翻译失败`);
      }

      const chunkContext = {
        targetLang,
        originalText: chunk,
        skipLinkConversion: true,
        ...(options.postProcess || {})
      };

      const processedChunk = await applyPostProcessors(response.text, chunkContext);
      translatedChunks.push(processedChunk);
    }

    const joiner = htmlDetected ? '' : '\n\n';
    let combined = translatedChunks.join(joiner);

    if (tagMap && tagMap.size) {
      combined = restoreHtmlTags(combined, tagMap);
    }

    const finalContext = {
      targetLang,
      originalText: text,
      ...(options.postProcess || {}),
      linkConversion: options.linkConversion || options.postProcess?.linkConversion
    };

    combined = await applyPostProcessors(combined, finalContext);

    const isTranslated = await validateTranslation(text, combined, targetLang);

    return {
      success: true,
      text: combined,
      isOriginal: !isTranslated,
      language: targetLang
    };
  } catch (error) {
    logger.error('长文本翻译失败', { error: error.message, targetLang });
    return {
      success: false,
      text,
      error: `长文本翻译失败: ${error.message}`,
      isOriginal: true
    };
  }
}

/**
 * 翻译长文本（智能分块处理）
 * @param {string} text - 待翻译的长文本
 * @param {string} targetLang - 目标语言代码
 * @returns {Promise<string>} 翻译结果
 */
// 智能分块函数 - 更智能地处理HTML和特殊内容
function intelligentChunkText(text, maxChunkSize = 1000) {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let currentChunk = '';
  
  // 检测是否是HTML内容
  const isHtml = text.includes('<') && text.includes('>');
  
  if (isHtml) {
    // 先检查是否包含列表
    const hasList = /<[uo]l[^>]*>.*?<\/[uo]l>/is.test(text);
    if (hasList) {
      logger.debug('检测到列表内容，使用特殊分块策略');
      // 对包含列表的内容使用更小的块大小
      maxChunkSize = Math.min(maxChunkSize, 500);
    }
    
    // HTML内容的特殊处理
    // 尝试按照HTML标签边界分割
    const tagRegex = /<[^>]+>|[^<]+/g;
    const segments = text.match(tagRegex) || [text];
    
    for (const segment of segments) {
      if (currentChunk.length + segment.length > maxChunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = segment;
      } else {
        currentChunk += segment;
      }
    }
  } else {
    // 非HTML内容使用原有的分段策略
    const paragraphs = text.split(/\n\s*\n/);
    
    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChunkSize) {
        // 按句子分割
        const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]+/g) || [paragraph];
        
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 > maxChunkSize) {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          }
        }
      } else {
        if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = paragraph;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
      }
    }
  }
  
  // 添加最后一个chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  logger.debug(`智能分块完成: ${chunks.length}个块，平均长度: ${Math.round(text.length / chunks.length)}字符`);
  return chunks;
}

// 简化版翻译函数 - 作为降级策略使用
async function translateWithSimplePrompt(text, targetLang) {
  try {
    const result = await executeTranslationRequest({
      text,
      targetLang,
      systemPrompt: buildSimplePrompt(targetLang),
      strategy: 'simple',
      context: { functionName: 'translateWithSimplePrompt' }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const translatedText = result.text;

    if (!translatedText || translatedText.length < text.length * 0.1) {
      throw new Error('简化翻译结果异常短');
    }

    return {
      success: true,
      text: translatedText,
      isOriginal: false,
      language: targetLang
    };
  } catch (error) {
    logger.error('简化翻译失败', {
      error: error.message,
      targetLang
    });

    return {
      success: false,
      text,
      error: `简化翻译失败: ${error.message}`,
      isOriginal: true
    };
  }
}

/**
 * 翻译Theme相关资源的动态字段
 * @param {Object} resource - 资源对象
 * @param {string} targetLang - 目标语言
 * @returns {Promise<Object>} 翻译结果
 */
// 注释掉原有的translateThemeResource函数，已移至theme-translation.server.js
/*
// export async function translateThemeResource(resource, targetLang) {
  const translated = {
    titleTrans: null,
    descTrans: null,
    handleTrans: null,
    seoTitleTrans: null,
    seoDescTrans: null,
    translationFields: {} // 动态字段翻译结果
  };

  // 翻译基础字段
  if (resource.title) {
    const titleResult = await translateTitleWithEnhancedPrompt(resource.title, targetLang);
    if (titleResult.success) {
      translated.titleTrans = titleResult.text;
    } else {
      translated.titleTrans = await translateText(resource.title, targetLang);
    }
    translated.titleTrans = await postProcessTranslation(translated.titleTrans, targetLang, resource.title);
  }

  // URL handle 不再翻译（SEO最佳实践）
  // @deprecated 自动翻译handle功能已禁用 - 2025-01-19
  if (resource.handle) {
    logger.debug(`🔗 Theme资源URL handle保持原始值: "${resource.handle}" (不翻译)`);
    translated.handleTrans = null; // 始终为null，不推送到Shopify
  }

  // 处理Theme资源的特殊字段
  const contentFields = resource.contentFields || {};
  const fieldsToTranslate = {};

  switch (resource.resourceType) {
    case 'ONLINE_STORE_THEME':
    case 'ONLINE_STORE_THEME_JSON_TEMPLATE':
    case 'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS':
      // 处理Theme设置的JSON内容
      if (contentFields.themeData) {
        try {
          const themeData = typeof contentFields.themeData === 'string' 
            ? JSON.parse(contentFields.themeData) 
            : contentFields.themeData;
          
          // 翻译Theme中的文本内容
          const translatedThemeData = await translateThemeJsonData(themeData, targetLang);
          fieldsToTranslate.themeData = JSON.stringify(translatedThemeData, null, 2);
        } catch (error) {
          logger.error('解析Theme JSON数据失败:', error);
        }
      }
      break;

    case 'ONLINE_STORE_THEME_LOCALE_CONTENT':
      // 翻译本地化内容
      if (contentFields.localeContent) {
        fieldsToTranslate.localeContent = await translateText(contentFields.localeContent, targetLang);
      }
      break;

    case 'ONLINE_STORE_THEME_APP_EMBED':
    case 'ONLINE_STORE_THEME_SECTION_GROUP':
    case 'ONLINE_STORE_THEME_SETTINGS_CATEGORY':
      // 处理设置和配置文本
      for (const [key, value] of Object.entries(contentFields)) {
        if (typeof value === 'string' && value.trim()) {
          // 跳过技术键名和URL
          if (!key.match(/^(id|type|key|url|path|class|style)$/i)) {
            fieldsToTranslate[key] = await translateText(value, targetLang);
            fieldsToTranslate[key] = await postProcessTranslation(
              fieldsToTranslate[key], 
              targetLang, 
              value
            );
          }
        }
      }
      break;

    case 'PRODUCT_OPTION':
    case 'PRODUCT_OPTION_VALUE':
      // 翻译产品选项
      if (contentFields.name) {
        fieldsToTranslate.name = await translateText(contentFields.name, targetLang);
      }
      if (contentFields.values && Array.isArray(contentFields.values)) {
        fieldsToTranslate.values = await Promise.all(
          contentFields.values.map(value => translateText(value, targetLang))
        );
      }
      break;

    case 'SELLING_PLAN':
    case 'SELLING_PLAN_GROUP':
      // 翻译销售计划
      if (contentFields.name) {
        fieldsToTranslate.name = await translateText(contentFields.name, targetLang);
      }
      if (contentFields.description) {
        fieldsToTranslate.description = await translateText(contentFields.description, targetLang);
      }
      if (contentFields.options && Array.isArray(contentFields.options)) {
        fieldsToTranslate.options = await Promise.all(
          contentFields.options.map(async (option) => ({
            ...option,
            name: option.name ? await translateText(option.name, targetLang) : option.name,
            value: option.value ? await translateText(option.value, targetLang) : option.value
          }))
        );
      }
      break;

    case 'SHOP':
      // 翻译店铺信息
      const shopFields = ['name', 'description', 'announcement', 'contactEmail'];
      for (const field of shopFields) {
        if (contentFields[field]) {
          fieldsToTranslate[field] = await translateText(contentFields[field], targetLang);
        }
      }
      break;

    case 'SHOP_POLICY':
      // 翻译店铺政策
      const policyFields = ['title', 'body', 'url'];
      for (const field of policyFields) {
        if (contentFields[field] && field !== 'url') {
          fieldsToTranslate[field] = await translateText(contentFields[field], targetLang);
        }
      }
      break;

    default:
      // 通用字段翻译
      for (const [key, value] of Object.entries(contentFields)) {
        if (typeof value === 'string' && value.trim() && !key.match(/^(id|handle|url)$/i)) {
          fieldsToTranslate[key] = await translateText(value, targetLang);
        }
      }
  }

  // 将动态字段存储到translationFields
  if (Object.keys(fieldsToTranslate).length > 0) {
    translated.translationFields = fieldsToTranslate;
  }

  return translated;
}
*/

// 注释掉原有的translateThemeJsonData函数，已移至theme-translation.server.js
/*
// 递归翻译Theme JSON数据中的文本内容
// @param {Object} data - JSON数据
// @param {string} targetLang - 目标语言
// @returns {Promise<Object>} 翻译后的JSON数据
async function translateThemeJsonData(data, targetLang) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // 如果是数组，递归处理每个元素
  if (Array.isArray(data)) {
    return Promise.all(data.map(item => translateThemeJsonData(item, targetLang)));
  }

  // 创建新对象以避免修改原始数据
  const translated = {};

  for (const [key, value] of Object.entries(data)) {
    // 跳过技术键名
    if (key.match(/^(id|type|handle|key|class|style|src|href|url)$/i)) {
      translated[key] = value;
      continue;
    }

    // 检查是否为需要翻译的文本字段
    if (key.match(/^(title|label|name|description|text|content|placeholder|message|caption|heading|subheading|button_text)$/i)) {
      if (typeof value === 'string' && value.trim()) {
        translated[key] = await translateText(value, targetLang);
        translated[key] = await postProcessTranslation(translated[key], targetLang, value);
      } else {
        translated[key] = value;
      }
    } else if (typeof value === 'object') {
      // 递归处理嵌套对象
      translated[key] = await translateThemeJsonData(value, targetLang);
    } else {
      // 保留其他值
      translated[key] = value;
    }
  }

  return translated;
}
*/
