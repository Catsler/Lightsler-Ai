/**
 * 增强的翻译处理服务
 * 解决二次翻译后仍有未翻译内容的问题
 */

import { translateText, isBrandWord } from './translation.server.js';
import { logger } from '../utils/logger.server.js';

/**
 * 三次翻译机制 - 彻底处理未翻译的内容
 */
export async function performTripleTranslation(text, targetLang, maxIterations = 3) {
  logger.info(`Starting triple translation mechanism, target language: ${targetLang}`);
  
  let currentText = text;
  let iteration = 0;
  const translationHistory = [];
  
  while (iteration < maxIterations) {
    iteration++;
    logger.info(`Translation iteration ${iteration} detection`);
    
    // 检测未翻译的内容
    const untranslatedParts = detectUntranslatedContent(currentText, targetLang);
    
    if (untranslatedParts.length === 0) {
      logger.info(`Iteration ${iteration} detection: no untranslated content found`);
      break;
    }
    
    logger.warn(`Iteration ${iteration} detection: found ${untranslatedParts.length} untranslated parts`);
    
    // 记录本轮翻译前的状态
    translationHistory.push({
      iteration,
      untranslatedCount: untranslatedParts.length,
      samples: untranslatedParts.slice(0, 3)
    });
    
    // 执行翻译
    currentText = await translateUntranslatedParts(currentText, untranslatedParts, targetLang);
    
    // 检查是否有改进
    const newUntranslatedParts = detectUntranslatedContent(currentText, targetLang);
    if (newUntranslatedParts.length >= untranslatedParts.length) {
      logger.warn(`Iteration ${iteration} translation shows no improvement, stopping`);
      
      // 尝试最后的强力翻译
      if (iteration === maxIterations - 1) {
        logger.info(`Executing final force translation...`);
        currentText = await performAggressiveTranslation(currentText, targetLang, newUntranslatedParts);
      }
      break;
    }
    
    logger.info(`Iteration ${iteration} translation improvement: ${untranslatedParts.length} -> ${newUntranslatedParts.length}`);
  }
  
  // 最终统计
  const finalStats = getFinalTranslationStats(currentText, targetLang);
  logger.info(`Triple translation final stats - Iterations: ${iteration}, Chinese ratio: ${finalStats.chineseRatio.toFixed(1)}%, English ratio: ${finalStats.englishRatio.toFixed(1)}%, Remaining untranslated: ${finalStats.remainingEnglish.length}`);
  
  return {
    translatedText: currentText,
    history: translationHistory,
    stats: finalStats,
    iterations: iteration
  };
}

/**
 * 增强的未翻译内容检测
 */
function detectUntranslatedContent(text, targetLang) {
  if (!targetLang.startsWith('zh')) {
    return [];
  }
  
  const untranslatedParts = [];
  const seenParts = new Set();
  
  // 扩展的检测模式列表
  const detectionPatterns = [
    // 1. 基础英文句子和短语
    {
      pattern: /\b[A-Z][a-zA-Z\s,\.\-!?']{10,}[\.\!?]?/g,
      type: 'sentence',
      minLength: 10
    },
    
    // 2. 技术描述短语
    {
      pattern: /\b(?:with|and|for|from|to|in|on|at|by)\s+[a-zA-Z\s,]+\b/gi,
      type: 'phrase',
      minLength: 8
    },
    
    // 3. 产品特征描述
    {
      pattern: /\b(?:Features?|Includes?|Contains?|Offers?|Provides?|Designed|Made|Built|Created)\s+[a-zA-Z\s,\.]+/gi,
      type: 'feature',
      minLength: 10
    },
    
    // 4. 列表项内容
    {
      pattern: /<li[^>]*>([^<]*[a-zA-Z]{3,}[^<]*)<\/li>/gi,
      type: 'list_item',
      extractGroup: 1
    },
    
    // 5. 标题和副标题
    {
      pattern: /<h[1-6][^>]*>([^<]*[a-zA-Z]{3,}[^<]*)<\/h[1-6]>/gi,
      type: 'heading',
      extractGroup: 1
    },
    
    // 6. 段落中的独立英文
    {
      pattern: /<p[^>]*>([^<]*[a-zA-Z]{5,}[^<]*)<\/p>/gi,
      type: 'paragraph',
      extractGroup: 1
    },
    
    // 7. 括号内的英文说明
    {
      pattern: /[\(（]([a-zA-Z\s,]+)[\)）]/g,
      type: 'parenthesis',
      extractGroup: 1
    },
    
    // 8. 未翻译的动词短语
    {
      pattern: /\b(?:can|will|should|must|may|might|could|would)\s+[a-zA-Z]+(?:\s+[a-zA-Z]+){0,3}\b/gi,
      type: 'verb_phrase',
      minLength: 8
    },
    
    // 9. 数字+英文单位/描述
    {
      pattern: /\d+\s*(?:inches?|feet|meters?|kg|lbs?|pounds?|ounces?|gallons?|liters?|years?|months?|days?|hours?|minutes?)\b/gi,
      type: 'measurement',
      minLength: 5
    },
    
    // 10. 连续的大写英文词（可能是缩写或强调）
    {
      pattern: /\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/g,
      type: 'uppercase',
      minLength: 4
    }
  ];
  
  // 执行检测
  for (const { pattern, type, minLength = 5, extractGroup } of detectionPatterns) {
    const matches = [...text.matchAll(pattern)];
    
    for (const match of matches) {
      let content = extractGroup ? match[extractGroup] : match[0];
      content = content.trim();
      
      // 清理和验证
      if (content.length < minLength) continue;
      if (content.includes('__PROTECTED_')) continue;
      if (isBrandWord(content.toLowerCase())) continue;
      if (/^https?:\/\//.test(content)) continue;
      if (/^\d+$/.test(content)) continue;
      if (seenParts.has(content)) continue;
      
      // 检查是否真的是英文（至少50%是英文字符）
      const englishChars = (content.match(/[a-zA-Z]/g) || []).length;
      const totalChars = content.length;
      if (englishChars / totalChars < 0.5) continue;
      
      // 检查是否已经部分翻译（包含中文）
      if (/[\u4e00-\u9fff]/.test(content)) {
        // 如果包含中文但仍有较多英文，标记为部分翻译
        const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
        if (englishChars > chineseChars * 2) {
          untranslatedParts.push({
            content,
            type: type + '_partial',
            position: match.index,
            englishRatio: englishChars / totalChars
          });
        }
        continue;
      }
      
      seenParts.add(content);
      untranslatedParts.push({
        content,
        type,
        position: match.index,
        englishRatio: englishChars / totalChars
      });
    }
  }
  
  // 按位置排序，优先处理前面的内容
  return untranslatedParts.sort((a, b) => a.position - b.position);
}

/**
 * 翻译未翻译的部分
 */
async function translateUntranslatedParts(text, untranslatedParts, targetLang) {
  let translatedText = text;
  const batchSize = 5; // 批量处理大小
  
  // 分批处理以提高效率
  for (let i = 0; i < untranslatedParts.length; i += batchSize) {
    const batch = untranslatedParts.slice(i, Math.min(i + batchSize, untranslatedParts.length));
    
    // 并行翻译批次中的内容
    const translationPromises = batch.map(async (part) => {
      try {
        logger.debug(`Translating [${part.type}]: "${part.content.substring(0, 50)}..."`);
        
        // 根据类型选择翻译策略
        let translationResult;
        
        switch (part.type) {
          case 'measurement':
            // 单位翻译需要特殊处理
            translationResult = await translateMeasurement(part.content, targetLang);
            break;
            
          case 'uppercase':
            // 大写词可能是缩写，需要特殊处理
            translationResult = await translateAcronym(part.content, targetLang);
            break;
            
          case 'list_item':
          case 'heading':
            // 标题和列表项需要简洁翻译
            translationResult = await translateConcise(part.content, targetLang);
            break;
            
          default:
            // 默认翻译
            translationResult = await translateWithContext(part.content, targetLang);
        }
        
        if (translationResult.success && translationResult.text !== part.content) {
          return {
            original: part.content,
            translated: translationResult.text,
            type: part.type
          };
        }
      } catch (error) {
        console.error(`翻译失败 [${part.type}]:`, error.message);
      }
      
      return null;
    });
    
    const results = await Promise.all(translationPromises);
    
    // 应用翻译结果
    for (const result of results) {
      if (result) {
        // 使用精确替换避免误替换
        const escapedOriginal = result.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedOriginal, 'g');
        
        // 检查替换是否安全
        const occurrences = (translatedText.match(regex) || []).length;
        if (occurrences === 1) {
          // 只有一处匹配，安全替换
          translatedText = translatedText.replace(regex, result.translated);
          logger.debug(`Replaced [${result.type}]: "${result.original.substring(0, 30)}..." -> "${result.translated.substring(0, 30)}..."`);
        } else if (occurrences > 1) {
          // 多处匹配，需要更精确的替换
          logger.warn(`Found multiple matches (${occurrences}), using context replacement`);
          translatedText = contextualReplace(translatedText, result.original, result.translated);
        }
      }
    }
    
    // 控制API调用频率
    if (i + batchSize < untranslatedParts.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  return translatedText;
}

/**
 * 带上下文的翻译
 */
async function translateWithContext(text, targetLang) {
  const prompt = `请将以下内容准确翻译成${getLanguageName(targetLang)}。
这是网页中的一部分内容，请保持专业性和准确性。
只返回翻译结果，不要有任何解释。

内容：${text}`;
  
  try {
    const translated = await translateText(text, targetLang);
    return {
      success: true,
      text: translated
    };
  } catch (error) {
    return {
      success: false,
      text: text,
      error: error.message
    };
  }
}

/**
 * 翻译度量单位
 */
async function translateMeasurement(text, targetLang) {
  const measurementMap = {
    'inches': '英寸',
    'inch': '英寸',
    'feet': '英尺',
    'foot': '英尺',
    'meters': '米',
    'meter': '米',
    'kg': '公斤',
    'lbs': '磅',
    'pounds': '磅',
    'pound': '磅',
    'ounces': '盎司',
    'ounce': '盎司',
    'gallons': '加仑',
    'gallon': '加仑',
    'liters': '升',
    'liter': '升',
    'years': '年',
    'year': '年',
    'months': '个月',
    'month': '个月',
    'days': '天',
    'day': '天',
    'hours': '小时',
    'hour': '小时',
    'minutes': '分钟',
    'minute': '分钟'
  };
  
  let translated = text;
  for (const [eng, chi] of Object.entries(measurementMap)) {
    const regex = new RegExp(`\\b${eng}\\b`, 'gi');
    translated = translated.replace(regex, chi);
  }
  
  return {
    success: translated !== text,
    text: translated
  };
}

/**
 * 翻译缩写词
 */
async function translateAcronym(text, targetLang) {
  const acronymMap = {
    'USA': '美国',
    'UK': '英国',
    'EU': '欧盟',
    'UN': '联合国',
    'GPS': 'GPS定位',
    'LED': 'LED灯',
    'USB': 'USB接口',
    'HDMI': 'HDMI接口',
    'WiFi': 'WiFi',
    'FAQ': '常见问题',
    'DIY': 'DIY',
    'VIP': 'VIP'
  };
  
  const translated = acronymMap[text.toUpperCase()] || text;
  
  if (translated === text) {
    // 如果没有在映射中找到，尝试通用翻译
    return translateWithContext(text, targetLang);
  }
  
  return {
    success: true,
    text: translated
  };
}

/**
 * 简洁翻译（用于标题和列表项）
 */
async function translateConcise(text, targetLang) {
  const prompt = `请将以下标题或列表项简洁地翻译成${getLanguageName(targetLang)}。
保持简洁，不要添加额外的说明。
只返回翻译结果。

内容：${text}`;
  
  try {
    const translated = await translateText(text, targetLang);
    return {
      success: true,
      text: translated
    };
  } catch (error) {
    return {
      success: false,
      text: text,
      error: error.message
    };
  }
}

/**
 * 强力翻译（最后手段）
 */
async function performAggressiveTranslation(text, targetLang, remainingParts) {
  logger.info(`Executing force translation, processing ${remainingParts.length} stubborn parts`);
  
  let processedText = text;
  
  // 构建一个映射表，包含所有需要强制翻译的内容
  const forceTranslateMap = new Map();
  
  for (const part of remainingParts) {
    // 为每个未翻译部分生成一个唯一标记
    const marker = `__FORCE_TRANS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}__`;
    forceTranslateMap.set(marker, part.content);
    
    // 替换原文中的内容为标记
    const escapedContent = part.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    processedText = processedText.replace(new RegExp(escapedContent, 'g'), marker);
  }
  
  // 批量翻译所有标记的内容
  const translationPromises = Array.from(forceTranslateMap.entries()).map(async ([marker, content]) => {
    try {
      const result = await translateText(content, targetLang);
      return { marker, translated: result };
    } catch (error) {
      console.error(`强力翻译失败: ${content.substring(0, 30)}...`);
      return { marker, translated: content };
    }
  });
  
  const translations = await Promise.all(translationPromises);
  
  // 替换所有标记为翻译后的内容
  for (const { marker, translated } of translations) {
    processedText = processedText.replace(new RegExp(marker, 'g'), translated);
  }
  
  return processedText;
}

/**
 * 上下文感知替换
 */
function contextualReplace(text, original, replacement) {
  // 尝试找到最合适的替换位置
  const segments = text.split(original);
  
  if (segments.length === 2) {
    // 只有一处，直接替换
    return segments.join(replacement);
  }
  
  // 多处匹配，根据上下文判断
  let result = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const prevContext = segments[i - 1].slice(-50);
    const nextContext = segments[i].slice(0, 50);
    
    // 检查上下文是否包含中文
    const hasChinese = /[\u4e00-\u9fff]/.test(prevContext + nextContext);
    
    if (hasChinese) {
      // 周围有中文，应该翻译
      result += replacement + segments[i];
    } else {
      // 周围没有中文，可能是代码或特殊内容，保留原文
      result += original + segments[i];
    }
  }
  
  return result;
}

/**
 * 获取最终翻译统计
 */
function getFinalTranslationStats(text, targetLang) {
  // 移除HTML标签和特殊标记
  const pureText = text
    .replace(/__PROTECTED_[A-Z_]+_\d+__/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .trim();
  
  const chineseChars = (pureText.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (pureText.match(/\b[a-zA-Z]{2,}\b/g) || []).length;
  const totalChars = pureText.length;
  
  const remainingEnglish = detectUntranslatedContent(text, targetLang);
  
  return {
    chineseRatio: (chineseChars / Math.max(totalChars, 1)) * 100,
    englishRatio: (englishWords * 5 / Math.max(totalChars, 1)) * 100, // 假设平均英文单词5个字符
    totalChars,
    chineseChars,
    englishWords,
    remainingEnglish: remainingEnglish.map(p => ({
      content: p.content.substring(0, 50),
      type: p.type
    }))
  };
}

/**
 * 获取语言名称
 */
function getLanguageName(langCode) {
  const languageNames = {
    'zh-CN': '简体中文',
    'zh-TW': '繁体中文',
    'en': '英文',
    'ja': '日语',
    'ko': '韩语',
    'es': '西班牙语',
    'fr': '法语',
    'de': '德语',
    'it': '意大利语',
    'pt': '葡萄牙语',
    'ru': '俄语',
    'ar': '阿拉伯语'
  };
  
  return languageNames[langCode] || langCode;
}

export {
  detectUntranslatedContent,
  translateUntranslatedParts,
  performAggressiveTranslation,
  getFinalTranslationStats
};
