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

  // 对于长文本，使用智能分块翻译
  if (text.length > config.translation.longTextThreshold) {
    return await translateLongText(text, targetLang);
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
    const dynamicMaxTokens = Math.min(Math.max(text.length * 2, 1000), 4000);
    
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
              content: text // 移除截断！发送完整文本
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

      const result = await response.json();
      
      // 提取翻译结果
      if (result.choices && result.choices[0] && result.choices[0].message) {
        const translatedText = result.choices[0].message.content.trim();
        
        // 验证翻译完整性
        if (translatedText.length < text.length * 0.3) {
          console.warn('翻译结果可能不完整，长度异常短');
        }
        
        return translatedText;
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
 * 智能文本分块函数
 * @param {string} text - 待分块的文本
 * @param {number} maxChunkSize - 最大分块大小
 * @returns {Array<string>} 分块后的文本数组
 */
function chunkText(text, maxChunkSize = 1500) {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let currentChunk = '';
  
  // 按段落分割（保持语义完整性）
  const paragraphs = text.split(/\n\s*\n|\r\n\s*\r\n/);
  
  for (const paragraph of paragraphs) {
    // 如果单个段落就超过限制，需要按句子分割
    if (paragraph.length > maxChunkSize) {
      // 如果当前chunk不为空，先保存
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // 按句子分割长段落
      const sentences = paragraph.split(/[.!?。！？]+/);
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;
        
        const sentenceWithPunct = trimmedSentence + (sentence !== sentences[sentences.length - 1] ? '.' : '');
        
        if (currentChunk.length + sentenceWithPunct.length > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentenceWithPunct;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentenceWithPunct;
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
  
  // 5. 保护关键的样式化div（只保护明显的布局容器）
  const importantDivRegex = /<div[^>]*\s(class|style)=[^>]*>.*?<\/div>/gis;
  const divMatches = protectedText.match(importantDivRegex);
  if (divMatches) {
    // 只保护不包含占位符的div（避免嵌套）
    const cleanDivs = divMatches.filter(div => !div.includes('__PROTECTED_'));
    cleanDivs.forEach(div => {
      const placeholder = `__PROTECTED_DIV_${counter}__`;
      protectionMap.set(placeholder, div);
      protectedText = protectedText.replace(div, placeholder);
      console.log(`保护div容器: ${placeholder}`);
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
    console.log(`文本已分割为 ${chunks.length} 个块`);
    
    // 3. 翻译各个分块
    const translatedChunks = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`翻译第 ${i + 1}/${chunks.length} 块: ${chunk.length} 字符`);
      
      try {
        // 为长文本翻译添加上下文提示
        const contextPrompt = chunks.length > 1 
          ? `\n\n注意：这是长文本的第${i + 1}部分（共${chunks.length}部分），请保持翻译的一致性和连贯性。`
          : '';
        
        const translatedChunk = await translateText(chunk + contextPrompt, targetLang);
        
        // 移除可能被翻译的上下文提示
        const cleanedChunk = translatedChunk.replace(/\n\n注意[：:].*?一致性和连贯性[。.]/, '').trim();
        translatedChunks.push(cleanedChunk);
        
        // 分块间添加延迟，避免API限流
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, config.translation.delayMs || 1000));
        }
        
      } catch (error) {
        console.error(`翻译第${i + 1}块失败:`, error);
        // 如果某块翻译失败，保留原文
        translatedChunks.push(chunk);
      }
    }
    
    // 4. 合并翻译结果
    let result = translatedChunks.join('\n\n');
    
    // 5. 恢复HTML标签
    if (tagMap.size > 0) {
      result = restoreHtmlTags(result, tagMap);
    }
    
    console.log(`长文本翻译完成: ${result.length} 字符`);
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
    seoTitleTrans: null,
    seoDescTrans: null,
  };

  // 翻译标题
  if (resource.title) {
    translated.titleTrans = await translateText(resource.title, targetLang);
  }

  // 翻译描述（优先使用富文本内容）
  const descriptionToTranslate = resource.descriptionHtml || resource.description;
  if (descriptionToTranslate) {
    translated.descTrans = await translateText(descriptionToTranslate, targetLang);
    console.log(`翻译描述使用字段: ${resource.descriptionHtml ? 'descriptionHtml (富文本)' : 'description (纯文本)'}`);
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