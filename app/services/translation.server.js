/**
 * GPT翻译API服务
 */

import { config } from '../utils/config.server.js';

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
  'shopify', 'apple', 'nike', 'adidas', 'google', 'microsoft', 'samsung',
  'iphone', 'android', 'macbook', 'ipad', 'xbox', 'playstation', 'nintendo',
  'coca-cola', 'pepsi', 'starbucks', 'mcdonalds', 'kfc',
  // 可以根据需要添加更多品牌词
]);

// 语言特定的断句规则
const SEGMENTATION_RULES = {
  'zh-CN': {
    // 中文：按词语单位断句，每段2-4个字
    segmentLength: 3,
    connector: '—',
    wordPattern: /[\u4e00-\u9fff]+/g
  },
  'ja': {
    // 日文：类似中文，但稍短
    segmentLength: 2,
    connector: '—',
    wordPattern: /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]+/g
  },
  'ko': {
    // 韩文：按音节单位
    segmentLength: 2,
    connector: '—',
    wordPattern: /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]+/g
  },
  'default': {
    // 其他语言：按单词单位，每段1-2个单词
    segmentLength: 1,
    connector: '-',
    wordPattern: /\b\w+\b/g
  }
};

// 标准化URL handle格式
function normalizeHandle(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af—-]/g, '') // 保留字母、数字、中日韩文字和连字符
    .replace(/\s+/g, '-') // 空格替换为连字符
    .replace(/—+/g, '-') // 长连字符替换为短连字符
    .replace(/-+/g, '-') // 多个连字符合并为一个
    .replace(/^-|-$/g, ''); // 移除开头和结尾的连字符
}

// 检查是否为品牌词
function isBrandWord(word) {
  return BRAND_WORDS.has(word.toLowerCase());
}

// 智能分词和断句
function intelligentSegmentation(text, targetLang) {
  const rules = SEGMENTATION_RULES[targetLang] || SEGMENTATION_RULES['default'];
  const words = text.match(rules.wordPattern) || [text];
  
  // 按语言规则分组
  const segments = [];
  for (let i = 0; i < words.length; i += rules.segmentLength) {
    const segment = words.slice(i, i + rules.segmentLength).join('');
    if (segment.trim()) {
      segments.push(segment);
    }
  }
  
  return segments.join(rules.connector);
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
    const systemPrompt = `你是一个专业的URL handle翻译助手。请将用户提供的文本翻译成${getLanguageName(targetLang)}，用于生成URL友好的handle。

严格要求：
1. 品牌词和专有名词保持不变（如：Apple、Nike、iPhone等）
2. 翻译要简洁，符合URL命名规范
3. 保持语义准确，适合用作产品或集合的URL标识
4. 只返回翻译结果，不要任何额外说明
5. 结果应该是自然的${getLanguageName(targetLang)}表达

翻译要求：
- 保持专业的商务语调
- 简洁明了，适合URL使用
- 体现原文的核心含义
- 符合目标语言的表达习惯`;
    
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
        
        // 应用智能断句规则
        const segmentedText = intelligentSegmentation(translatedText, targetLang);
        
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
  if (!text || !text.trim()) {
    return {
      success: true,
      text: text,
      isOriginal: true
    };
  }

  // 检查API密钥配置
  if (!config.translation.apiKey) {
    console.warn('未配置GPT_API_KEY，返回原文');
    return {
      success: false,
      text: text,
      error: 'API密钥未配置',
      isOriginal: true
    };
  }

  // 对于长文本，使用智能分块翻译
  if (text.length > config.translation.longTextThreshold) {
    const result = await translateLongTextEnhanced(text, targetLang);
    return result;
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.translation.apiKey}`,
    };
    
    // 创建超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.translation.timeout);
    
    // 构建翻译提示词 - 严格占位符保护
    const systemPrompt = `你是一个专业的电商翻译助手。请将用户提供的文本翻译成${getLanguageName(targetLang)}。

严格要求 - 这非常重要：
1. 绝对不能修改任何以"__PROTECTED_"开头和"__"结尾的字符串
2. 必须完全保持原始占位符的准确形式，包括数字
3. 例如：__PROTECTED_IMG_2__ 必须保持为 __PROTECTED_IMG_2__
4. 不能改为 __PROTECTED_IMG_X__ 或其他形式
5. 这些占位符代表图片、视频等媒体内容

翻译要求：
- 只翻译实际的文本内容
- 保持段落和换行结构
- 翻译要自然流畅，符合${getLanguageName(targetLang)}表达习惯
- 保持专业的商务语调
- 只返回翻译结果`;
    
    // 动态计算max_tokens，确保有足够空间输出完整翻译
    // 不同语言的token比率不同，韩语/日语需要更多token
    const tokenMultiplier = ['ja', 'ko', 'zh-CN', 'zh-TW'].includes(targetLang) ? 3 : 2;
    const dynamicMaxTokens = Math.min(Math.max(text.length * tokenMultiplier, 1500), 4000);
    
    try {
      console.log(`正在翻译文本: ${text.length}字符 -> ${getLanguageName(targetLang)}, max_tokens: ${dynamicMaxTokens}`);
      
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
              content: text // 发送完整文本
            }
          ],
          temperature: 0.3,
          max_tokens: dynamicMaxTokens,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`翻译API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // 安全地解析 JSON 响应
      let result;
      const responseText = await response.text();
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError.message);
        console.error('响应内容前1000字符:', responseText.substring(0, 1000));
        throw new Error(`API响应JSON解析失败: ${parseError.message}`);
      }
      
      // 提取翻译结果
      if (result.choices && result.choices[0] && result.choices[0].message) {
        const translatedText = result.choices[0].message.content.trim();
        
        // 验证翻译完整性
        if (translatedText.length < text.length * 0.3) {
          console.warn(`翻译结果可能不完整，原文${text.length}字符，译文仅${translatedText.length}字符`);
          return {
            success: false,
            text: text,
            error: '翻译结果不完整，长度异常短',
            isOriginal: true
          };
        }
        
        // 检查是否在句子中间被截断
        const lastChar = translatedText[translatedText.length - 1];
        const isCompleteSentence = ['.', '!', '?', '。', '！', '？', '"', '"', ')', '）'].includes(lastChar);
        if (!isCompleteSentence && text.length > 100) {
          console.warn('翻译可能被截断，未以完整句子结尾');
        }
        
        // 检查是否真的被翻译了（简单检查）
        const isTranslated = await validateTranslation(text, translatedText, targetLang);
        
        return {
          success: true,
          text: translatedText,
          isOriginal: !isTranslated,
          language: targetLang
        };
      }
      
      throw new Error('API响应格式异常');
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
    
  } catch (error) {
    console.error(`翻译服务错误 (尝试 ${retryCount + 1}/${config.translation.maxRetries}):`, error);
    
    // 如果是网络错误且还有重试次数，进行重试
    if ((error.name === 'AbortError' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed')) && retryCount < config.translation.maxRetries - 1) {
      console.log(`翻译失败，${2000 * (retryCount + 1)}ms后进行第${retryCount + 2}次尝试...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1))); // 递增延迟
      return translateTextEnhanced(text, targetLang, retryCount + 1);
    }
    
    // 根据错误类型返回不同的错误信息
    let errorMessage = '未知翻译错误';
    if (error.name === 'AbortError') {
      errorMessage = '翻译API调用超时，请检查网络连接或稍后重试';
    } else if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed')) {
      errorMessage = '无法连接到翻译服务，请检查网络连接或API配置';
    } else if (error.message.includes('401') || error.message.includes('403')) {
      errorMessage = 'API密钥无效或权限不足';
    } else if (error.message.includes('429')) {
      errorMessage = 'API调用频率限制，请稍后重试';
    } else if (error.message.includes('500')) {
      errorMessage = '翻译服务内部错误，请稍后重试';
    } else {
      errorMessage = error.message;
    }
    
    console.warn(`翻译失败，返回原文: ${errorMessage}`);
    return {
      success: false,
      text: text,
      error: errorMessage,
      isOriginal: true
    };
  }
}

/**
 * 验证翻译结果是否真的被翻译了
 * @param {string} originalText - 原始文本
 * @param {string} translatedText - 翻译后的文本
 * @param {string} targetLang - 目标语言
 * @returns {Promise<boolean>}
 */
async function validateTranslation(originalText, translatedText, targetLang) {
  // 如果翻译结果与原文完全相同，认为未翻译
  if (originalText.trim() === translatedText.trim()) {
    return false;
  }
  
  // 如果翻译结果过短，可能有问题
  if (translatedText.length < originalText.length * 0.5) {
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
      if (value && value.trim()) {
        translationStats.fieldsTranslated++;
        translationStats.translatedCharacters += value.length;
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
    
    const translatedText = Object.values(translations).filter(Boolean).join(' ');
    
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
          acc[key] = {
            length: translations[key].length,
            preview: translations[key].substring(0, 100) + (translations[key].length > 100 ? '...' : '')
          };
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
      const sentenceRegex = /([^.!?。！？]+[.!?。！？]+)/g;
      const sentences = paragraph.match(sentenceRegex) || [paragraph];
      
      console.log(`长段落分割为 ${sentences.length} 个句子`);
      
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;
        
        // 如果单个句子都超过限制，强制分割
        if (trimmedSentence.length > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            console.log(`保存块 ${chunks.length}: ${currentChunk.length} 字符`);
          }
          
          // 按固定长度强制分割超长句子
          for (let i = 0; i < trimmedSentence.length; i += maxChunkSize) {
            const subChunk = trimmedSentence.substring(i, Math.min(i + maxChunkSize, trimmedSentence.length));
            chunks.push(subChunk);
            console.log(`保存强制分割块 ${chunks.length}: ${subChunk.length} 字符`);
          }
          currentChunk = '';
          continue;
        }
        
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
  }
  
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
async function translateLongText(text, targetLang) {
  console.log(`开始长文本翻译: ${text.length} 字符 -> ${getLanguageName(targetLang)}`);
  
  try {
    // 1. 保护HTML标签
    const { text: protectedText, tagMap } = protectHtmlTags(text);
    
    // 2. 智能分块
    const chunks = chunkText(protectedText, config.translation.maxChunkSize);
    console.log(`文本已分割为 ${chunks.length} 个块，每块最大 ${config.translation.maxChunkSize} 字符`);
    
    // 3. 翻译各个分块
    const translatedChunks = [];
    const failedChunks = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n========== 翻译第 ${i + 1}/${chunks.length} 块 ==========`);
      console.log(`块内容预览: ${chunk.substring(0, 100)}...`);
      console.log(`块长度: ${chunk.length} 字符`);
      
      let translatedChunk = null;
      let retryCount = 0;
      const maxRetries = 2; // 每个块最多重试2次
      
      while (retryCount <= maxRetries && !translatedChunk) {
        try {
          // 使用增强版翻译函数获取详细状态
          const result = await translateTextEnhanced(chunk, targetLang, 0);
          
          if (result.success && !result.isOriginal) {
            translatedChunk = result.text;
            console.log(`✅ 第${i + 1}块翻译成功`);
            console.log(`译文预览: ${translatedChunk.substring(0, 100)}...`);
          } else {
            throw new Error(result.error || '翻译失败，返回了原文');
          }
          
        } catch (error) {
          retryCount++;
          console.error(`❌ 第${i + 1}块翻译失败 (尝试 ${retryCount}/${maxRetries + 1}):`, error.message);
          
          if (retryCount <= maxRetries) {
            console.log(`等待 ${retryCount * 2} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
          }
        }
      }
      
      if (translatedChunk) {
        translatedChunks.push(translatedChunk);
      } else {
        // 记录失败的块
        console.error(`⚠️ 第${i + 1}块翻译最终失败，保留原文`);
        failedChunks.push(i + 1);
        translatedChunks.push(chunk);
      }
      
      // 分块间添加延迟，避免API限流
      if (i < chunks.length - 1) {
        const delay = config.translation.delayMs || 1000;
        console.log(`等待 ${delay}ms 后继续下一块...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // 4. 合并翻译结果
    let result = translatedChunks.join('\n\n');
    
    // 5. 恢复HTML标签
    if (tagMap.size > 0) {
      result = restoreHtmlTags(result, tagMap);
    }
    
    // 6. 翻译结果统计
    console.log(`\n========== 长文本翻译完成 ==========`);
    console.log(`原文长度: ${text.length} 字符`);
    console.log(`译文长度: ${result.length} 字符`);
    console.log(`总块数: ${chunks.length}`);
    console.log(`成功块数: ${chunks.length - failedChunks.length}`);
    if (failedChunks.length > 0) {
      console.warn(`失败块: ${failedChunks.join(', ')}`);
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
export async function translateResource(resource, targetLang) {
  const translated = {
    titleTrans: null,
    descTrans: null,
    handleTrans: null,
    summaryTrans: null,
    labelTrans: null,
    seoTitleTrans: null,
    seoDescTrans: null,
  };

  // 翻译标题
  if (resource.title) {
    translated.titleTrans = await translateText(resource.title, targetLang);
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
  }

  // 翻译标签（主要用于过滤器）
  if (resource.label) {
    translated.labelTrans = await translateText(resource.label, targetLang);
    console.log(`翻译标签: "${resource.label}" -> "${translated.labelTrans}"`);
  }

  // 翻译SEO标题
  if (resource.seoTitle) {
    translated.seoTitleTrans = await translateText(resource.seoTitle, targetLang);
  }

  // 翻译SEO描述
  if (resource.seoDescription) {
    translated.seoDescTrans = await translateText(resource.seoDescription, targetLang);
  }

  return translated;
}