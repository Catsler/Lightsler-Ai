/**
 * GPT翻译API服务
 */

import { config } from '../utils/config.server.js';

// 导入新的工具函数
import { makeTranslationAPICall, makeTranslationAPICallWithRetry } from '../utils/api.server.js';
import { 
  TranslationError, 
  withErrorHandling, 
  createErrorResponse, 
  ErrorCollector 
} from '../utils/error-handler.server.js';
import { 
  logger, 
  apiLogger, 
  validationLogger, 
  logShortTextTranslation,
  logTranslationQuality,
  logEnglishRemnants 
} from '../utils/logger.server.js';

/**
 * 语言代码到语言名称的映射
 * @param {string} langCode - 语言代码
 * @returns {string} 语言名称
 */
function getLanguageName(langCode) {
  const languageMap = {
    'en': '英语',
    'zh': '中文',
    'zh-CN': '简体中文',
    'zh-TW': '繁体中文',
    'ja': '日语',
    'ko': '韩语',
    'fr': '法语',
    'de': '德语',
    'es': '西班牙语',
    'pt': '葡萄牙语',
    'ru': '俄语',
    'it': '意大利语',
    'ar': '阿拉伯语',
    'hi': '印地语',
    'th': '泰语',
    'vi': '越南语',
    'id': '印度尼西亚语',
    'ms': '马来语',
    'tr': '土耳其语',
    'pl': '波兰语',
    'nl': '荷兰语',
    'sv': '瑞典语',
    'da': '丹麦语',
    'no': '挪威语',
    'fi': '芬兰语'
  };
  
  return languageMap[langCode] || langCode;
}

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
    // 中文：按词语单位断句，每个词作为独立语义单元
    segmentLength: 1,
    connector: '-',
    // 改进的正则：更好地识别中文词汇、英文单词、数字组合
    wordPattern: /[\u4e00-\u9fff]{1,4}|[a-zA-Z]+(?:\s+[a-zA-Z]+)*\d*|[0-9]+[a-zA-Z]*|\d{4}/g
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
    wordPattern: /\b[a-zA-ZáéíóúñÁÉÍÓÚÑ]+\b|\b\d+[a-zA-Z]*\b/g
  },
  'fr': {
    // 法语：处理特殊字符
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b[a-zA-ZàâäæçéèêëïîôùûüÿœÀÂÄÆÇÉÈÊËÏÎÔÙÛÜŸŒ]+\b|\b\d+[a-zA-Z]*\b/g
  },
  'de': {
    // 德语：处理复合词和特殊字符
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b[a-zA-ZäöüßÄÖÜ]+\b|\b\d+[a-zA-Z]*\b/g
  },
  'default': {
    // 其他语言：通用处理
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b\w+\b/g
  }
};;

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
function isBrandWord(word) {
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
  
  // 提取所有词汇单元
  let words = text.match(rules.wordPattern) || [];
  
  // 保护品牌词 - 确保品牌词不被分割
  const protectedText = text.replace(brandWords, (match) => match.replace(/\s+/g, '_'));
  words = protectedText.match(rules.wordPattern) || [];
  
  // 还原品牌词中的下划线
  words = words.map(word => word.replace(/_/g, ' '));
  
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
  
  for (let word of words) {
    const normalizedWord = word.toLowerCase();
    // 如果是品牌词，总是保留
    if (brandWords.test(word)) {
      uniqueWords.push(word);
    } else if (!seenWords.has(normalizedWord)) {
      seenWords.add(normalizedWord);
      uniqueWords.push(word);
    }
  }
  
  // 根据目标语言调整词序
  let finalWords = uniqueWords;
  
  // 某些语言可能需要调整词序以符合自然语序
  if (targetLang === 'ja' || targetLang === 'ko') {
    // 日韩语言：品牌/产品名通常在前，描述在后
    const brands = finalWords.filter(w => brandWords.test(w));
    const others = finalWords.filter(w => !brandWords.test(w));
    finalWords = [...brands, ...others];
  }
  
  // 限制词汇数量，避免过长的URL
  const maxWords = targetLang === 'zh-CN' || targetLang === 'ja' || targetLang === 'ko' ? 4 : 5;
  finalWords = finalWords.slice(0, maxWords);
  
  return finalWords.join(rules.connector);
}

export async function translateUrlHandle(handle, targetLang, retryCount = 0) {
  if (!handle || !handle.trim()) {
    return handle;
  }

  // 如果没有配置API密钥，返回原handle
  if (!config.translation.apiKey) {
    console.warn('未配置GPT_API_KEY，返回原handle');
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
2. 【语义单元】每个词必须是独立的、有明确含义的语义单元，避免无意义的单字或片段
3. 【自然语序】按${getLanguageName(targetLang)}的自然语序排列词汇，确保符合目标语言习惯
4. 【避免冗余】去除所有重复词汇、填充词、无意义修饰词、助词、介词等
5. 【关键词优先】只保留最核心的3-5个关键词，删除所有冗余描述
6. 【字符净化】避免产生乱码、特殊符号、无意义字符、单独的字母或数字

翻译规则：
- 每个词都必须有独立的语义价值，能够单独传达意义
- ${targetLang === 'zh-CN' ? '中文：提取核心名词和动词，去除"的、了、是、在、有"等虚词' : ''}
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

示例（仅供参考，实际翻译需根据语义）：
- "Apple iPhone 15 Pro Max Case" → "${targetLang === 'zh-CN' ? 'Apple iPhone 15 Pro Max 手机壳' : targetLang === 'ja' ? 'Apple iPhone 15 Pro Max ケース' : 'Apple iPhone 15 Pro Max Case'}"
- "Nike Running Shoes for Men" → "${targetLang === 'zh-CN' ? 'Nike 男士 跑鞋' : targetLang === 'ja' ? 'Nike メンズ ランニング シューズ' : 'Nike Mens Running Shoes'}"
- "Wireless Bluetooth Headphones" → "${targetLang === 'zh-CN' ? '无线 蓝牙 耳机' : targetLang === 'ja' ? 'ワイヤレス Bluetooth ヘッドホン' : 'Wireless Bluetooth Headphones'}"`;
    
    try {
      console.log(`正在翻译URL handle: "${normalizedHandle}" -> ${getLanguageName(targetLang)}`);
      
      const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
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
          max_tokens: 100, // URL handle不需要太长
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
        console.error('URL handle JSON 解析错误:', parseError.message);
        console.error('响应内容前1000字符:', responseText.substring(0, 1000));
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
        
        console.log(`URL handle翻译完成: "${handle}" -> "${finalHandle}"`);
        return finalHandle;
      }
      
      throw new Error('URL handle翻译API响应格式异常');
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
    
  } catch (error) {
    console.error(`URL handle翻译服务错误 (尝试 ${retryCount + 1}/${config.translation.maxRetries}):`, error);
    
    // 网络错误重试逻辑
    if ((error.name === 'AbortError' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed')) 
        && retryCount < config.translation.maxRetries - 1) {
      console.log(`URL handle翻译失败，${2000 * (retryCount + 1)}ms后进行第${retryCount + 2}次尝试...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return translateUrlHandle(handle, targetLang, retryCount + 1);
    }
    
    // 如果翻译失败，应用基本的智能断句到原handle
    console.warn(`URL handle翻译失败，应用智能断句到原文: ${error.message}`);
    const segmentedHandle = intelligentSegmentation(normalizedHandle, targetLang);
    return normalizeHandle(segmentedHandle);
  }
}

export async function translateText(text, targetLang, retryCount = 0) {
  // 使用增强版翻译函数，但保持向后兼容
  const result = await translateTextEnhanced(text, targetLang, retryCount);
  
  // 如果翻译失败但有回退文本，记录警告
  if (!result.success && result.text !== text) {
    console.warn(`翻译失败但返回了不同的文本: ${result.error}`);
  }
  
  // 向后兼容：只返回文本
  return result.text;
}

/**
 * 增强版翻译函数，返回详细的状态信息
 * @param {string} text - 要翻译的文本
 * @param {string} targetLang - 目标语言
 * @param {number} retryCount - 重试次数
 * @returns {Promise<{success: boolean, text: string, error?: string, isOriginal?: boolean, language?: string}>}
 */
export async function translateTextEnhanced(text, targetLang, retryCount = 0) {
  // 基本输入验证
  if (!text || !text.trim()) {
    return {
      success: true,
      text: text,
      isOriginal: true
    };
  }

  // 检查API密钥配置
  if (!config.translation.apiKey) {
    logger.warn('API密钥未配置，返回原文');
    return createErrorResponse(new Error('API密钥未配置'), text);
  }

  // 对于长文本，使用智能分块翻译
  if (text.length > config.translation.longTextThreshold) {
    logger.info('文本超过长度阈值，使用长文本翻译策略', {
      textLength: text.length,
      threshold: config.translation.longTextThreshold
    });
    const result = await translateLongTextEnhanced(text, targetLang);
    return result;
  }

  // 记录翻译开始
  logger.logTranslationStart(text, targetLang, { strategy: 'enhanced' });

  // 构建翻译提示词 - 加强完整性要求
  const systemPrompt = `你是一个专业的电商翻译助手。请将用户提供的文本翻译成${getLanguageName(targetLang)}。

严格要求 - 这非常重要：
1. 绝对不能修改任何以"__PROTECTED_"开头和"__"结尾的字符串
2. 必须完全保持原始占位符的准确形式，包括数字
3. 例如：__PROTECTED_IMG_2__ 必须保持为 __PROTECTED_IMG_2__
4. 不能改为 __PROTECTED_IMG_X__ 或其他形式
5. 这些占位符代表图片、视频等媒体内容

翻译要求：
- 必须100%完整翻译所有文本内容，不能遗漏任何部分
- 绝对不能在结果中混合原文和译文
- 如果原文很长，确保翻译完整，不要截断
- 保持段落和换行结构
- 翻译要自然流畅，符合${getLanguageName(targetLang)}表达习惯
- 保持专业的商务语调
- 只返回翻译结果，不要添加任何解释或说明

重要：如果原文超过你的处理能力，请明确说明"TEXT_TOO_LONG"，不要返回不完整的翻译。`;

  // 使用统一的API调用函数进行翻译
  const translationFunction = withErrorHandling(async () => {
    const startTime = Date.now();
    
    const result = await makeTranslationAPICallWithRetry(text, targetLang, systemPrompt, {
      maxRetries: config.translation.maxRetries,
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

    // 记录短文本翻译详情（用于调试边界情况）
    if (text.length <= 100) {
      logShortTextTranslation(text, translatedText, targetLang, {
        processingTime,
        tokenLimit: result.tokenLimit,
        isBoundaryCase: text.length >= 15 && text.length <= 20
      });
    }

    // 检查是否返回了"TEXT_TOO_LONG"标识
    if (translatedText === "TEXT_TOO_LONG") {
      logger.warn('文本过长，API无法完整处理');
      return {
        success: false,
        text: text,
        error: '文本过长，需要分块处理',
        isOriginal: true
      };
    }

    // 增强的翻译完整性验证
    const validationResult = await validateTranslationCompleteness(text, translatedText, targetLang);
    if (!validationResult.isComplete) {
      logger.warn('翻译不完整', {
        reason: validationResult.reason,
        originalLength: text.length,
        translatedLength: translatedText.length
      });
      
      if (text.length <= 100) {
        logger.warn('短文本翻译验证失败详情', {
          originalText: text,
          translatedText: translatedText,
          reason: validationResult.reason
        });
      }
      
      return {
        success: false,
        text: text,
        error: `翻译不完整: ${validationResult.reason}`,
        isOriginal: true
      };
    }

    // 验证翻译长度合理性 - 使用与validateTranslation相同的标准
    const minLengthRatio = (targetLang === 'zh-CN' || targetLang === 'zh-TW') ? 0.2 : 0.3;
    if (translatedText.length < text.length * minLengthRatio) {
      // 额外检查：如果原文很短且翻译结果有目标语言字符，则可能是正确的
      if (text.length < 50) {
        if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && /[\u4e00-\u9fff]/.test(translatedText)) {
          // 短文本且有中文字符，继续处理
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
            text: text,
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
          text: text,
          error: '翻译结果不完整，长度异常短',
          isOriginal: true
        };
      }
    }

    // 检查是否在句子中间被截断
    const lastChar = translatedText[translatedText.length - 1];
    const isCompleteSentence = ['.', '!', '?', '。', '！', '？', '"', '"', ')', '）', '>', '》'].includes(lastChar);
    if (!isCompleteSentence && text.length > 100 && !translatedText.includes('...')) {
      logger.warn('翻译可能被截断，未以完整句子结尾');
      // 对于长文本且明显被截断的，返回失败让它重试或分块处理
      if (text.length > config.translation.longTextThreshold / 2) {
        return {
          success: false,
          text: text,
          error: '翻译被截断，需要分块处理',
          isOriginal: true
        };
      }
    }

    // 检查是否真的被翻译了（简单检查）
    const isTranslated = await validateTranslation(text, translatedText, targetLang);

    // 记录翻译成功
    logger.logTranslationSuccess(text, translatedText, {
      processingTime,
      strategy: 'enhanced',
      tokenUsage: result.tokenLimit
    });

    return {
      success: true,
      text: translatedText,
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
    // 记录翻译失败
    logger.logTranslationFailure(text, error, {
      attempt: retryCount + 1,
      maxRetries: config.translation.maxRetries,
      strategy: 'enhanced'
    });

    // 如果是网络错误且还有重试次数，进行重试
    if (error.retryable && retryCount < config.translation.maxRetries - 1) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      logger.info(`翻译失败，${delay}ms后进行第${retryCount + 2}次尝试`, {
        error: error.message,
        strategy: 'exponential_backoff'
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return translateTextEnhanced(text, targetLang, retryCount + 1);
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
  // 首先定义内容类型检测变量（在函数开始处定义，确保整个函数都能访问）
  const technicalKeywords = [
    'safety', 'warning', 'caution', 'danger', 'hazard', 'risk',
    'installation', 'assembly', 'maintenance', 'repair',
    'equipment', 'components', 'specifications', 'parts',
    'hanging', 'suspension', 'mounting', 'setup',
    'worn', 'sharp', 'rip', 'damage', 'broken',
    'rocks', 'scissors', 'knife', 'blade'
  ];
  
  const productKeywords = [
    'description', 'features', 'benefits', 'product', 'item', 'material',
    'fabric', 'design', 'color', 'size', 'weight', 'dimensions', 'specifications',
    'outdoor', 'camping', 'hiking', 'backpacking', 'gear', 'equipment',
    'lightweight', 'waterproof', 'durable', 'portable', 'compact',
    'choice', 'perfect', 'ideal', 'suitable', 'recommended'
  ];
  
  const isTechnicalContent = technicalKeywords.some(keyword => 
    originalText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  const isProductContent = productKeywords.some(keyword => 
    originalText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // 对于极短文本（如单词、标签），放宽限制 - 调整阈值到15字符（包含15）
  if (originalText.length <= 15) {
    return {
      isComplete: true,
      reason: '极短文本'
    };
  }
  
  // 对于短文本（15-100字符），进行基础翻译质量检查
  const isShortText = originalText.length >= 15 && originalText.length <= 100;
  if (isShortText) {
    console.log(`短文本验证 (${originalText.length}字符): "${originalText.substring(0, 50)}..."`);
    
    // 检查是否真的进行了翻译
    if (originalText.trim() === translatedText.trim()) {
      // 对于英文到中文的翻译，如果结果还是英文，这是明确的翻译失败
      if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && /^[a-zA-Z\s\-_,.!?]+$/.test(originalText)) {
        console.log(`⚠️ 英文到中文翻译失败: 原文和译文相同 - "${originalText}"`);
        return {
          isComplete: false,
          reason: '短文本未翻译，原文和译文完全相同（英文应翻译为中文）'
        };
      }
      
      // 对于其他情况，可能是专有名词或品牌名，给予警告但不阻止
      console.log(`⚠️ 原文和译文相同，可能是专有名词: "${originalText}"`);
      // 继续后续验证
    }
    
    // 对于目标语言为中文的内容，检查是否包含中文字符
    if (targetLang === 'zh-CN' || targetLang === 'zh-TW') {
      const hasChinese = /[\u4e00-\u9fff]/.test(translatedText);
      if (!hasChinese) {
        return {
          isComplete: false,
          reason: '短文本翻译失败，目标中文但结果无中文字符'
        };
      }
    }
    
    // 检查是否存在明显的英中混合（重新设计英文比例计算）
    const englishChars = (translatedText.match(/[a-zA-Z]/g) || []).length;
    const totalChars = translatedText.length;
    const actualEnglishRatio = englishChars / Math.max(totalChars, 1);
    
    // 对于不同内容类型使用不同的英文比例阈值
    let englishThreshold = 0.7; // 默认70%
    if (isProductContent) {
      englishThreshold = 0.8; // 产品描述允许80%英文（品牌词、型号等）
    } else if (isTechnicalContent) {
      englishThreshold = 0.75; // 技术内容允许75%英文
    }
    
    if (actualEnglishRatio > englishThreshold) {
      return {
        isComplete: false,
        reason: `短文本英文内容过多，英文比例: ${(actualEnglishRatio * 100).toFixed(1)}% (阈值: ${(englishThreshold * 100).toFixed(1)}%)`
      };
    }
    
    console.log(`✅ 短文本验证通过: ${originalText.length} -> ${translatedText.length} 字符`);
    return {
      isComplete: true,
      reason: '短文本翻译合格'
    };
  }
  
  // 内容类型变量已在前面定义，这里移除重复定义
  
  if (isTechnicalContent) {
    console.log('检测到技术性内容，使用宽松验证标准');
  }
  
  if (isProductContent) {
    console.log('检测到产品描述内容，使用宽松验证标准');
  }
  
  // 1. 检查是否混合了原文和译文（对HTML内容和产品描述放宽检查）
  const isHtmlContent = originalText.includes('<') && originalText.includes('>');
  
  if (!isHtmlContent && !isProductContent) {
    const originalWords = originalText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const translatedWords = translatedText.toLowerCase().split(/\s+/);
    
    // 计算原文单词在译文中的出现率
    let originalWordsInTranslation = 0;
    for (const word of originalWords) {
      // 跳过常见的品牌词和技术词汇
      if (isBrandWord(word)) continue;
      
      // 检查是否在译文中找到原文单词
      if (translatedWords.some(tWord => tWord.includes(word))) {
        originalWordsInTranslation++;
      }
    }
    
    const mixingRatio = originalWordsInTranslation / Math.max(originalWords.length, 1);
    
    // 对技术内容和包含品牌词的内容放宽混合比例限制
    const mixingThreshold = 0.8; // 大幅放宽到80%未翻译才报错
    const minWordsForCheck = 10; // 减少到10个单词才检查 // 需要更多单词才进行严格检查
    
    if (mixingRatio > mixingThreshold && originalWords.length > minWordsForCheck) {
      return {
        isComplete: false,
        reason: `检测到原文和译文混合，混合比例: ${(mixingRatio * 100).toFixed(1)}% (阈值: ${(mixingThreshold * 100).toFixed(1)}%)`
      };
    }
  }
  
  // 2. 检查常见的不完整翻译标识
  const incompletePatterns = [
    /^(Here is|Here's|I'll translate|The translation|Translation:|翻译如下|翻译结果)/i,
    /\.\.\.$/, // 以省略号结尾
    /\[继续\]|\[continued\]|\[more\]/i,
    /TEXT_TOO_LONG/ // GPT返回的特殊标识
  ];
  
  // 对于HTML内容和产品描述，只检查明显的错误模式
  if (isHtmlContent || isProductContent) {
    if (/TEXT_TOO_LONG/.test(translatedText)) {
      return {
        isComplete: false,
        reason: 'API报告文本过长'
      };
    }
    // 跳过其他模式检查，因为产品描述可能以"..."结尾作为设计
  } else {
    for (const pattern of incompletePatterns) {
      if (pattern.test(translatedText)) {
        return {
          isComplete: false,
          reason: `检测到不完整翻译模式: ${pattern.source}`
        };
      }
    }
  }
  
  // 3. 检查长度合理性（对不同内容类型使用不同标准，考虑中文信息密度更高）
  const lengthRatio = translatedText.length / originalText.length;
  let minRatio;
  
  // 检查目标语言是否为中文，中文信息密度通常比英文高30-50%
  const isChineseTarget = targetLang === 'zh-CN' || targetLang === 'zh-TW';
  
  if (isHtmlContent) {
    minRatio = 0.05; // HTML内容极大放宽，只检查极端情况
  } else if (isProductContent) {
    minRatio = isChineseTarget ? 0.1 : 0.15; // 产品描述进一步放宽
  } else if (isTechnicalContent) {
    minRatio = isChineseTarget ? 0.15 : 0.2; // 技术内容也放宽
  } else {
    minRatio = isChineseTarget ? 0.2 : 0.3; // 普通文本也大幅放宽
  }
  
  if (lengthRatio < minRatio) {
    const contentType = isHtmlContent ? 'HTML' : (isProductContent ? '产品描述' : (isTechnicalContent ? '技术' : '普通'));
    return {
      isComplete: false,
      reason: `译文长度过短，长度比例: ${(lengthRatio * 100).toFixed(1)}% (${contentType}内容最低要求: ${(minRatio * 100).toFixed(1)}%)`
    };
  }
  
  // 4. 对于HTML内容，大幅放宽标签平衡检查
  if (isHtmlContent) {
    // 只检查主要的开闭标签是否平衡
    const openTags = (originalText.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (originalText.match(/<\/[^>]+>/g) || []).length;
    const transOpenTags = (translatedText.match(/<[^/][^>]*>/g) || []).length;
    const transCloseTags = (translatedText.match(/<\/[^>]+>/g) || []).length;
    
    // 大幅放宽允许的差异，从5个增加到10个
    const allowedDifference = Math.max(10, Math.floor(openTags * 0.3)); // 至少10个，或30%的标签数量
    if (Math.abs((openTags - closeTags) - (transOpenTags - transCloseTags)) > allowedDifference) {
      return {
        isComplete: false,
        reason: `HTML标签严重不平衡，允许差异: ${allowedDifference}`
      };
    }
  }
  
  // 5. 对于产品描述，额外检查是否有足够的中文内容
  if (isProductContent && (targetLang === 'zh-CN' || targetLang === 'zh-TW')) {
    // 提取纯文本内容，排除HTML标签、URL、品牌名等
    const pureTextContent = translatedText
      .replace(/<[^>]+>/g, ' ') // 移除HTML标签
      .replace(/https?:\/\/[^\s]+/g, ' ') // 移除URL
      .replace(/\b(?:Onewind|YouTube|iframe|UHMWPE|PU|Silpoly)\b/gi, ' ') // 移除品牌和技术术语
      .replace(/\d+[\w\s\-×′″]*(?:mm|cm|m|ft|lb|oz|g|kg)/gi, ' ') // 移除尺寸单位
      .replace(/\s+/g, ' ') // 规范化空格
      .trim();
    
    const chineseChars = (pureTextContent.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = pureTextContent.length;
    const englishWords = (pureTextContent.match(/\b[a-zA-Z]{2,}\b/g) || []).length;
    
    // 计算纯文本的中文比例
    const pureTextChineseRatio = chineseChars / Math.max(totalChars, 1);
    
    // 智能阈值：根据内容类型动态调整
    let minChineseRatio = 0.15; // 基础阈值15%
    
    // 如果有大量技术内容，进一步降低要求
    if (isTechnicalContent) {
      minChineseRatio = 0.1; // 技术内容10%
    }
    
    // 如果HTML内容很多，再降低要求
    const htmlTagCount = (translatedText.match(/<[^>]+>/g) || []).length;
    if (htmlTagCount > 10) {
      minChineseRatio = 0.08; // 富HTML内容8%
    }
    
    // 额外检查：如果中文字符数量绝对值较多，即使比例低也可能是正确的
    const hasSubstantialChinese = chineseChars > Math.max(50, pureTextContent.length * 0.05);
    
    // 更加智能的验证：考虑多个因素
    const passesBasicRatio = pureTextChineseRatio >= minChineseRatio;
    const passesAbsoluteCount = hasSubstantialChinese;
    const hasReasonableTranslation = chineseChars > englishWords * 0.5; // 中文字符数 > 英文单词数 * 0.5
    
    if (!passesBasicRatio && !passesAbsoluteCount && !hasReasonableTranslation) {
      return {
        isComplete: false,
        reason: `产品描述中文内容不足，纯文本中文比例: ${(pureTextChineseRatio * 100).toFixed(1)}% (要求: ${(minChineseRatio * 100).toFixed(1)}%)`
      };
    }
    
    console.log(`✅ 产品描述中文内容检查通过：纯文本中文比例 ${(pureTextChineseRatio * 100).toFixed(1)}%，中文字符数 ${chineseChars}`);
  }
  
  return {
    isComplete: true,
    reason: '翻译完整'
  };
}

async function validateTranslation(originalText, translatedText, targetLang) {
  // 如果翻译结果与原文完全相同，认为未翻译
  if (originalText.trim() === translatedText.trim()) {
    return false;
  }
  
  // 智能的长度检查 - 考虑中文信息密度高的特点
  const minLengthRatio = (targetLang === 'zh-CN' || targetLang === 'zh-TW') ? 0.2 : 0.4;
  if (translatedText.length < originalText.length * minLengthRatio) {
    // 额外检查：如果原文很短且翻译结果有中文，则可能是正确的
    if (originalText.length < 50 && /[一-鿿]/.test(translatedText)) {
      return true; // 短文本且有中文字符，可能是正确的
    }
    return false;
  }
  
  // 简单的语言特征检测（可以后续扩展）
  if (targetLang === 'zh-CN' || targetLang === 'zh-TW') {
    // 检查是否包含中文字符
    const chineseRegex = /[\u4e00-\u9fff]/;
    return chineseRegex.test(translatedText);
  } else if (targetLang === 'ja') {
    // 检查是否包含日文字符
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/;
    return japaneseRegex.test(translatedText);
  } else if (targetLang === 'ko') {
    // 检查是否包含韩文字符
    const koreanRegex = /[\uac00-\ud7af]/;
    return koreanRegex.test(translatedText);
  }
  
  // 对于其他语言，假设如果不完全相同就是翻译了
  return true;
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
      console.log('正在测试翻译API连通性...');
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
        console.log('✅ 翻译API配置验证通过');
      }
    } else {
      result.error = testResult.error;
      result.warnings.push('API连接失败，翻译功能可能不稳定');
      // 只在状态变化时输出日志
      if (!configValidationCache.result || configValidationCache.result.apiConnectable !== false) {
        console.log('❌ 翻译API连接失败:', testResult.error);
      }
    }

  } catch (error) {
    result.error = `配置验证失败: ${error.message}`;
    console.error('翻译配置验证错误:', error);
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
    
    const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
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
        max_tokens: 10,
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
        console.error('API测试 JSON 解析错误:', parseError.message);
        console.error('响应内容前1000字符:', responseText.substring(0, 1000));
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

/**
 * 翻译调试日志记录器
 */
class TranslationLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 100;
  }

  /**
   * 记录翻译步骤
   */
  log(level, message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    
    // 同时输出到控制台
    const prefix = `[Translation ${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(prefix, message, data);
    } else if (level === 'warn') {
      console.warn(prefix, message, data);
    } else {
      console.log(prefix, message, data);
    }
  }

  /**
   * 获取最近的日志
   */
  getRecentLogs(count = 20) {
    return this.logs.slice(0, count);
  }

  /**
   * 清空日志
   */
  clear() {
    this.logs = [];
  }
}

// 全局翻译日志记录器
export const translationLogger = new TranslationLogger();

/**
 * 增强版翻译资源函数，包含详细日志
 */
export async function translateResourceWithLogging(resource, targetLang) {
  const resourceId = resource.id || resource.resourceId || 'unknown';
  
  translationLogger.log('info', `开始翻译资源: ${resource.title}`, {
    resourceId,
    resourceType: resource.resourceType,
    targetLanguage: targetLang,
    fieldsToTranslate: {
      title: !!resource.title,  
      description: resource.resourceType === 'page' ? true : !!(resource.descriptionHtml || resource.description),
      handle: !!resource.handle,
      summary: !!resource.summary,
      label: !!resource.label,
      seoTitle: !!resource.seoTitle, 
      seoDescription: !!resource.seoDescription
    }
  });

  try {
    const startTime = Date.now();
    const translations = await translateResource(resource, targetLang);
    const duration = Date.now() - startTime;
    
    // 统计翻译结果
    const translationStats = {
      fieldsTranslated: 0,
      fieldsSkipped: 0,
      totalCharacters: 0,
      translatedCharacters: 0
    };
    
    Object.entries(translations).forEach(([key, value]) => {
      // 处理不同类型的值
      if (value) {
        if (typeof value === 'string') {
          // 字符串类型的翻译
          if (value.trim()) {
            translationStats.fieldsTranslated++;
            translationStats.translatedCharacters += value.length;
          } else {
            translationStats.fieldsSkipped++;
          }
        } else if (typeof value === 'object') {
          // 对象类型的翻译（如Theme资源的translationFields）
          translationStats.fieldsTranslated++;
          // 计算对象中的字符数
          const jsonStr = JSON.stringify(value);
          translationStats.translatedCharacters += jsonStr.length;
        } else {
          // 其他类型
          translationStats.fieldsTranslated++;
        }
      } else {
        translationStats.fieldsSkipped++;
      }
    });
    
    // 检查是否真的翻译了
    const originalText = [
      resource.title,
      resource.description || resource.descriptionHtml,
      resource.summary,
      resource.label,
      resource.seoTitle,
      resource.seoDescription
    ].filter(Boolean).join(' ');
    
    const translatedText = Object.values(translations)
      .filter(Boolean)
      .map(value => {
        // 处理不同类型的值
        if (typeof value === 'string') {
          return value;
        } else if (typeof value === 'object') {
          return JSON.stringify(value);
        } else {
          return String(value);
        }
      })
      .join(' ');
    
    translationStats.totalCharacters = originalText.length;
    const isActuallyTranslated = originalText !== translatedText && translatedText.length > 0;
    
    translationLogger.log('info', `翻译完成: ${resource.title}`, {
      resourceId,
      duration: `${duration}ms`,
      success: true,
      isActuallyTranslated,
      stats: translationStats,
      translations: Object.keys(translations).reduce((acc, key) => {
        if (translations[key]) {
          const value = translations[key];
          if (typeof value === 'string') {
            acc[key] = {
              length: value.length,
              preview: value.substring(0, 100) + (value.length > 100 ? '...' : '')
            };
          } else if (typeof value === 'object') {
            const jsonStr = JSON.stringify(value);
            acc[key] = {
              length: jsonStr.length,
              preview: jsonStr.substring(0, 100) + (jsonStr.length > 100 ? '...' : ''),
              type: 'object'
            };
          } else {
            acc[key] = {
              value: value,
              type: typeof value
            };
          }
        }
        return acc;
      }, {})
    });
    
    if (!isActuallyTranslated) {
      translationLogger.log('warn', `翻译结果与原文相同，可能翻译失败: ${resource.title}`, {
        resourceId,
        originalLength: originalText.length,
        translatedLength: translatedText.length
      });
    }
    
    return translations;
    
  } catch (error) {
    translationLogger.log('error', `翻译失败: ${resource.title}`, {
      resourceId,
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
}

/**
 * 获取翻译统计信息
 */
export function getTranslationStats() {
  const logs = translationLogger.getRecentLogs(50);
  
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
  
  logs.forEach(log => {
    if (log.message.includes('翻译完成')) {
      stats.totalTranslations++;
      if (log.data) {
        try {
          const data = JSON.parse(log.data);
          if (data.success) {
            stats.successfulTranslations++;
          }
          if (data.duration) {
            totalDuration += parseInt(data.duration);
            durationCount++;
          }
        } catch (e) {
          // 忽略JSON解析错误
        }
      }
    } else if (log.message.includes('翻译失败')) {
      stats.failedTranslations++;
      stats.recentErrors.push({
        timestamp: log.timestamp,
        message: log.message,
        error: log.data
      });
    }
    
    // 最近活动
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
  
  // 只保留最近5个错误
  stats.recentErrors = stats.recentErrors.slice(0, 5);
  
  return stats;
}

/**
 * 获取详细的翻译日志
 */
export function getTranslationLogs(count = 20) {
  return translationLogger.getRecentLogs(count);
}

/**
 * 长文本翻译的增强版本
 */
async function translateLongTextEnhanced(text, targetLang) {
  try {
    const result = await translateLongText(text, targetLang);
    const isTranslated = await validateTranslation(text, result, targetLang);
    
    return {
      success: true,
      text: result,
      isOriginal: !isTranslated,
      language: targetLang
    };
  } catch (error) {
    console.error('长文本翻译失败:', error);
    return {
      success: false,
      text: text,
      error: `长文本翻译失败: ${error.message}`,
      isOriginal: true
    };
  }
}

/**
 * 智能文本分块函数
 * @param {string} text - 待分块的文本
 * @param {number} maxChunkSize - 最大分块大小
 * @returns {Array<string>} 分块后的文本数组
 */
function chunkText(text, maxChunkSize = 1000) {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let currentChunk = '';
  
  // 按段落分割（保持语义完整性）
  const paragraphs = text.split(/\n\s*\n|\r\n\s*\r\n/);
  
  console.log(`文本包含 ${paragraphs.length} 个段落`);
  
  for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
    const paragraph = paragraphs[pIndex];
    console.log(`处理第 ${pIndex + 1} 段，长度: ${paragraph.length}`);
    
    // 如果单个段落就超过限制，需要按句子分割
    if (paragraph.length > maxChunkSize) {
      // 如果当前chunk不为空，先保存
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        console.log(`保存块 ${chunks.length}: ${currentChunk.length} 字符`);
        currentChunk = '';
      }
      
      // 改进的句子分割正则，保留标点符号
      const sentenceRegex = /([^.!?\u3002\uff01\uff1f]+[.!?\u3002\uff01\uff1f]+)/g;
      const sentences = paragraph.match(sentenceRegex) || [paragraph];
      
      console.log(`长段落分割为 ${sentences.length} 个句子`);
      
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;
        
        // 如果单个句子都超过限制，强制分割（保守策略：按词分割）
        if (trimmedSentence.length > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            console.log(`保存块 ${chunks.length}: ${currentChunk.length} 字符`);
          }
          
          // 尝试按词分割而不是字符分割
          const words = trimmedSentence.split(/\s+/);
          let tempChunk = '';
          
          for (const word of words) {
            if (tempChunk.length + word.length + 1 > maxChunkSize) {
              if (tempChunk.trim()) {
                chunks.push(tempChunk.trim());
                console.log(`保存词级分割块 ${chunks.length}: ${tempChunk.length} 字符`);
              }
              tempChunk = word;
            } else {
              tempChunk += (tempChunk ? ' ' : '') + word;
            }
          }
          
          if (tempChunk.trim()) {
            currentChunk = tempChunk;
          }
          continue;
        }
        
        // 检查添加这个句子是否会超过限制
        if (currentChunk.length + trimmedSentence.length + 1 > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            console.log(`保存块 ${chunks.length}: ${currentChunk.length} 字符`);
          }
          currentChunk = trimmedSentence;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
        }
      }
    } else {
      // 检查添加这个段落是否会超过限制
      if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          console.log(`保存块 ${chunks.length}: ${currentChunk.length} 字符`);
        }
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
  }
  
  // 添加最后一个chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
    console.log(`保存最终块 ${chunks.length}: ${currentChunk.length} 字符`);
  }
  
  console.log(`总共生成 ${chunks.length} 个分块`);
  return chunks.length > 0 ? chunks : [text];
}

/**
 * 修复的HTML内容保护机制
 * 使用更简单有效的策略，避免嵌套保护问题
 * @param {string} text - 原始文本
 * @returns {Object} 包含占位符文本和标签映射的对象
 */
function protectHtmlTags(text) {
  const protectionMap = new Map();
  let counter = 0;
  let protectedText = text;
  
  // 简化策略：只保护关键的媒体和结构元素
  // 避免嵌套保护导致的恢复问题
  
  console.log('开始HTML保护，原始长度:', text.length);
  
  // 1. 保护完整的iframe（包含内容）
  const iframeRegex = /<iframe[^>]*>.*?<\/iframe>/gis;
  const iframeMatches = text.match(iframeRegex);
  if (iframeMatches) {
    iframeMatches.forEach(iframe => {
      const placeholder = `__PROTECTED_IFRAME_${counter}__`;
      protectionMap.set(placeholder, iframe);
      protectedText = protectedText.replace(iframe, placeholder);
      console.log(`保护iframe: ${placeholder}`);
      counter++;
    });
  }
  
  // 2. 保护video标签（包含内容和子标签）
  const videoRegex = /<video[^>]*>.*?<\/video>/gis;
  const videoMatches = protectedText.match(videoRegex);
  if (videoMatches) {
    videoMatches.forEach(video => {
      const placeholder = `__PROTECTED_VIDEO_${counter}__`;
      protectionMap.set(placeholder, video);
      protectedText = protectedText.replace(video, placeholder);
      console.log(`保护video: ${placeholder}`);
      counter++;
    });
  }
  
  // 3. 保护所有img标签（自闭合）
  const imgRegex = /<img[^>]*\/?>/gi;
  const imgMatches = protectedText.match(imgRegex);
  if (imgMatches) {
    imgMatches.forEach(img => {
      const placeholder = `__PROTECTED_IMG_${counter}__`;
      protectionMap.set(placeholder, img);
      protectedText = protectedText.replace(img, placeholder);
      console.log(`保护图片: ${placeholder}`);
      counter++;
    });
  }
  
  // 4. 保护音频相关标签
  const audioRegex = /<(audio|source|track)[^>]*(?:\/>|>.*?<\/\1>)/gis;
  const audioMatches = protectedText.match(audioRegex);
  if (audioMatches) {
    audioMatches.forEach(audio => {
      const placeholder = `__PROTECTED_AUDIO_${counter}__`;
      protectionMap.set(placeholder, audio);
      protectedText = protectedText.replace(audio, placeholder);
      console.log(`保护音频: ${placeholder}`);
      counter++;
    });
  }
  
  // 5. 保护style标签（包含CSS代码）
  const styleRegex = /<style[^>]*>.*?<\/style>/gis;
  const styleMatches = protectedText.match(styleRegex);
  if (styleMatches) {
    styleMatches.forEach(style => {
      const placeholder = `__PROTECTED_STYLE_${counter}__`;
      protectionMap.set(placeholder, style);
      protectedText = protectedText.replace(style, placeholder);
      console.log(`保护style标签: ${placeholder}`);
      counter++;
    });
  }
  
  // 6. 保护script标签（包含JavaScript代码）
  const scriptRegex = /<script[^>]*>.*?<\/script>/gis;
  const scriptMatches = protectedText.match(scriptRegex);
  if (scriptMatches) {
    scriptMatches.forEach(script => {
      const placeholder = `__PROTECTED_SCRIPT_${counter}__`;
      protectionMap.set(placeholder, script);
      protectedText = protectedText.replace(script, placeholder);
      console.log(`保护script标签: ${placeholder}`);
      counter++;
    });
  }
  
  console.log(`HTML保护完成: 原始${text.length}字符 -> 保护后${protectedText.length}字符, 保护了${protectionMap.size}个元素`);
  
  return {
    text: protectedText,
    tagMap: protectionMap
  };
}

/**
 * 简化的HTML内容恢复机制
 * 直接逐个恢复占位符，避免复杂的分类逻辑
 * @param {string} translatedText - 翻译后的文本
 * @param {Map} tagMap - 标签映射
 * @returns {string} 恢复标签后的文本
 */
function restoreHtmlTags(translatedText, tagMap) {
  let restoredText = translatedText;
  
  console.log(`开始HTML恢复，待恢复占位符: ${tagMap.size}个`);
  
  // 直接逐个恢复占位符
  for (const [placeholder, originalContent] of tagMap) {
    const beforeLength = restoredText.length;
    restoredText = restoredText.split(placeholder).join(originalContent);
    const afterLength = restoredText.length;
    
    if (beforeLength !== afterLength) {
      console.log(`恢复占位符: ${placeholder} -> 内容长度${originalContent.length}`);
    } else {
      console.log(`警告: 占位符 ${placeholder} 未找到，可能已被翻译或修改`);
    }
  }
  
  // 清理可能残留的翻译系统提示文本
  restoredText = restoredText.replace(/\n\n注意[\uff1a:].*?一致性和连贯性[\u3002.]/g, '');
  
  console.log(`HTML恢复完成: 最终长度${restoredText.length}字符`);
  
  return restoredText;
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
      console.log('检测到列表内容，使用特殊分块策略');
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
  
  console.log(`智能分块完成: ${chunks.length}个块，平均长度: ${Math.round(text.length / chunks.length)}字符`);
  return chunks;
}

// 简化版翻译函数 - 作为降级策略使用
async function translateWithSimplePrompt(text, targetLang) {
  console.log(`使用简化翻译策略: ${text.length}字符 -> ${getLanguageName(targetLang)}`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.translation.apiKey}`,
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.translation.timeout);
    
    // 简化的翻译提示词 - 去掉复杂要求，专注基本翻译
    const simplePrompt = `请将以下文本翻译成${getLanguageName(targetLang)}：

要求：
- 直接翻译，保持原意
- 保留HTML标签不变
- 只返回翻译结果，无需解释

文本：`;
    
    // 动态计算max_tokens，支持长文本翻译
    const dynamicMaxTokens = Math.min(text.length * 3, 8000); // 大幅提升token限制以支持长文本
    console.log(`简化翻译策略使用动态token限制: ${dynamicMaxTokens}`);
    
    const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.translation.model,
        messages: [
          {
            role: 'user',
            content: simplePrompt + text
          }
        ],
        temperature: 0.3, // 稍高一点的温度，增加灵活性
        max_tokens: dynamicMaxTokens, // 使用动态token限制而非固定的1500
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`简化翻译API调用失败: ${response.status}`);
    }
    
    const result = JSON.parse(await response.text());
    
    if (result.choices && result.choices[0] && result.choices[0].message) {
      const translatedText = result.choices[0].message.content.trim();
      
      // 基本验证 - 只检查是否为空和是否过短
      if (!translatedText || translatedText.length < text.length * 0.1) {
        throw new Error('简化翻译结果异常短');
      }
      
      console.log(`✅ 简化翻译成功: ${text.length} -> ${translatedText.length} 字符`);
      
      return {
        success: true,
        text: translatedText,
        isOriginal: false,
        language: targetLang,
        strategy: 'simple-prompt'
      };
    }
    
    throw new Error('简化翻译API响应格式异常');
    
  } catch (error) {
    console.error('简化翻译失败:', error.message);
    return {
      success: false,
      text: text,
      error: `简化翻译失败: ${error.message}`,
      isOriginal: true
    };
  }
}

/**
 * 专门用于翻译标题的函数，使用更明确的提示词
 * @param {string} title - 要翻译的标题
 * @param {string} targetLang - 目标语言
 * @returns {Promise<{success: boolean, text: string, error?: string}>}
 */
async function translateTitleWithEnhancedPrompt(title, targetLang) {
  console.log(`🏷️ 使用增强标题翻译策略: "${title}" -> ${getLanguageName(targetLang)}`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.translation.apiKey}`,
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.translation.timeout);
    
    // 专门针对标题的翻译提示词
    const titlePrompt = `你是一个专业的翻译助手。请将下面的标题翻译成${getLanguageName(targetLang)}。

重要要求：
1. 这是一个页面或产品的标题，必须翻译成${getLanguageName(targetLang)}
2. 保持简洁，符合标题的表达习惯
3. 不要保留原文，要完全翻译
4. 只返回翻译结果，不要有任何解释

例如：
- "Shipping Policy" 应翻译为 "配送政策"
- "Privacy Policy" 应翻译为 "隐私政策"
- "About Us" 应翻译为 "关于我们"

待翻译的标题是："${title}"

请直接给出翻译结果：`;
    
    const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.translation.model,
        messages: [
          {
            role: 'user',
            content: titlePrompt
          }
        ],
        temperature: 0.1, // 低温度确保一致性
        max_tokens: 100, // 标题不需要太多token
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`标题翻译API调用失败: ${response.status}`);
    }
    
    const result = JSON.parse(await response.text());
    
    if (result.choices && result.choices[0] && result.choices[0].message) {
      const translatedTitle = result.choices[0].message.content.trim();
      
      // 验证翻译结果
      if (!translatedTitle || translatedTitle === title) {
        throw new Error('标题翻译未成功，结果与原文相同');
      }
      
      // 对于中文目标语言，确保包含中文字符
      if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && !/[\u4e00-\u9fff]/.test(translatedTitle)) {
        throw new Error('标题翻译失败，目标语言为中文但结果无中文字符');
      }
      
      console.log(`✅ 标题翻译成功: "${title}" -> "${translatedTitle}"`);
      
      return {
        success: true,
        text: translatedTitle,
        strategy: 'enhanced-title-prompt'
      };
    }
    
    throw new Error('标题翻译API响应格式异常');
    
  } catch (error) {
    console.error('增强标题翻译失败:', error.message);
    return {
      success: false,
      text: title,
      error: `增强标题翻译失败: ${error.message}`
    };
  }
}

// 带降级的翻译函数
async function translateTextWithFallback(text, targetLang, options = {}) {
  const {
    retryCount = 0
  } = options;
  
  try {
    // 首先尝试使用增强版翻译
    const result = await translateTextEnhanced(text, targetLang, retryCount);
    
    if (result.success) {
      return result;
    }
    
    // 如果失败，分析失败原因并选择合适的策略
    console.log(`增强翻译失败，原因: ${result.error}`);
    
    // 对于长文本（>4000字符），如果增强翻译失败，优先尝试调整长文本阈值后重试
    if (text.length > 4000 && text.length <= 8000) {
      console.log('对于中长文本，尝试绕过长文本阈值限制，强制使用增强翻译...');
      
      // 暂时调整配置，强制使用增强翻译而不是分块处理
      const originalThreshold = config.translation.longTextThreshold;
      config.translation.longTextThreshold = 10000; // 临时提高阈值
      
      try {
        const enhancedResult = await translateTextEnhanced(text, targetLang, 0);
        config.translation.longTextThreshold = originalThreshold; // 恢复原值
        
        if (enhancedResult.success) {
          console.log('✅ 强制增强翻译成功');
          return enhancedResult;
        }
      } catch (error) {
        config.translation.longTextThreshold = originalThreshold; // 恢复原值
        console.log('强制增强翻译也失败，继续其他策略');
      }
    }
    
    // 如果失败，且错误是"文本过长"或token相关，尝试文本优化后重新翻译
    if (result.error && (result.error.includes('文本过长') || result.error.includes('token') || result.error.includes('length'))) {
      console.log('检测到长度相关错误，尝试优化文本后重新翻译...');
      
      // 移除一些HTML属性和类名以减少长度，但保持内容完整性
      let optimizedText = text;
      if (text.includes('<')) {
        optimizedText = text
          .replace(/class="[^"]*"/g, '') // 移除class属性
          .replace(/style="[^"]*"/g, '') // 移除style属性
          .replace(/data-[^=]*="[^"]*"/g, '') // 移除data属性
          .replace(/id="[^"]*"/g, '') // 移除id属性
          .replace(/\s+/g, ' ') // 压缩空白字符
          .trim();
      }
      
      // 如果优化后长度显著减少，重新尝试增强翻译
      if (optimizedText.length < text.length * 0.8) {
        console.log(`文本优化成功: ${text.length} -> ${optimizedText.length} 字符，重新尝试增强翻译`);
        
        const optimizedResult = await translateTextEnhanced(optimizedText, targetLang, 0);
        if (optimizedResult.success) {
          console.log('✅ 优化文本后增强翻译成功');
          return optimizedResult;
        }
        console.log('优化文本后增强翻译仍失败，使用简化策略');
      } else {
        console.log('文本优化效果有限，直接使用简化策略');
      }
      
      // 使用优化后的文本进行简化翻译
      console.log('使用优化后的文本进行简化翻译...');
      return await translateWithSimplePrompt(optimizedText, targetLang);
    }
    
    // 对于非长度相关的错误，根据重试次数决定策略
    if (retryCount === 0) {
      console.log('非长度错误，尝试简化翻译策略...');
      return await translateWithSimplePrompt(text, targetLang);
    }
    
    // 最后的降级：返回原文
    console.log('所有翻译策略均失败，返回原文');
    return {
      success: false,
      text: text,
      error: `所有翻译策略失败: ${result.error}`,
      isOriginal: true
    };
    
  } catch (error) {
    console.error('translateTextWithFallback异常:', error);
    
    // 如果标准翻译抛出异常，尝试简化翻译策略
    if (retryCount === 0) {
      console.log('标准翻译异常，尝试简化翻译策略...');
      try {
        return await translateWithSimplePrompt(text, targetLang);
      } catch (fallbackError) {
        console.error('简化翻译策略也失败:', fallbackError.message);
      }
    }
    
    return {
      success: false,
      text: text,
      error: error.message,
      isOriginal: true
    };
  }
}

/**
 * 专门处理HTML列表项的翻译函数
 * @param {string} listHtml - 包含<li>标签的HTML内容
 * @param {string} targetLang - 目标语言
 * @returns {Promise<string>} 翻译后的列表HTML
 */
/**
 * 专门用于翻译SEO描述的函数，使用更强制的提示词
 * @param {string} description - 要翻译的SEO描述
 * @param {string} targetLang - 目标语言
 * @returns {Promise<{success: boolean, text: string, error?: string}>}
 */
async function translateSEODescription(description, targetLang) {
  console.log(`🔍 使用SEO描述专用翻译策略: "${description.substring(0, 50)}..." -> ${getLanguageName(targetLang)}`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.translation.apiKey}`,
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.translation.timeout);
    
    // 专门针对SEO描述的翻译提示词
    const seoPrompt = `你是一个专业的SEO优化翻译专家。请将下面的SEO描述翻译成${getLanguageName(targetLang)}。

极其重要的要求：
1. 这是网页的SEO meta description，必须完全翻译成${getLanguageName(targetLang)}
2. 保持SEO描述的吸引力和关键词密度
3. 长度控制在150-160字符以内（中文约80字）
4. 绝对不能返回原文，必须翻译
5. 保留产品规格信息（如尺寸、重量等）
6. 只返回翻译结果，不要有任何解释

示例：
英文："Shield your hang with the Billow ultralight hammock tarp. At 12′×9.7′, 1.86 lbs..."
中文："使用Billow超轻吊床防水布保护您的吊床。尺寸12′×9.7′，重量1.86磅..."

待翻译的SEO描述：
"${description}"

请直接给出翻译结果：`;
    
    // 动态计算token限制，支持更长的SEO描述
    const dynamicMaxTokens = Math.min(description.length * 2, 1000); // 提升SEO描述的token限制
    console.log(`SEO描述翻译使用动态token限制: ${dynamicMaxTokens}`);
    
    const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.translation.model,
        messages: [
          {
            role: 'user',
            content: seoPrompt
          }
        ],
        temperature: 0.1, // 低温度确保一致性
        max_tokens: dynamicMaxTokens, // 使用动态token限制而非固定的500
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`SEO描述翻译API调用失败: ${response.status}`);
    }
    
    const result = JSON.parse(await response.text());
    
    if (result.choices && result.choices[0] && result.choices[0].message) {
      const translatedDesc = result.choices[0].message.content.trim();
      
      // 验证翻译结果
      if (!translatedDesc || translatedDesc === description) {
        throw new Error('SEO描述翻译未成功，结果与原文相同');
      }
      
      // 对于中文目标语言，确保包含中文字符
      if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && !/[\u4e00-\u9fff]/.test(translatedDesc)) {
        throw new Error('SEO描述翻译失败，目标语言为中文但结果无中文字符');
      }
      
      // 检查是否保留了太多英文
      const englishWords = translatedDesc.match(/[a-zA-Z]+/g) || [];
      const totalWords = translatedDesc.split(/\s+/).length;
      const englishRatio = englishWords.length / totalWords;
      
      if (englishRatio > 0.5 && (targetLang === 'zh-CN' || targetLang === 'zh-TW')) {
        console.warn('SEO描述翻译可能不完整，英文比例过高');
      }
      
      console.log(`✅ SEO描述翻译成功: "${description.substring(0, 50)}..." -> "${translatedDesc.substring(0, 50)}..."`);
      
      return {
        success: true,
        text: translatedDesc,
        strategy: 'seo-description-prompt'
      };
    }
    
    throw new Error('SEO描述翻译API响应格式异常');
    
  } catch (error) {
    console.error('SEO描述专用翻译失败:', error.message);
    return {
      success: false,
      text: description,
      error: `SEO描述翻译失败: ${error.message}`
    };
  }
}

async function translateListItems(listHtml, targetLang) {
  console.log(`🔸 开始翻译列表项内容，目标语言: ${getLanguageName(targetLang)}`);
  
  try {
    // 提取所有列表项
    const listItemRegex = /<li[^>]*>(.*?)<\/li>/gis;
    const matches = Array.from(listHtml.matchAll(listItemRegex));
    
    if (matches.length === 0) {
      console.log('未找到列表项，返回原内容');
      return listHtml;
    }
    
    console.log(`找到 ${matches.length} 个列表项需要翻译`);
    
    // 批量翻译所有列表项内容
    const itemTexts = matches.map(match => {
      // 清理HTML标签，只保留纯文本
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      return text;
    });
    
    // 检查是否包含技术术语或产品特性
    const technicalTerms = [
      'lightweight', 'compact', 'portable', 'waterproof', 'durable', 'versatile',
      'all-weather', 'protective', 'heavy-duty', 'reinforced', 'premium',
      'ultralight', 'ripstop', 'setup', 'no-knot', 'four seasons',
      'backpacker', 'approved', 'money-back', 'guaranteed', 'stitching',
      'coverage', 'reflective', 'instructions', 'guylines', 'gears'
    ];
    
    const hasThechnicalTerms = itemTexts.some(text => 
      technicalTerms.some(term => text.toLowerCase().includes(term.toLowerCase()))
    );
    
    // 构建专门的列表翻译提示，针对技术产品特性优化
    const listPrompt = `你是一个专业的户外装备翻译专家。请将以下产品特性列表翻译成${getLanguageName(targetLang)}。

极其重要的要求：
1. 这是产品特性列表，必须100%完全翻译成${getLanguageName(targetLang)}
2. 专业术语要准确翻译，保持技术含义
3. 产品特性要突出优势和卖点
4. 每个列表项独立翻译，保持原有的条目结构
5. 翻译要简洁明了，符合列表项的表达习惯
6. 绝对不能保留英文，除非是品牌名称
7. 不要添加额外的标点符号或解释
8. 只返回翻译结果，每行一个，不要有其他内容

${hasThechnicalTerms ? '注意：这些是技术产品特性，请确保专业术语的准确性：\n- lightweight = 轻便的\n- compact = 紧凑的\n- portable = 便携式的\n- waterproof = 防水的\n- durable = 耐用的\n- versatile = 多功能的\n- all-weather = 全天候的\n- protective = 防护的\n\n' : ''}列表项内容：
${itemTexts.map((text, i) => `${i + 1}. ${text}`).join('\n')}

请按照相同的顺序返回翻译结果：`;
    
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.translation.apiKey}`,
      };
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.translation.timeout);
      
      // 动态计算token限制，确保有足够空间完整翻译
      const dynamicMaxTokens = Math.min(itemTexts.join(' ').length * 4, 3000); // 增加token限制
      
      const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.translation.model,
          messages: [
            {
              role: 'user',
              content: listPrompt
            }
          ],
          temperature: 0.1, // 低温度确保一致性
          max_tokens: dynamicMaxTokens,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`列表翻译API调用失败: ${response.status}`);
      }
      
      const result = JSON.parse(await response.text());
      
      if (result.choices && result.choices[0] && result.choices[0].message) {
        const translatedText = result.choices[0].message.content.trim();
        
        // 解析翻译结果
        const translatedItems = translatedText.split('\n')
          .map(line => line.replace(/^[\d\-\*\•]+\.?\s*/, '').trim()) // 移除各种列表标记
          .filter(line => line.length > 0);
        
        console.log(`原始翻译结果包含 ${translatedItems.length} 项`);
        
        // 验证翻译质量
        let validTranslations = [];
        for (let i = 0; i < Math.min(translatedItems.length, itemTexts.length); i++) {
          const original = itemTexts[i];
          const translated = translatedItems[i];
          
          // 检查是否真的被翻译了
          if (translated && translated !== original) {
            // 检查中英文混合情况
            if (targetLang === 'zh-CN' || targetLang === 'zh-TW') {
              const hasChinese = /[\u4e00-\u9fff]/.test(translated);
              const englishWords = (translated.match(/[a-zA-Z]+/g) || []).length;
              const englishRatio = englishWords / Math.max(translated.split('').length / 5, 1);
              
              if (hasChinese && englishRatio < 0.3) { // 允许30%的英文（品牌词等）
                validTranslations.push(translated);
              } else {
                console.warn(`列表项 ${i + 1} 翻译质量不佳: "${translated}"，英文比例过高或无中文`);
                validTranslations.push(original); // 保留原文，后续处理
              }
            } else {
              validTranslations.push(translated);
            }
          } else {
            console.warn(`列表项 ${i + 1} 未被翻译: "${original}"`);
            validTranslations.push(original); // 保留原文，后续处理
          }
        }
        
        // 如果批量翻译的质量不理想，进行逐个修正
        if (validTranslations.filter(t => t !== itemTexts[validTranslations.indexOf(t)]).length < itemTexts.length * 0.8) {
          console.log('批量翻译质量不理想，进行逐个翻译修正...');
          
          for (let i = 0; i < itemTexts.length; i++) {
            if (validTranslations[i] === itemTexts[i]) { // 如果这一项没有被翻译
              try {
                console.log(`重新翻译列表项 ${i + 1}: "${itemTexts[i]}"`);
                const itemResult = await translateWithSimplePrompt(itemTexts[i], targetLang);
                
                if (itemResult.success && itemResult.text !== itemTexts[i]) {
                  // 验证单项翻译质量
                  if (targetLang === 'zh-CN' || targetLang === 'zh-TW') {
                    const hasChinese = /[\u4e00-\u9fff]/.test(itemResult.text);
                    if (hasChinese) {
                      validTranslations[i] = itemResult.text;
                      console.log(`✅ 列表项 ${i + 1} 重新翻译成功`);
                    }
                  } else {
                    validTranslations[i] = itemResult.text;
                    console.log(`✅ 列表项 ${i + 1} 重新翻译成功`);
                  }
                }
              } catch (itemError) {
                console.error(`列表项 ${i + 1} 重新翻译失败:`, itemError.message);
              }
            }
          }
        }
        
        // 应用翻译结果
        let resultHtml = listHtml;
        let successCount = 0;
        
        for (let i = 0; i < Math.min(matches.length, validTranslations.length); i++) {
          const originalMatch = matches[i][0];
          const originalTag = originalMatch.match(/<li[^>]*>/)[0];
          const translatedItem = validTranslations[i];
          
          if (translatedItem && translatedItem !== itemTexts[i]) {
            const newItem = `${originalTag}${translatedItem}</li>`;
            resultHtml = resultHtml.replace(originalMatch, newItem);
            successCount++;
          } else {
            // 即使没有翻译成功，也要确保格式正确
            const newItem = `${originalTag}${itemTexts[i]}</li>`;
            resultHtml = resultHtml.replace(originalMatch, newItem);
          }
        }
        
        console.log(`✅ 列表项翻译成功: ${successCount}/${matches.length} 项`);
        
        // 最终检查：确保没有明显的英文残留
        if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && successCount < matches.length * 0.9) {
          console.log('🔧 进行最后的英文残留检查和处理...');
          
          // 找出仍然是英文的列表项进行最后的处理
          const remainingEnglish = resultHtml.match(/<li[^>]*>[^<]*[a-zA-Z]{3,}[^<]*<\/li>/g) || [];
          console.log(`发现 ${remainingEnglish.length} 个列表项仍包含英文内容`);
          
          for (const englishItem of remainingEnglish.slice(0, 5)) { // 只处理前5个
            const content = englishItem.replace(/<li[^>]*>|<\/li>/g, '').trim();
            if (content.length > 3) {
              try {
                const lastAttempt = await translateWithSimplePrompt(content, targetLang);
                if (lastAttempt.success && /[\u4e00-\u9fff]/.test(lastAttempt.text)) {
                  const tag = englishItem.match(/<li[^>]*>/)[0];
                  const newItem = `${tag}${lastAttempt.text}</li>`;
                  resultHtml = resultHtml.replace(englishItem, newItem);
                  console.log(`🔧 英文残留已处理: "${content}" -> "${lastAttempt.text}"`);
                }
              } catch {
                // 忽略最后的处理错误
              }
            }
          }
        }
        
        return resultHtml;
      }
      
      throw new Error('列表翻译API响应格式异常');
      
    } catch (error) {
      console.error('列表项批量翻译失败，尝试逐个翻译:', error.message);
      
      // 降级策略：逐个翻译列表项
      let resultHtml = listHtml;
      let successCount = 0;
      
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const text = match[1].replace(/<[^>]+>/g, '').trim();
        
        if (!text) continue;
        
        try {
          // 使用增强翻译而不是基础翻译
          const result = await translateTextWithFallback(text, targetLang, { retryCount: 0 });
          
          if (result.success && !result.isOriginal && result.text !== text) {
            const originalMatch = match[0];
            const originalTag = originalMatch.match(/<li[^>]*>/)[0];
            const newItem = `${originalTag}${result.text}</li>`;
            resultHtml = resultHtml.replace(originalMatch, newItem);
            successCount++;
            console.log(`✅ 列表项 ${i + 1} 逐个翻译成功`);
          } else {
            console.log(`⚪ 列表项 ${i + 1} 翻译无变化或失败`);
          }
        } catch (itemError) {
          console.error(`列表项 ${i + 1} 翻译失败:`, itemError.message);
        }
        
        // 添加延迟避免API限流
        if (i < matches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`⚠️ 列表项逐个翻译完成: ${successCount}/${matches.length} 项成功`);
      return resultHtml;
    }
    
  } catch (error) {
    console.error('列表项翻译处理失败:', error);
    return listHtml; // 失败时返回原内容
  }
}

/**
 * 后处理翻译结果，检查并修复英文残留问题
 * @param {string} translatedText - 翻译后的文本
 * @param {string} targetLang - 目标语言
 * @param {string} originalText - 原始文本（用于对比）
 * @returns {Promise<string>} 处理后的翻译文本
 */
/**
 * HTML内容专用处理器 - 处理特殊HTML标签中的英文内容
 * @param {string} htmlContent - HTML内容
 * @param {string} targetLang - 目标语言
 * @returns {string} 处理后的HTML内容
 */
async function processHtmlSpecialElements(htmlContent, targetLang) {
  if (!htmlContent || targetLang !== 'zh-CN' && targetLang !== 'zh-TW') {
    return htmlContent;
  }
  
  let processedContent = htmlContent;
  
  try {
    // 1. 处理iframe标签的title属性
    const iframeMatches = processedContent.match(/<iframe[^>]*>/gi) || [];
    for (const iframe of iframeMatches) {
      let updatedIframe = iframe;
      
      // 处理title属性
      const titleMatch = iframe.match(/title=["']([^"']+)["']/i);
      if (titleMatch) {
        const originalTitle = titleMatch[1];
        let translatedTitle = originalTitle;
        
        // 特定的媒体标题翻译
        if (originalTitle.toLowerCase().includes('youtube video player')) {
          translatedTitle = 'YouTube视频播放器';
        } else if (originalTitle.toLowerCase().includes('video player')) {
          translatedTitle = '视频播放器';
        } else if (originalTitle.toLowerCase().includes('player')) {
          translatedTitle = originalTitle.replace(/player/gi, '播放器');
        }
        
        if (translatedTitle !== originalTitle) {
          updatedIframe = iframe.replace(titleMatch[0], `title="${translatedTitle}"`);
          processedContent = processedContent.replace(iframe, updatedIframe);
          console.log(`✨ iframe标题已翻译: "${originalTitle}" -> "${translatedTitle}"`);
        }
      }
    }
    
    // 2. 处理img标签的alt属性
    const imgMatches = processedContent.match(/<img[^>]*>/gi) || [];
    for (const img of imgMatches) {
      let updatedImg = img;
      
      const altMatch = img.match(/alt=["']([^"']+)["']/i);
      if (altMatch) {
        const originalAlt = altMatch[1];
        let translatedAlt = originalAlt;
        
        // 常见的alt文本翻译
        const altTranslations = {
          'tarp setup': '防水布设置',
          'tarp tent': '防水布帐篷',
          'large tarp': '大尺寸防水布',
          'compact tarp': '紧凑型防水布',
          'camo tarp shelter': '迷彩防水布庇护所',
          'image': '图片',
          'photo': '照片',
          'picture': '图片'
        };
        
        for (const [english, chinese] of Object.entries(altTranslations)) {
          if (originalAlt.toLowerCase().includes(english)) {
            translatedAlt = translatedAlt.replace(new RegExp(english, 'gi'), chinese);
          }
        }
        
        if (translatedAlt !== originalAlt) {
          updatedImg = img.replace(altMatch[0], `alt="${translatedAlt}"`);
          processedContent = processedContent.replace(img, updatedImg);
          console.log(`✨ 图片alt已翻译: "${originalAlt}" -> "${translatedAlt}"`);
        }
      }
    }
    
    // 3. 处理HTML注释中的英文内容
    const commentMatches = processedContent.match(/<!--\s*([^>]+)\s*-->/gi) || [];
    for (const comment of commentMatches) {
      const content = comment.replace(/<!--\s*|\s*-->/g, '');
      if (content.toLowerCase() === 'split') {
        const translatedComment = '<!-- 分割 -->';
        processedContent = processedContent.replace(comment, translatedComment);
        console.log(`✨ HTML注释已翻译: "${content}" -> "分割"`);
      }
    }
    
    // 4. 处理特殊的HTML实体和字符
    const entityReplacements = {
      'YouTube video player': 'YouTube视频播放器',
      'video player': '视频播放器',
      'YouTube': 'YouTube', // 保持品牌名
    };
    
    for (const [english, chinese] of Object.entries(entityReplacements)) {
      if (processedContent.includes(english)) {
        // 只在非HTML属性的文本中替换
        processedContent = processedContent.replace(
          new RegExp(`(?<!["'])${english}(?!["'])`, 'gi'), 
          chinese
        );
      }
    }
    
    console.log(`🔧 HTML特殊元素处理完成`);
    
  } catch (error) {
    console.error('HTML特殊元素处理失败:', error);
  }
  
  return processedContent;
}

export async function postProcessTranslation(translatedText, targetLang, originalText = '') {
  // 只对中文目标语言进行英文残留检查
  if (targetLang !== 'zh-CN' && targetLang !== 'zh-TW') {
    return translatedText;
  }
  
  console.log(`🔍 开始翻译后处理，检查英文残留...`);
  
  let processedText = translatedText;
  
  try {
    // 0. 首先处理HTML特殊元素
    processedText = await processHtmlSpecialElements(processedText, targetLang);
    
    // 1. 增强的英文残留检测模式
    const englishPatterns = [
      // 原有的完整英文句子检测
      /[A-Z][a-zA-Z\s,\.\-!?']{19,}[\.!?]/g,
      
      // 新增：中等长度的英文短语（8-19字符）
      /\b[a-zA-Z]+(?:\s+[a-zA-Z]+){1,3}\b(?=[\s\.,;:]|$)/g,
      
      // 新增：HTML标签内的英文文本（不包括属性）
      />[^<]*[a-zA-Z]{3,}[^<]*</g,
      
      // 新增：列表项中的英文内容
      /<li[^>]*>[^<]*[a-zA-Z]+[^<]*<\/li>/gi,
      
      // 新增：复合技术描述（带with/and的短语）
      /\b[a-zA-Z]+\s+(?:with|and)\s+[a-zA-Z\s,]+(?:attached|included|designed)\b/gi,
      
      // 新增：产品特性描述
      /\b(?:Good choice for|Why Buy|Versatile for|This|The|It's|You can|We|Our|Made from|Set up|Full kit)\s+[a-zA-Z\s,\.!?]{5,}/gi,
      
      // 新增：iframe和其他媒体标签中的英文属性值
      /(?:title|alt)=["'][^"']*[a-zA-Z]{3,}[^"']*["']/gi,
      
      // 新增：单独的未翻译英文词组（3个或更多连续英文单词）
      /\b[A-Z][a-zA-Z]*(?:\s+[a-zA-Z]+){2,}/g
    ];
    
    const foundEnglishParts = new Set(); // 使用Set避免重复
    
    for (const pattern of englishPatterns) {
      const matches = processedText.match(pattern) || [];
      for (let match of matches) {
        // 清理匹配内容
        match = match.replace(/^[>\s]+|[<\s]+$/g, '').trim();
        
        // 过滤条件优化
        if (match.length > 5 && 
            !isBrandWord(match.toLowerCase()) && 
            !match.match(/^\d+[\w\s\-×]*$/) && // 排除尺寸规格
            !match.match(/^https?:\/\//) && // 排除URL
            !match.match(/^[a-zA-Z0-9\-_]+\.(jpg|png|gif|mp4|webm)$/i) && // 排除文件名
            !match.includes('=') && // 排除HTML属性
            /[a-zA-Z]{3,}/.test(match)) { // 确保有实际的英文内容
          foundEnglishParts.add(match);
        }
      }
    }
    
    // 2. HTML深度解析 - 检测嵌套内容中的英文
    const htmlElements = processedText.match(/<[^>]+>/g) || [];
    for (const element of htmlElements) {
      // 检测HTML标签的属性值中的英文
      const attributeMatches = element.match(/(?:title|alt|placeholder)=["']([^"']+)["']/gi) || [];
      for (const attrMatch of attributeMatches) {
        const value = attrMatch.replace(/.*=["']([^"']+)["'].*/, '$1');
        if (value.length > 5 && /[a-zA-Z]{3,}/.test(value) && !/^https?:\/\//.test(value)) {
          foundEnglishParts.add(value);
        }
      }
    }
    
    // 3. 特殊媒体内容检测
    const iframeMatches = processedText.match(/<iframe[^>]*title=["']([^"']+)["'][^>]*>/gi) || [];
    for (const iframe of iframeMatches) {
      const title = iframe.replace(/.*title=["']([^"']+)["'].*/, '$1');
      if (title.includes('video player') || title.includes('YouTube')) {
        foundEnglishParts.add(title);
      }
    }
    
    const englishPartsArray = Array.from(foundEnglishParts).slice(0, 15); // 限制处理数量但增加到15个
    
    if (englishPartsArray.length > 0) {
      console.log(`发现 ${englishPartsArray.length} 处英文残留需要处理`);
      
      // 4. 分层翻译处理
      for (const englishPart of englishPartsArray) {
        try {
          console.log(`翻译英文残留: "${englishPart.substring(0, 50)}..."`);
          
          // 根据内容类型选择翻译策略
          let translationResult;
          
          if (englishPart.includes('video player') || englishPart.includes('YouTube')) {
            // 媒体内容特殊处理
            translationResult = {
              success: true,
              text: englishPart.replace(/video player/gi, '视频播放器').replace(/YouTube/gi, 'YouTube')
            };
          } else if (englishPart.length < 30) {
            // 短语使用简化翻译
            translationResult = await translateWithSimplePrompt(englishPart, targetLang);
          } else {
            // 长句子使用标准翻译
            translationResult = await translateWithSimplePrompt(englishPart, targetLang);
          }
          
          if (translationResult.success && translationResult.text !== englishPart) {
            // 验证翻译质量 - 放宽标准
            const hasChinese = /[\u4e00-\u9fff]/.test(translationResult.text);
            const englishWords = (translationResult.text.match(/[a-zA-Z]+/g) || []).length;
            const originalEnglishWords = (englishPart.match(/[a-zA-Z]+/g) || []).length;
            
            // 更宽松的质量检查：只要有中文字符且英文词汇减少就接受
            if (hasChinese && englishWords < originalEnglishWords) {
              // 智能替换 - 使用精确匹配避免误替换
              const escapedPart = englishPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(escapedPart, 'g');
              processedText = processedText.replace(regex, translationResult.text);
              console.log(`✅ 英文残留已翻译: "${englishPart.substring(0, 30)}..." -> "${translationResult.text.substring(0, 30)}..."`);
            } else {
              console.log(`⚠️ 英文残留翻译质量不佳，保留原文`);
            }
          }
        } catch (partError) {
          console.error(`英文残留翻译失败: ${partError.message}`);
        }
        
        // 减少延迟但保持API限流控制
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // 5. 扩展的技术术语替换词典
    const commonTechnicalTerms = {
      // 原有术语
      'lightweight': '轻便',
      'compact': '紧凑',
      'portable': '便携',
      'waterproof': '防水',
      'durable': '耐用',
      'versatile': '多功能',
      'all-weather': '全天候',
      'protective': '防护',
      'heavy-duty': '重型',
      'reinforced': '加固',
      'premium': '优质',
      'ultralight': '超轻',
      'setup': '设置',
      'four seasons': '四季',
      'backpacker': '背包客',
      'approved': '认可',
      'money-back': '退款',
      'guaranteed': '保证',
      'stitching': '缝线',
      'coverage': '覆盖',
      'reflective': '反光',
      'instructions': '说明',
      'carrying bag': '携带袋',
      'included': '包含',
      
      // 新增户外装备术语
      'carabiners': '登山扣',
      'cordage': '绳索',
      'attached': '连接',
      'compression': '压缩',
      'stuff sack': '收纳袋',
      'guy line': '拉绳',
      'adjusters': '调节器',
      'stakes': '地钉',
      'suspension lines': '悬挂绳',
      'tie-outs': '系绳点',
      'pullouts': '拉绳点',
      
      // 媒体和界面术语
      'video player': '视频播放器',
      'YouTube video player': 'YouTube视频播放器',
      'image': '图片',
      'alt': 'alt',
      'title': '标题'
    };
    
    let replacedTerms = 0;
    for (const [english, chinese] of Object.entries(commonTechnicalTerms)) {
      // 使用单词边界匹配，避免误替换
      const regex = new RegExp(`\\b${english}\\b`, 'gi');
      if (regex.test(processedText)) {
        processedText = processedText.replace(regex, chinese);
        replacedTerms++;
      }
    }
    
    if (replacedTerms > 0) {
      console.log(`✅ 替换了 ${replacedTerms} 个常见技术术语`);
    }
    
    // 6. 改进的质量统计 - 只计算纯文本内容
    const pureTextContent = processedText
      .replace(/<[^>]+>/g, ' ') // 移除HTML标签
      .replace(/https?:\/\/[^\s]+/g, ' ') // 移除URL
      .replace(/\s+/g, ' ') // 规范化空格
      .trim();
    
    const finalChineseChars = (pureTextContent.match(/[\u4e00-\u9fff]/g) || []).length;
    const finalEnglishWords = (pureTextContent.match(/\b[a-zA-Z]{2,}\b/g) || []).length;
    const finalTotalChars = pureTextContent.length;
    
    const chineseRatio = finalChineseChars / Math.max(finalTotalChars, 1);
    const englishRatio = (finalEnglishWords * 4) / Math.max(finalTotalChars, 1); // 调整估算系数
    
    console.log(`📊 后处理结果统计:`);
    console.log(`- 中文字符: ${finalChineseChars} (${(chineseRatio * 100).toFixed(1)}%)`);
    console.log(`- 英文单词: ${finalEnglishWords} (估算占比: ${(englishRatio * 100).toFixed(1)}%)`);
    console.log(`- 总长度: ${finalTotalChars} 字符`);
    
    // 7. 更宽松的质量检查标准
    if (englishRatio > 0.15) { // 降低阈值从20%到15%
      console.warn(`⚠️ 翻译后仍有较多英文内容 (${(englishRatio * 100).toFixed(1)}%)，可能需要人工检查`);
      
      // 尝试找出最后的英文残留
      const remainingEnglish = pureTextContent.match(/\b[a-zA-Z]{3,}(?:\s+[a-zA-Z]+){1,}\b/g) || [];
      if (remainingEnglish.length > 0) {
        console.warn(`剩余英文内容示例: "${remainingEnglish[0].substring(0, 50)}..."`);
      }
    } else {
      console.log(`✅ 翻译后处理完成，英文残留已降至最低水平`);
    }
    
    return processedText;
    
  } catch (error) {
    console.error('翻译后处理失败:', error);
    return translatedText; // 失败时返回原始翻译
  }
}

async function translateLongText(text, targetLang) {
  console.log(`开始长文本翻译: ${text.length} 字符 -> ${getLanguageName(targetLang)}`);
  
  try {
    // 1. 保护HTML标签
    const { text: protectedText, tagMap } = protectHtmlTags(text);
    
    // 2. 更激进的分块策略 - 对于HTML内容使用更小的块
    const isHtmlContent = text.includes('<') && text.includes('>');
    const maxChunkSize = isHtmlContent ? 800 : 1200; // HTML内容使用更小的块
    const chunks = intelligentChunkText(protectedText, maxChunkSize);
    console.log(`文本已分割为 ${chunks.length} 个块，每块最大 ${maxChunkSize} 字符`);
    
    // 3. 翻译各个分块
    const translatedChunks = [];
    const failedChunks = [];
    let consecutiveFailures = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n========== 翻译第 ${i + 1}/${chunks.length} 块 ==========`);
      console.log(`块内容预览: ${chunk.substring(0, 100)}...`);
      console.log(`块长度: ${chunk.length} 字符`);
      
      // 检查是否应该跳过这个块（比如纯HTML标签）
      const cleanText = chunk.replace(/<[^>]+>/g, '').trim();
      if (cleanText.length < 10) {
        console.log(`跳过纯标签块`);
        translatedChunks.push(chunk);
        continue;
      }
      
      // 检查是否是列表块
      const isListBlock = /<li[^>]*>.*?<\/li>/is.test(chunk);
      if (isListBlock) {
        console.log(`🔸 检测到列表块，使用专门的列表翻译策略`);
        try {
          const translatedList = await translateListItems(chunk, targetLang);
          translatedChunks.push(translatedList);
          consecutiveFailures = 0;
          continue;
        } catch (listError) {
          console.error('列表翻译失败，使用常规翻译:', listError.message);
          // 继续使用常规翻译流程
        }
      }
      
      let translatedChunk = null;
      let retryCount = 0;
      const maxRetries = 3; // 增加重试次数以提高成功率
      
      while (retryCount <= maxRetries && !translatedChunk) {
        try {
          // 对于包含大量特殊字符的块，使用特殊处理
          // 智能检测需要特殊处理的内容类型
          const hasComplexHtml = /<[^>]*\s+[^>]*>/.test(chunk); // 复杂HTML标签
          const hasMultipleImages = (chunk.match(/<img[^>]*>/g) || []).length > 2; // 多个图片
          const hasComplexStructure = hasComplexHtml || hasMultipleImages;
          // 对于复杂结构，使用更保守的长度限制，但不截断句子
          let adjustedChunk = chunk;
          if (hasComplexStructure && chunk.length > 800) {
            // 尝试在句子边界截断，而不是硬截断
            const sentences = chunk.split(/[.!?\u3002\uff01\uff1f]\s+/);
            let truncated = '';
            for (const sentence of sentences) {
              if ((truncated + sentence).length <= 700) {
                truncated += (truncated ? '. ' : '') + sentence;
              } else {
                break;
              }
            }
            adjustedChunk = truncated || chunk.substring(0, 700);
            console.log(`复杂结构块已智能截断: ${chunk.length} -> ${adjustedChunk.length} 字符`);
          }
          
          // 使用更保守的翻译参数
          const result = await translateTextWithFallback(adjustedChunk, targetLang, {
            maxTokens: Math.min(adjustedChunk.length * 3, 2000),
            temperature: 0.1,
            retryCount: 0
          });
          
          if (result.success && !result.isOriginal) {
            // 如果是智能截断的块，补充剩余部分（保持原有HTML结构）
            if (hasComplexStructure && adjustedChunk.length < chunk.length) {
              const remainingPart = chunk.substring(adjustedChunk.length);
              // 对于HTML内容，尝试保持结构完整性
              if (remainingPart.includes('<')) {
                translatedChunk = result.text + remainingPart; // 直接拼接未翻译的HTML部分
              } else {
                translatedChunk = result.text + remainingPart; // 拼接剩余文本
              }
              console.log(`智能截断块已合并，译文长度: ${result.text.length}, 原始部分: ${remainingPart.length}`);
            } else {
              translatedChunk = result.text;
            }
            console.log(`✅ 第${i + 1}块翻译成功`);
            consecutiveFailures = 0;
          } else {
            throw new Error(result.error || '翻译失败');
          }
          
        } catch (error) {
          retryCount++;
          console.error(`❌ 第${i + 1}块翻译失败详情 (尝试 ${retryCount}/${maxRetries + 1}): {
            error: "${error.message}",
            chunkIndex: ${i + 1},
            chunkLength: ${chunk.length},
            chunkPreview: "${chunk.substring(0, 100).replace(/"/g, '\\"')}...",
            hasComplexStructure: ${/[<>{}()[\]\\\/]/.test(chunk)},
            adjustedLength: ${/[<>{}()[\]\\\/]/.test(chunk) ? Math.min(chunk.length, 600) : chunk.length},
            targetLang: "${targetLang}",
            consecutiveFailures: ${consecutiveFailures}
          }`);
          
          if (retryCount <= maxRetries) {
            // 使用指数退避算法：1s, 2s, 4s, 8s...，最大10秒
            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
            console.log(`等待 ${delay / 1000} 秒后重试... (指数退避策略)`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // 如果常规翻译失败，尝试强制简化翻译模式
      if (!translatedChunk) {
        console.log(`🔧 尝试强制简化翻译模式 - 第${i + 1}块`);
        try {
          // 移除所有HTML标签，只保留纯文本内容
          const pureText = chunk.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          
          if (pureText.length > 10) {
            console.log(`强制简化翻译: 移除HTML后文本长度 ${pureText.length} 字符`);
            
            // 使用最简单的翻译策略
            const simpleResult = await translateWithSimplePrompt(pureText, targetLang);
            
            if (simpleResult.success && !simpleResult.isOriginal) {
              // 尝试重新插入HTML结构
              const htmlTags = chunk.match(/<[^>]*>/g) || [];
              let rebuiltChunk = simpleResult.text;
              
              // 简单的HTML标签重新插入策略
              if (htmlTags.length > 0) {
                // 对于简单的HTML结构，尝试保留
                if (chunk.includes('<p>') && chunk.includes('</p>')) {
                  rebuiltChunk = `<p>${simpleResult.text}</p>`;
                } else if (chunk.includes('<li>') && chunk.includes('</li>')) {
                  rebuiltChunk = `<li>${simpleResult.text}</li>`;
                } else if (chunk.includes('<div>') && chunk.includes('</div>')) {
                  rebuiltChunk = `<div>${simpleResult.text}</div>`;
                }
              }
              
              translatedChunk = rebuiltChunk;
              console.log(`✅ 强制简化翻译成功: ${chunk.length} -> ${translatedChunk.length} 字符`);
              consecutiveFailures = 0;
            } else {
              console.log(`❌ 强制简化翻译也失败: ${simpleResult.error}`);
            }
          }
        } catch (forceError) {
          console.error(`❌ 强制简化翻译异常:`, forceError.message);
        }
      }
      
      // 最后的降级策略：部分翻译保留
      if (translatedChunk) {
        translatedChunks.push(translatedChunk);
      } else {
        // 记录失败的块，但尝试进行最基础的处理
        console.error(`⚠️ 第${i + 1}块所有翻译策略都失败，尝试最后的保护措施`);
        failedChunks.push(i + 1);
        
        // 尝试进行单词级翻译
        try {
          const words = chunk.split(/\s+/);
          const translatedWords = [];
          
          for (const word of words) {
            if (word.length > 3 && !/^<.*>$/.test(word)) {
              try {
                const wordResult = await translateWithSimplePrompt(word, targetLang);
                if (wordResult.success) {
                  translatedWords.push(wordResult.text);
                } else {
                  translatedWords.push(word);
                }
              } catch {
                translatedWords.push(word);
              }
            } else {
              translatedWords.push(word);
            }
          }
          
          const wordTranslated = translatedWords.join(' ');
          translatedChunks.push(wordTranslated);
          console.log(`⚪ 使用单词级翻译作为最后手段: ${chunk.length} -> ${wordTranslated.length} 字符`);
        } catch {
          // 实在不行就保留原文，但标记为失败
          translatedChunks.push(chunk);
          console.log(`🔴 第${i + 1}块完全无法翻译，保留原文`);
        }
        
        consecutiveFailures++;
        
        // 如果连续失败太多次，考虑中止
        if (consecutiveFailures >= 3) {
          console.warn('连续失败过多，将使用备用翻译策略');
          // 对剩余的块使用更简单的翻译策略
          for (let j = i + 1; j < chunks.length; j++) {
            const remainingChunk = chunks[j];
            const cleanContent = remainingChunk.replace(/<[^>]*>/g, ' ').trim();
            
            if (cleanContent.length > 10) {
              try {
                const basicResult = await translateWithSimplePrompt(cleanContent, targetLang);
                if (basicResult.success) {
                  translatedChunks.push(`<p>${basicResult.text}</p>`);
                } else {
                  translatedChunks.push(remainingChunk);
                }
              } catch {
                translatedChunks.push(remainingChunk);
              }
            } else {
              translatedChunks.push(remainingChunk);
            }
            failedChunks.push(j + 1);
          }
          break;
        }
      }
      
      // 分块间添加延迟，避免API限流
      if (i < chunks.length - 1) {
        const delay = consecutiveFailures > 0 ? 3000 : 1000;
        console.log(`等待 ${delay}ms 后继续下一块...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // 4. 检查翻译成功率
    const successRate = (chunks.length - failedChunks.length) / chunks.length;
    console.log(`翻译成功率: ${(successRate * 100).toFixed(1)}%`);
    
    // 5. 智能合并翻译结果 - 根据内容类型使用不同策略
    let result;
    
    if (isHtmlContent) {
      // HTML内容无缝合并，避免破坏HTML结构
      result = translatedChunks.join('');
      console.log('HTML内容无缝合并完成');
    } else {
      // 普通文本内容用双换行分隔，保持段落结构
      result = translatedChunks.join('\n\n');
      console.log('文本内容段落合并完成');
    }
    
    // 6. 恢复HTML标签
    if (tagMap.size > 0) {
      result = restoreHtmlTags(result, tagMap);
    }
    
    // 7. 最终质量检查和改进
    console.log(`\n========== 长文本翻译完成 ==========`);
    console.log(`原文长度: ${text.length} 字符`);
    console.log(`译文长度: ${result.length} 字符`);
    console.log(`总块数: ${chunks.length}`);
    console.log(`成功块数: ${chunks.length - failedChunks.length}`);
    console.log(`成功率: ${(successRate * 100).toFixed(1)}%`);
    if (failedChunks.length > 0) {
      console.warn(`失败块: ${failedChunks.join(', ')}`);
    }
    
    // 8. 对于成功率较低的结果，尝试后处理改进
    if (successRate < 0.8 && result.length > text.length * 0.3) {
      console.log(`🔧 成功率较低(${(successRate * 100).toFixed(1)}%)，尝试后处理改进...`);
      
      // 检查是否有明显的英文残留并尝试翻译
      const englishParts = result.match(/[a-zA-Z\s,\.\-!?]{20,}/g) || [];
      if (englishParts.length > 0) {
        console.log(`发现 ${englishParts.length} 处英文残留，尝试补充翻译`);
        
        for (const englishPart of englishParts.slice(0, 3)) { // 只处理前3个，避免过度处理
          try {
            const partResult = await translateWithSimplePrompt(englishPart.trim(), targetLang);
            if (partResult.success) {
              result = result.replace(englishPart, partResult.text);
              console.log(`✅ 英文残留已翻译: "${englishPart.substring(0, 30)}..." -> "${partResult.text.substring(0, 30)}..."`);
            }
          } catch (partError) {
            console.log(`❌ 英文残留翻译失败: ${partError.message}`);
          }
        }
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('长文本翻译失败:', error);
    return text; // 失败时返回原文
  }
}

/**
 * 批量翻译文本
 * @param {Array<string>} texts - 待翻译文本数组
 * @param {string} targetLang - 目标语言代码
 * @returns {Promise<Array<string>>} 翻译结果数组
 */
export async function batchTranslateTexts(texts, targetLang) {
  const translations = [];
  
  // 逐个翻译，添加适当延迟避免API限流
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    
    try {
      const translation = await translateText(text, targetLang);
      translations.push(translation);
      
      // 添加延迟，避免API限流（除了最后一个请求）
      if (i < texts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.translation.delayMs));
      }
      
    } catch (error) {
      console.error(`批量翻译第${i + 1}项失败:`, error);
      // 翻译失败时保留原文
      translations.push(text);
    }
  }
  
  return translations;
}

/**
 * 翻译资源对象
 * @param {Object} resource - 资源对象
 * @param {string} targetLang - 目标语言代码
 * @returns {Promise<Object>} 翻译后的资源对象
 */
/**
 * 检查关键字段的翻译完整性，特别是SEO字段
 * @param {string} fieldName - 字段名称
 * @param {string} originalText - 原始文本
 * @param {string} translatedText - 翻译后的文本
 * @param {string} targetLang - 目标语言
 * @returns {Object} 检查结果和改进后的翻译
 */
async function validateCriticalFieldTranslation(fieldName, originalText, translatedText, targetLang) {
  if (!originalText || !translatedText) {
    return { isValid: false, improvedTranslation: translatedText, issues: ['内容为空'] };
  }

  const issues = [];
  let improvedTranslation = translatedText;

  // 特别关注SEO字段
  const isSEOField = fieldName.toLowerCase().includes('seo') || 
                   fieldName.toLowerCase().includes('meta') ||
                   fieldName.toLowerCase().includes('title') ||
                   fieldName.toLowerCase().includes('description');

  console.log(`🔍 检查关键字段翻译 - 字段: ${fieldName}, 是否SEO字段: ${isSEOField}`);
  console.log(`原始文本: "${originalText}"`);
  console.log(`翻译文本: "${translatedText}"`);

  try {
    // 1. 基本质量检查
    const qualityCheck = await validateTranslationCompleteness(originalText, translatedText, targetLang);
    if (!qualityCheck.isComplete) {
      issues.push(`质量检查失败: ${qualityCheck.reason}`);
      console.log(`❌ 字段 ${fieldName} 质量检查失败:`, qualityCheck.reason);
      
      // 对于关键字段，如果翻译质量不佳，尝试重新翻译
      if (isSEOField) {
        console.log(`🔄 SEO字段翻译质量不佳，尝试重新翻译...`);
        try {
          // 使用简化提示重新翻译
          let retryResult;
          // 对于标题字段，使用专门的标题翻译策略
          if (fieldName.toLowerCase() === 'title') {
            console.log(`🏷️ 检测到标题字段，使用增强标题翻译策略`);
            retryResult = await translateTitleWithEnhancedPrompt(originalText, targetLang);
          } else {
            retryResult = await translateWithSimplePrompt(originalText, targetLang);
          }
          if (retryResult.success) {
            improvedTranslation = retryResult.text; // 正确提取文本内容
            console.log(`✅ SEO字段重新翻译完成: "${improvedTranslation}"`);
            
            // 再次验证改进后的翻译
            const recheck = await validateTranslationCompleteness(originalText, improvedTranslation, targetLang);
            if (recheck.isComplete) {
              console.log(`✅ SEO字段重新翻译验证通过`);
              issues.length = 0; // 清空之前的问题
              issues.push('已使用简化提示重新翻译');
            } else {
              console.log(`⚠️ SEO字段重新翻译仍不完整，保留原翻译`);
              improvedTranslation = translatedText; // 回退到原翻译
            }
          } else {
            console.log(`❌ SEO字段重新翻译失败，保留原翻译: ${retryResult.error}`);
            improvedTranslation = translatedText; // 回退到原翻译
            issues.push(`重新翻译失败: ${retryResult.error}`);
          }
        } catch (retryError) {
          console.error(`❌ SEO字段重新翻译失败:`, retryError);
          issues.push(`重新翻译失败: ${retryError.message}`);
        }
      }
    } else {
      console.log(`✅ 字段 ${fieldName} 质量检查通过`);
    }

    // 2. SEO字段特殊检查 - 调整长度限制，考虑中文字符密度更高
    if (isSEOField) {
      // 调整SEO字段长度限制：中文内容密度更高，适当放宽限制
      if (fieldName.toLowerCase().includes('title') && translatedText.length > 80) {
        issues.push('SEO标题较长，建议控制在80字符以内（中文约40字）');
      }
      
      if (fieldName.toLowerCase().includes('description') && translatedText.length > 200) {
        issues.push('SEO描述较长，建议控制在200字符以内（中文约100字）');
      }

      // 检查是否保留了关键信息（仅作为提醒，不影响翻译通过）
      const hasKeywords = checkKeywordPreservation(originalText, improvedTranslation);
      if (!hasKeywords) {
        // 降级为警告，不影响整体验证结果
        console.log(`⚠️ SEO字段 ${fieldName} 可能丢失了关键词信息，但不影响翻译通过`);
      }
    }

    // 3. 检查HTML结构保持（如果原文包含HTML）
    if (originalText.includes('<') && originalText.includes('>')) {
      const htmlIntact = checkHtmlStructureIntegrity(originalText, improvedTranslation);
      if (!htmlIntact) {
        issues.push('HTML结构可能被破坏');
      }
    }

    // 更宽松的验证判断：只有严重问题才认为无效
    const hasCriticalIssues = issues.some(issue => 
      issue.includes('内容为空') || 
      issue.includes('重新翻译失败') ||
      issue.includes('HTML结构可能被破坏')
    );
    
    const isValid = !hasCriticalIssues || issues.some(issue => issue.includes('已使用简化提示重新翻译'));
    
    return {
      isValid,
      improvedTranslation,
      issues,
      fieldName,
      originalLength: originalText.length,
      translatedLength: improvedTranslation.length
    };

  } catch (error) {
    console.error(`❌ 关键字段翻译检查失败 - 字段: ${fieldName}`, error);
    return {
      isValid: false,
      improvedTranslation: translatedText,
      issues: [`检查过程出错: ${error.message}`],
      fieldName
    };
  }
}

/**
 * 检查关键词是否得到保留
 * @param {string} original - 原文
 * @param {string} translated - 译文
 * @returns {boolean} 是否保留了关键信息
 */
function checkKeywordPreservation(original, translated) {
  // 检查数字、品牌名、专有名词是否保留
  const numberPattern = /\d+/g;
  const originalNumbers = (original.match(numberPattern) || []).length;
  const translatedNumbers = (translated.match(numberPattern) || []).length;
  
  // 数字应该大致保持一致
  return Math.abs(originalNumbers - translatedNumbers) <= 1;
}

/**
 * 检查HTML结构完整性
 * @param {string} original - 原文
 * @param {string} translated - 译文
 * @returns {boolean} HTML结构是否完整
 */
function checkHtmlStructureIntegrity(original, translated) {
  try {
    // 简单检查：标签数量应该大致相等
    const originalTags = (original.match(/<[^>]+>/g) || []).length;
    const translatedTags = (translated.match(/<[^>]+>/g) || []).length;
    
    return Math.abs(originalTags - translatedTags) <= 2; // 允许少量差异
  } catch (error) {
    console.warn('HTML结构检查失败:', error);
    return true; // 检查失败时默认认为正常
  }
}

/**
 * 判断是否为Theme资源
 * @param {string} resourceType - 资源类型
 * @returns {boolean} 是否为Theme资源
 */
function isThemeResource(resourceType) {
  if (!resourceType) return false;
  const type = resourceType.toUpperCase();
  return type.startsWith('ONLINE_STORE_THEME');
}

export async function translateResource(resource, targetLang) {
  // 检查是否为Theme资源，如果是则使用独立的Theme翻译逻辑
  if (isThemeResource(resource.resourceType)) {
    console.log(`[翻译服务] 检测到Theme资源，使用专用翻译逻辑: ${resource.resourceType}`);
    const { translateThemeResource } = await import('./theme-translation.server.js');
    return translateThemeResource(resource, targetLang);
  }
  
  // 以下是原有的非Theme资源翻译逻辑
  const translated = {
    titleTrans: null,
    descTrans: null,
    handleTrans: null,
    summaryTrans: null,
    labelTrans: null,
    seoTitleTrans: null,
    seoDescTrans: null,
  };

  const translationValidations = []; // 记录所有字段的验证结果

  // 翻译标题（关键字段）
  if (resource.title) {
    // 对于标题字段，使用专门的标题翻译策略
    console.log(`🏷️ 检测到标题字段，使用增强标题翻译策略: "${resource.title}"`);
    const titleResult = await translateTitleWithEnhancedPrompt(resource.title, targetLang);
    
    if (titleResult.success) {
      translated.titleTrans = titleResult.text;
      console.log(`✅ 标题翻译成功: "${resource.title}" -> "${titleResult.text}"`);
    } else {
      console.log(`⚠️ 增强标题翻译失败，尝试普通翻译: ${titleResult.error}`);
      translated.titleTrans = await translateText(resource.title, targetLang);
    }
    
    // 对标题进行关键字段检查
    const titleValidation = await validateCriticalFieldTranslation(
      'title', 
      resource.title, 
      translated.titleTrans, 
      targetLang
    );
    translated.titleTrans = titleValidation.improvedTranslation;
    translationValidations.push(titleValidation);
    
    // 后处理标题翻译，清理英文残留
    translated.titleTrans = await postProcessTranslation(
      translated.titleTrans, 
      targetLang, 
      resource.title
    );
  }

  // 翻译描述（根据资源类型选择正确的内容字段）
  let descriptionToTranslate = null;
  let descriptionSource = '';
  
  if (resource.resourceType === 'page') {
    // 对于页面资源，使用description字段（可能来自content或body字段，包含HTML内容）
    descriptionToTranslate = resource.description || resource.descriptionHtml;
    descriptionSource = resource.description ? 'description (来自Page.content或body字段)' : 'descriptionHtml (来自Page.content或body字段)';
  } else {
    // 对于其他资源类型（产品、集合等），优先使用富文本内容
    descriptionToTranslate = resource.descriptionHtml || resource.description;
    descriptionSource = resource.descriptionHtml ? 'descriptionHtml (富文本)' : 'description (纯文本)';
  }
  
  if (descriptionToTranslate) {
    translated.descTrans = await translateText(descriptionToTranslate, targetLang);
    console.log(`翻译描述使用字段: ${descriptionSource}`);
    console.log(`原始内容长度: ${descriptionToTranslate.length}字符`);
    
    // 对描述进行关键字段检查
    const descValidation = await validateCriticalFieldTranslation(
      'description', 
      descriptionToTranslate, 
      translated.descTrans, 
      targetLang
    );
    translated.descTrans = descValidation.improvedTranslation;
    translationValidations.push(descValidation);
    
    // 后处理描述翻译，这是最重要的内容清理
    console.log(`🔧 开始描述内容后处理...`);
    translated.descTrans = await postProcessTranslation(
      translated.descTrans, 
      targetLang, 
      descriptionToTranslate
    );
    console.log(`✅ 描述内容后处理完成`);
  }

  // 翻译URL handle
  if (resource.handle) {
    translated.handleTrans = await translateUrlHandle(resource.handle, targetLang);
    console.log(`翻译URL handle: "${resource.handle}" -> "${translated.handleTrans}"`);
  }

  // 翻译摘要（主要用于文章）
  if (resource.summary) {
    translated.summaryTrans = await translateText(resource.summary, targetLang);
    console.log(`翻译摘要: "${resource.summary}" -> "${translated.summaryTrans}"`);
    
    // 后处理摘要翻译
    translated.summaryTrans = await postProcessTranslation(
      translated.summaryTrans, 
      targetLang, 
      resource.summary
    );
  }

  // 翻译标签（主要用于过滤器）
  if (resource.label) {
    translated.labelTrans = await translateText(resource.label, targetLang);
    console.log(`翻译标签: "${resource.label}" -> "${translated.labelTrans}"`);
    
    // 后处理标签翻译
    translated.labelTrans = await postProcessTranslation(
      translated.labelTrans, 
      targetLang, 
      resource.label
    );
  }

  // 翻译SEO标题（关键字段，需要特别关注）
  if (resource.seoTitle) {
    // 对于SEO标题字段，也使用专门的标题翻译策略
    console.log(`🏷️ 检测到SEO标题字段，使用增强标题翻译策略: "${resource.seoTitle}"`);
    const seoTitleResult = await translateTitleWithEnhancedPrompt(resource.seoTitle, targetLang);
    
    if (seoTitleResult.success) {
      translated.seoTitleTrans = seoTitleResult.text;
      console.log(`✅ SEO标题翻译成功: "${resource.seoTitle}" -> "${seoTitleResult.text}"`);
    } else {
      console.log(`⚠️ 增强SEO标题翻译失败，尝试普通翻译: ${seoTitleResult.error}`);
      translated.seoTitleTrans = await translateText(resource.seoTitle, targetLang);
    }
    
    // 对SEO标题进行严格检查
    const seoTitleValidation = await validateCriticalFieldTranslation(
      'seo_title', 
      resource.seoTitle, 
      translated.seoTitleTrans, 
      targetLang
    );
    translated.seoTitleTrans = seoTitleValidation.improvedTranslation;
    translationValidations.push(seoTitleValidation);
    
    // 后处理SEO标题翻译
    translated.seoTitleTrans = await postProcessTranslation(
      translated.seoTitleTrans, 
      targetLang, 
      resource.seoTitle
    );
    
    console.log(`✅ SEO标题翻译完成: "${resource.seoTitle}" -> "${translated.seoTitleTrans}"`);
  }

  // 翻译SEO描述（关键字段，用户重点关注的Meta_description）
  if (resource.seoDescription) {
    // 对于SEO描述字段，使用专门的增强翻译策略
    console.log(`🏷️ 检测到SEO描述字段，使用增强翻译策略: "${resource.seoDescription.substring(0, 50)}..."`);
    
    try {
      // 首先尝试使用增强提示
      const seoDescResult = await translateSEODescription(resource.seoDescription, targetLang);
      
      if (seoDescResult.success) {
        translated.seoDescTrans = seoDescResult.text;
        console.log(`✅ SEO描述翻译成功: "${resource.seoDescription.substring(0, 50)}..." -> "${seoDescResult.text.substring(0, 50)}..."`);
      } else {
        console.log(`⚠️ 增强SEO描述翻译失败，尝试普通翻译: ${seoDescResult.error}`);
        translated.seoDescTrans = await translateText(resource.seoDescription, targetLang);
      }
    } catch (error) {
      console.error('SEO描述翻译出错，使用普通翻译:', error);
      translated.seoDescTrans = await translateText(resource.seoDescription, targetLang);
    }
    
    // 对SEO描述进行严格检查和改进
    const seoDescValidation = await validateCriticalFieldTranslation(
      'seo_description_meta', 
      resource.seoDescription, 
      translated.seoDescTrans, 
      targetLang
    );
    translated.seoDescTrans = seoDescValidation.improvedTranslation;
    translationValidations.push(seoDescValidation);
    
    // 后处理SEO描述翻译
    translated.seoDescTrans = await postProcessTranslation(
      translated.seoDescTrans, 
      targetLang, 
      resource.seoDescription
    );
    
    console.log(`✅ SEO描述翻译完成: "${resource.seoDescription}" -> "${translated.seoDescTrans}"`);
  }

  // 输出关键字段验证总结
  const criticalFields = translationValidations.filter(v => 
    v.fieldName.includes('seo') || v.fieldName.includes('title') || v.fieldName.includes('meta')
  );
  
  if (criticalFields.length > 0) {
    console.log(`\n📊 关键字段翻译质量报告:`);
    criticalFields.forEach(validation => {
      const status = validation.isValid ? '✅' : '⚠️';
      console.log(`${status} ${validation.fieldName}: ${validation.issues.join(', ')}`);
    });
  }
  
  // 最终统计和质量报告
  const totalFields = Object.values(translated).filter(v => v !== null).length;
  const processedFields = Object.keys(translated).filter(key => translated[key] !== null);
  
  console.log(`\n📋 翻译完成统计:`);
  console.log(`- 总字段数: ${totalFields}`);
  console.log(`- 已处理字段: ${processedFields.join(', ')}`);
  console.log(`- 已应用后处理: ${totalFields} 个字段`);

  // 检查是否有关键字段翻译失败
  const hasFailedCriticalFields = criticalFields.some(v => !v.isValid);
  if (hasFailedCriticalFields) {
    console.log(`⚠️ 检测到关键字段翻译质量问题，已应用改进策略`);
  } else if (criticalFields.length > 0) {
    console.log(`✅ 所有关键字段翻译质量良好`);
  }

  return translated;
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

  if (resource.handle) {
    translated.handleTrans = await translateUrlHandle(resource.handle, targetLang);
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
          console.error('解析Theme JSON数据失败:', error);
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