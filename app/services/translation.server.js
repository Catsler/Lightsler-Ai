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
export async function translateText(text, targetLang, retryCount = 0) {
  if (!text || !text.trim()) {
    return text;
  }

  // 如果没有配置API密钥，返回原文
  if (!config.translation.apiKey) {
    console.warn('未配置GPT_API_KEY，返回原文');
    return text;
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.translation.apiKey}`,
    };
    
    // 创建超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.translation.timeout);
    
    // 构建翻译提示词
    const systemPrompt = `你是一个专业的翻译助手。请将用户提供的文本翻译成${getLanguageName(targetLang)}。只返回翻译结果，不要添加任何解释或额外内容。`;
    
    try {
      // 调用OpenAI兼容的API
      console.log(`正在调用翻译API: ${config.translation.apiUrl}, 模型: ${config.translation.model}, 超时: ${config.translation.timeout}ms`);
      
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
              content: text.substring(0, 500) + (text.length > 500 ? '...' : '') // 截断长文本避免超时
            }
          ],
          temperature: 0.3,
          max_tokens: 2000,
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

      const result = await response.json();
      
      // 提取翻译结果
      if (result.choices && result.choices[0] && result.choices[0].message) {
        return result.choices[0].message.content.trim();
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
      return translateText(text, targetLang, retryCount + 1);
    }
    
    // 如果是AbortError（超时）
    if (error.name === 'AbortError') {
      console.error('翻译API调用超时，已达到最大重试次数');
      throw new Error('翻译API调用超时，请检查网络连接或稍后重试');
    }
    
    // 网络错误
    if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed')) {
      console.error('网络连接错误，已达到最大重试次数');
      throw new Error('无法连接到翻译服务，请检查网络连接或API配置');
    }
    
    // 如果翻译失败，返回原文
    console.warn(`翻译失败，返回原文: ${error.message}`);
    return text;
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
    seoTitleTrans: null,
    seoDescTrans: null,
  };

  // 翻译标题
  if (resource.title) {
    translated.titleTrans = await translateText(resource.title, targetLang);
  }

  // 翻译描述
  if (resource.description) {
    translated.descTrans = await translateText(resource.description, targetLang);
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