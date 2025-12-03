/**
 * API调用封装工具函数
 * 统一处理翻译API的调用、响应和错误处理
 */

import { config } from './config.server.js';

/**
 * 创建标准API请求头
 * @returns {Object} 请求头对象
 */
export function createAPIHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (config.translation.apiKey) {
    headers.Authorization = `Bearer ${config.translation.apiKey}`;
    headers['api-key'] = config.translation.apiKey;
  }

  return headers;
}

/**
 * 创建翻译请求体
 * @param {string} text - 待翻译文本
 * @param {string} targetLang - 目标语言
 * @param {string} systemPrompt - 系统提示词
 * @param {number} maxTokens - 最大token数
 * @returns {Object} 请求体对象
 */
export function createTranslationRequestBody(text, targetLang, systemPrompt, maxTokens) {
  return {
    model: config.translation.model,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.2,
    max_tokens: Math.max(1, Math.floor(Number(maxTokens) || 2000)), // 确保max_tokens为正整数
    top_p: 0.9,
    frequency_penalty: 0,
    presence_penalty: 0
  };
}

/**
 * 安全解析API响应
 * @param {Response} response - API响应对象
 * @param {Object} context - 请求上下文信息
 * @returns {Promise<Object>} 解析后的响应数据
 * @throws {Error} API响应错误
 */
export async function parseAPIResponse(response, context = {}) {
  const { textLength = 0, targetLang = '', model = '' } = context;

  if (!response.ok) {
    const errorText = await response.text();
    const errorDetails = {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      model,
      textLength,
      targetLang,
      responseBody: errorText.substring(0, 500)
    };
    
    throw new Error(`翻译API调用失败: ${response.status} ${response.statusText} - ${errorText}`, {
      cause: errorDetails
    });
  }

  // 安全地解析 JSON 响应
  let result;
  const responseText = await response.text();
  try {
    result = JSON.parse(responseText);
  } catch (parseError) {
    const parseDetails = {
      error: parseError.message,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 500).replace(/"/g, '\\"'),
      textLength,
      targetLang,
      model
    };
    
    throw new Error(`API响应JSON解析失败: ${parseError.message}`, {
      cause: parseDetails
    });
  }

  return result;
}

/**
 * 从API响应中提取翻译结果
 * @param {Object} apiResult - API响应数据
 * @returns {string} 翻译后的文本
 * @throws {Error} 响应格式错误
 */
export function extractTranslationFromResponse(apiResult) {
  if (!apiResult.choices || !apiResult.choices[0] || !apiResult.choices[0].message) {
    throw new Error('API响应格式异常: 缺少choices或message字段');
  }
  
  return apiResult.choices[0].message.content.trim();
}

/**
 * 计算动态token限制
 * @param {string} text - 输入文本
 * @param {string} targetLang - 目标语言
 * @param {number} minTokens - 最小token数，默认2000
 * @param {number} maxTokens - 最大token数，默认8000
 * @returns {number} 动态计算的token限制
 */
export function estimateTokenCount(text = '', targetLang = '') {
  if (!text) {
    return 0;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 0;
  }

  const cjkPattern = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g;
  const cjkChars = (normalized.match(cjkPattern) || []).length;
  const nonCjkChars = normalized.length - cjkChars;

  const cjkTokens = cjkChars / 1.5;
  const nonCjkTokens = nonCjkChars / 4;
  const localeMultiplier = ['ja', 'ko', 'zh-CN', 'zh-TW'].includes(targetLang) ? 1.2 : 1;

  const estimated = (cjkTokens + nonCjkTokens) * localeMultiplier;
  return Math.max(0, Math.ceil(estimated));
}

export function calculateDynamicTokenLimit(text, targetLang, minTokens = 2000, maxTokens = 8000) {
  // 不同语言的token比率不同，韩语/日语需要更多token
  const tokenMultiplier = ['ja', 'ko', 'zh-CN', 'zh-TW'].includes(targetLang) ? 4 : 2.5;
  // 确保返回整数，避免浮点数问题
  return Math.floor(Math.min(Math.max(text.length * tokenMultiplier, minTokens), maxTokens));
}

/**
 * 统一的翻译API调用函数
 * @param {string} text - 待翻译文本
 * @param {string} targetLang - 目标语言
 * @param {string} systemPrompt - 系统提示词
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 翻译结果 {success, text, error}
 */
export async function makeTranslationAPICall(text, targetLang, systemPrompt, options = {}) {
  const {
    timeout = config.translation.timeout,
    maxTokens = null, // 如果不提供，将动态计算
    retryOnFailure = false,
    context = {}
  } = options;

  // 检查API密钥配置
  if (!config.translation.apiKey) {
    return {
      success: false,
      text: text,
      error: 'API密钥未配置',
      isOriginal: true
    };
  }

  const dynamicMaxTokens = maxTokens || calculateDynamicTokenLimit(text, targetLang);
  const estimatedInputTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(text, targetLang);
  const modelTokenLimit = config.translation.modelTokenLimit ?? 0;
  const safetyMargin = config.translation.tokenSafetyMargin ?? 512;
  const minResponseTokens = config.translation.minResponseTokens ?? 256;

  let safeMaxTokens = dynamicMaxTokens;
  if (modelTokenLimit > 0) {
    const availableForResponse = modelTokenLimit - estimatedInputTokens - safetyMargin;
    if (availableForResponse > 0) {
      safeMaxTokens = Math.min(dynamicMaxTokens, Math.max(minResponseTokens, availableForResponse));
    } else {
      safeMaxTokens = Math.max(minResponseTokens, Math.floor(dynamicMaxTokens * 0.5));
    }
  }

  if (!Number.isFinite(safeMaxTokens) || safeMaxTokens <= 0) {
    safeMaxTokens = minResponseTokens;
  }
  
  // 创建超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const headers = createAPIHeaders();
    const requestBody = createTranslationRequestBody(text, targetLang, systemPrompt, safeMaxTokens);
    
    const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // 解析响应
    const requestContext = {
      textLength: text.length,
      targetLang,
      model: config.translation.model,
      maxTokens: safeMaxTokens,
      ...context
    };
    
    const result = await parseAPIResponse(response, requestContext);
    const translatedText = extractTranslationFromResponse(result);
    
    return {
      success: true,
      text: translatedText,
      isOriginal: false,
      language: targetLang,
      tokenLimit: safeMaxTokens
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    
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
    
    return {
      success: false,
      text: text,
      error: errorMessage,
      isOriginal: true,
      originalError: error
    };
  }
}

/**
 * 带重试机制的翻译API调用
 * @param {string} text - 待翻译文本
 * @param {string} targetLang - 目标语言
 * @param {string} systemPrompt - 系统提示词
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 翻译结果
 */
export async function makeTranslationAPICallWithRetry(text, targetLang, systemPrompt, options = {}) {
  const {
    maxRetries = config.translation.maxRetries,
    retryDelay = 1000,
    useExponentialBackoff = true,
    ...apiOptions
  } = options;
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await makeTranslationAPICall(text, targetLang, systemPrompt, {
      ...apiOptions,
      context: { ...apiOptions.context, attempt: attempt + 1, maxRetries: maxRetries + 1 }
    });
    
    if (result.success) {
      return result;
    }
    
    lastError = result.error;
    
    // 检查是否应该重试（网络错误才重试）
    const shouldRetry = attempt < maxRetries && (
      result.originalError?.name === 'AbortError' ||
      result.originalError?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      result.error.includes('fetch failed') ||
      result.error.includes('超时') ||
      result.error.includes('网络')
    );
    
    if (!shouldRetry) {
      break;
    }
    
    // 计算延迟时间
    const delay = useExponentialBackoff 
      ? Math.min(retryDelay * Math.pow(2, attempt), 10000)
      : retryDelay;
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return {
    success: false,
    text: text,
    error: lastError || '重试次数已耗尽',
    isOriginal: true
  };
}
