// 翻译验证管线（纯函数版）
// 提供校验逻辑的无副作用实现，调用方负责日志与错误上报

const latinScriptLanguages = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'fi',
  'pl', 'tr', 'ro', 'cs', 'sk', 'hu', 'bg', 'et', 'lv', 'lt'
]);

const SHORT_TEXT_MIN = 15;
const SHORT_TEXT_MAX = 100;

const PLACEHOLDER_TEXTS = [
  'Your content', 'Paragraph', 'Image with text',
  'Subheading', 'Easy Setup', 'rear went mesh',
  'Item', 'Content', 'Title', 'Description'
];

export const ValidationSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

const CompletenessCodes = {
  SHORT_TEXT_UNCHANGED: 'SHORT_TEXT_UNCHANGED',
  NO_TARGET_CHAR: 'NO_TARGET_LANGUAGE_CHAR',
  MIXING_RATIO_HIGH: 'MIXED_LANGUAGE_CONTENT',
  INCOMPLETE_PATTERN: 'INCOMPLETE_PATTERN',
  LENGTH_TOO_SHORT: 'LENGTH_TOO_SHORT',
  HTML_UNBALANCED: 'HTML_UNBALANCED',
  PRODUCT_CHINESE_INSUFFICIENT: 'INSUFFICIENT_CHINESE_CONTENT'
};

const QualityCodes = {
  EMPTY_TRANSLATION: 'EMPTY_TRANSLATION',
  SAME_AS_ORIGINAL: 'SAME_AS_ORIGINAL',
  HTML_TAG_MISMATCH: 'HTML_TAG_MISMATCH',
  BRAND_WORD_ALTERED: 'BRAND_WORD_ALTERED',
  TRANSLATION_TOO_SHORT: 'TRANSLATION_TOO_SHORT',
  MISSING_TARGET_LANGUAGE: 'MISSING_TARGET_LANGUAGE',
  EXCESSIVE_ENGLISH: 'EXCESSIVE_ENGLISH_REMNANTS'
};

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

const brandWords = ['Shopify', 'Onewind', 'Lightsler'];

const technicalTermsForEnglish = new Set([
  'online', 'shop', 'store', 'product', 'collection', 'blog', 'page',
  'menu', 'theme', 'template'
]);

const completenessPatterns = [
  /^(Here is|Here's|I'll translate|The translation|Translation:|翻译如下|翻译结果)/i,
  /\.{3}$/, // 以省略号结尾
  /\[继续\]|\[continued\]|\[more\]/i,
  /TEXT_TOO_LONG/
];

function pushEvent(events, level, message, meta) {
  events.push({ level, message, meta });
}

function buildRecord({ category, code, message, severity, retryable, context }) {
  return { category, code, message, severity, retryable, context };
}

export function evaluateCompleteness(originalText, translatedText, targetLang) {
  const events = [];

  const isTechnicalContent = technicalKeywords.some(keyword =>
    originalText.toLowerCase().includes(keyword.toLowerCase())
  );

  const isProductContent = productKeywords.some(keyword =>
    originalText.toLowerCase().includes(keyword.toLowerCase())
  );

  if (originalText.length <= SHORT_TEXT_MIN) {
    return {
      isComplete: true,
      reason: '极短文本',
      events
    };
  }

  const isShortText = originalText.length >= SHORT_TEXT_MIN && originalText.length <= SHORT_TEXT_MAX;
  if (isShortText) {
    pushEvent(events, 'debug', `短文本验证 (${originalText.length}字符)`, {
      preview: originalText.substring(0, 50)
    });

    if (originalText.trim() === translatedText.trim()) {
      if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && /^[a-zA-Z\s\-_,.!?]+$/.test(originalText)) {
        return {
          isComplete: false,
          reason: '短文本未翻译，原文和译文完全相同（英文应翻译为中文）',
          events
        };
      }

      pushEvent(events, 'debug', '短文本原文与译文一致，可能是品牌词', { preview: originalText.substring(0, 50) });
    }

    if (targetLang === 'zh-CN' || targetLang === 'zh-TW') {
      const hasChinese = /[\u4e00-\u9fff]/.test(translatedText);
      if (!hasChinese) {
        return {
          isComplete: false,
          reason: '短文本翻译失败，目标中文但结果无中文字符',
          events
        };
      }
    }

    const englishChars = (translatedText.match(/[a-zA-Z]/g) || []).length;
    const totalChars = translatedText.length;
    const actualEnglishRatio = englishChars / Math.max(totalChars, 1);
    const normalizedTargetLang = (targetLang || '').toLowerCase();
    const shouldCheckEnglishRatio = !latinScriptLanguages.has(normalizedTargetLang) && !normalizedTargetLang.startsWith('zh');

    if (shouldCheckEnglishRatio) {
      let englishThreshold = 0.7;
      if (isProductContent) englishThreshold = 0.8;
      else if (isTechnicalContent) englishThreshold = 0.75;

      if (actualEnglishRatio > englishThreshold) {
        return {
          isComplete: false,
          reason: `短文本英文内容过多，英文比例: ${(actualEnglishRatio * 100).toFixed(1)}% (阈值: ${(englishThreshold * 100).toFixed(1)}%)`,
          events
        };
      }
    }

    pushEvent(events, 'debug', '短文本验证通过', {
      originalLength: originalText.length,
      translatedLength: translatedText.length
    });

    return {
      isComplete: true,
      reason: '短文本翻译合格',
      events
    };
  }

  if (isTechnicalContent) {
    pushEvent(events, 'debug', '检测到技术性内容，使用宽松验证标准');
  }

  if (isProductContent) {
    pushEvent(events, 'debug', '检测到产品描述内容，使用宽松验证标准');
  }

  const isHtmlContent = originalText.includes('<') && originalText.includes('>');

  if (!isHtmlContent && !isProductContent) {
    const originalWords = originalText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const translatedWords = translatedText.toLowerCase().split(/\s+/);

    let originalWordsInTranslation = 0;
    for (const word of originalWords) {
      if (brandWords.some(brand => brand.toLowerCase() === word.toLowerCase())) continue;
      if (translatedWords.some(tWord => tWord.includes(word))) originalWordsInTranslation++;
    }

    const mixingRatio = originalWordsInTranslation / Math.max(originalWords.length, 1);
    const mixingThreshold = 0.8;
    const minWordsForCheck = 10;

    if (mixingRatio > mixingThreshold && originalWords.length > minWordsForCheck) {
      return {
        isComplete: false,
        reason: `检测到原文和译文混合，混合比例: ${(mixingRatio * 100).toFixed(1)}% (阈值: ${(mixingThreshold * 100).toFixed(1)}%)`,
        events
      };
    }
  }

  if (isHtmlContent || isProductContent) {
    if (/TEXT_TOO_LONG/.test(translatedText)) {
      return {
        isComplete: false,
        reason: 'API报告文本过长',
        events
      };
    }
  } else {
    for (const pattern of completenessPatterns) {
      if (pattern.test(translatedText)) {
        return {
          isComplete: false,
          reason: `检测到不完整翻译模式: ${pattern.source}`,
          events
        };
      }
    }
  }

  const lengthRatio = translatedText.length / originalText.length;
  const isChineseTarget = targetLang === 'zh-CN' || targetLang === 'zh-TW';
  let minRatio;

  if (isHtmlContent) minRatio = 0.05;
  else if (isProductContent) minRatio = isChineseTarget ? 0.1 : 0.15;
  else if (isTechnicalContent) minRatio = isChineseTarget ? 0.15 : 0.2;
  else minRatio = isChineseTarget ? 0.2 : 0.3;

  if (lengthRatio < minRatio) {
    const contentType = isHtmlContent ? 'HTML' : (isProductContent ? '产品描述' : (isTechnicalContent ? '技术' : '普通'));
    return {
      isComplete: false,
      reason: `译文长度过短，长度比例: ${(lengthRatio * 100).toFixed(1)}% (${contentType}内容最低要求: ${(minRatio * 100).toFixed(1)}%)`,
      events
    };
  }

  if (isHtmlContent) {
    const openTags = (originalText.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (originalText.match(/<\/[^>]+>/g) || []).length;
    const transOpenTags = (translatedText.match(/<[^/][^>]*>/g) || []).length;
    const transCloseTags = (translatedText.match(/<\/[^>]+>/g) || []).length;

    const allowedDifference = Math.max(10, Math.floor(openTags * 0.3));
    if (Math.abs((openTags - closeTags) - (transOpenTags - transCloseTags)) > allowedDifference) {
      return {
        isComplete: false,
        reason: `HTML标签严重不平衡，允许差异: ${allowedDifference}`,
        events
      };
    }
  }

  if (isProductContent && (targetLang === 'zh-CN' || targetLang === 'zh-TW')) {
    const pureTextContent = translatedText
      .replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/[^\s]+/g, ' ')
      .replace(/\b(?:Onewind|YouTube|iframe|UHMWPE|PU|Silpoly)\b/gi, ' ')
      .replace(/\d+[\w\s\-×′″]*(?:mm|cm|m|ft|lb|oz|g|kg)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const chineseChars = (pureTextContent.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = pureTextContent.length;
    const englishWords = (pureTextContent.match(/\b[a-zA-Z]{2,}\b/g) || []).length;

    const pureTextChineseRatio = chineseChars / Math.max(totalChars, 1);
    let minChineseRatio = 0.15;

    if (isTechnicalContent) minChineseRatio = 0.1;
    const htmlTagCount = (translatedText.match(/<[^>]+>/g) || []).length;
    if (htmlTagCount > 10) minChineseRatio = 0.08;

    const hasSubstantialChinese = chineseChars > Math.max(50, pureTextContent.length * 0.05);
    const passesBasicRatio = pureTextChineseRatio >= minChineseRatio;
    const passesAbsoluteCount = hasSubstantialChinese;
    const hasReasonableTranslation = chineseChars > englishWords * 0.5;

    if (!passesBasicRatio && !passesAbsoluteCount && !hasReasonableTranslation) {
      return {
        isComplete: false,
        reason: `产品描述中文内容不足，纯文本中文比例: ${(pureTextChineseRatio * 100).toFixed(1)}% (要求: ${(minChineseRatio * 100).toFixed(1)}%)`,
        events
      };
    }

    pushEvent(events, 'debug', '产品描述中文内容检查通过', {
      pureTextChineseRatio: Number((pureTextChineseRatio * 100).toFixed(1)),
      chineseChars
    });
  }

  return {
    isComplete: true,
    reason: '翻译完整',
    events
  };
}

export function evaluateTranslationQuality(originalText, translatedText, targetLang) {
  const events = [];
  const issues = [];
  const warnings = [];
  const records = [];

  const pushRecord = (category, code, message, severity, retryable, context) => {
    records.push(buildRecord({ category, code, message, severity, retryable, context }));
  };

  if (!translatedText || !translatedText.trim()) {
    issues.push(QualityCodes.EMPTY_TRANSLATION);
    pushRecord('VALIDATION_ERROR', QualityCodes.EMPTY_TRANSLATION, 'Translation result is empty', 2, true, {
      originalLength: originalText?.length || 0,
      targetLanguage: targetLang
    });

    return {
      isValid: false,
      terminate: true,
      terminationCode: QualityCodes.EMPTY_TRANSLATION,
      issues,
      warnings,
      records,
      events
    };
  }

  if (originalText.trim() === translatedText.trim()) {
    issues.push(QualityCodes.SAME_AS_ORIGINAL);

    if (originalText.length > 20) {
      pushRecord('WARNING', 'TRANSLATION_UNCHANGED', 'Translation is identical to original text', 1, true, {
        originalText: originalText.substring(0, 100),
        targetLanguage: targetLang
      });
    }

    return {
      isValid: false,
      terminate: true,
      terminationCode: QualityCodes.SAME_AS_ORIGINAL,
      issues,
      warnings,
      records,
      events
    };
  }

  const originalTags = (originalText.match(/<[^>]+>/g) || []).sort();
  const translatedTags = (translatedText.match(/<[^>]+>/g) || []).sort();

  if (originalTags.length !== translatedTags.length) {
    warnings.push(QualityCodes.HTML_TAG_MISMATCH);
    pushRecord('WARNING', 'HTML_TAG_COUNT_MISMATCH',
      `HTML tag count mismatch: original ${originalTags.length}, translated ${translatedTags.length}`,
      2,
      true,
      {
        originalTags: originalTags.slice(0, 10),
        translatedTags: translatedTags.slice(0, 10),
        targetLanguage: targetLang
      }
    );
  }

  for (const brand of brandWords) {
    const originalCount = (originalText.match(new RegExp(brand, 'gi')) || []).length;
    const translatedCount = (translatedText.match(new RegExp(brand, 'gi')) || []).length;

    if (originalCount !== translatedCount) {
      warnings.push(`${QualityCodes.BRAND_WORD_ALTERED}_${brand}`);
      pushRecord('WARNING', QualityCodes.BRAND_WORD_ALTERED,
        `Brand word "${brand}" count changed: ${originalCount} -> ${translatedCount}`,
        2,
        false,
        {
          brandWord: brand,
          originalCount,
          translatedCount,
          targetLanguage: targetLang
        }
      );
    }
  }

  const minLengthRatio = (targetLang === 'zh-CN' || targetLang === 'zh-TW') ? 0.2 : 0.4;
  const maxLengthRatio = (targetLang === 'zh-CN' || targetLang === 'zh-TW') ? 1.5 : 3.0;

  if (translatedText.length < originalText.length * minLengthRatio) {
    const hasTargetLangChars = (
      (targetLang === 'zh-CN' || targetLang === 'zh-TW') && /[\u4e00-\u9fff]/.test(translatedText)
    ) || (
      targetLang === 'ja' && /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(translatedText)
    ) || (
      targetLang === 'ko' && /[\uac00-\ud7af]/.test(translatedText)
    );

    if (originalText.length < 50 && hasTargetLangChars) {
      return {
        isValid: true,
        terminate: false,
        issues,
        warnings,
        records,
        events
      };
    }

    warnings.push(QualityCodes.TRANSLATION_TOO_SHORT);
    pushRecord('WARNING', QualityCodes.TRANSLATION_TOO_SHORT,
      `Translation seems too short: ${translatedText.length} chars vs original ${originalText.length} chars`,
      2,
      true,
      {
        originalLength: originalText.length,
        translatedLength: translatedText.length,
        ratio: (translatedText.length / originalText.length).toFixed(2),
        targetLanguage: targetLang
      }
    );

    return {
      isValid: false,
      terminate: true,
      terminationCode: QualityCodes.TRANSLATION_TOO_SHORT,
      issues,
      warnings,
      records,
      events
    };
  }

  if (translatedText.length > originalText.length * maxLengthRatio) {
    warnings.push('TOO_LONG');
  }

  let hasTargetLanguageFeatures = false;
  if (targetLang === 'zh-CN' || targetLang === 'zh-TW') {
    hasTargetLanguageFeatures = /[\u4e00-\u9fff]/.test(translatedText);
  } else if (targetLang === 'ja') {
    hasTargetLanguageFeatures = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(translatedText);
  } else if (targetLang === 'ko') {
    hasTargetLanguageFeatures = /[\uac00-\ud7af]/.test(translatedText);
  } else if (targetLang === 'ar') {
    hasTargetLanguageFeatures = /[\u0600-\u06ff]/.test(translatedText);
  } else if (targetLang === 'ru') {
    hasTargetLanguageFeatures = /[\u0400-\u04ff]/.test(translatedText);
  } else if (targetLang === 'th') {
    hasTargetLanguageFeatures = /[\u0e00-\u0e7f]/.test(translatedText);
  } else {
    hasTargetLanguageFeatures = true;
  }

  if (!hasTargetLanguageFeatures && targetLang !== 'en') {
    warnings.push(QualityCodes.MISSING_TARGET_LANGUAGE);
    pushRecord('WARNING', QualityCodes.MISSING_TARGET_LANGUAGE,
      `Translation lacks ${targetLang} language characteristics`,
      3,
      true,
      {
        targetLanguage: targetLang,
        sampleText: translatedText.substring(0, 100)
      }
    );

    return {
      isValid: false,
      terminate: true,
      terminationCode: QualityCodes.MISSING_TARGET_LANGUAGE,
      issues,
      warnings,
      records,
      events
    };
  }

  if (targetLang !== 'en' && targetLang !== 'en-US' && targetLang !== 'en-GB') {
    const englishWords = translatedText.match(/\b[a-zA-Z]{4,}\b/g) || [];
    const nonBrandEnglish = englishWords.filter(word =>
      !brandWords.some(brand => brand.toLowerCase() === word.toLowerCase())
    );

    const filteredNonBrandEnglish = nonBrandEnglish.filter(word =>
      !technicalTermsForEnglish.has(word.toLowerCase())
    );

    if (filteredNonBrandEnglish.length > originalText.split(/\s+/).length * 0.6) {
      warnings.push(QualityCodes.EXCESSIVE_ENGLISH);
      pushRecord('WARNING', QualityCodes.EXCESSIVE_ENGLISH,
        `Too many English words remain in ${targetLang} translation`,
        2,
        true,
        {
          targetLanguage: targetLang,
          englishWordCount: filteredNonBrandEnglish.length,
          totalWordCount: originalText.split(/\s+/).length,
          englishWords: filteredNonBrandEnglish.slice(0, 10),
          threshold: '60%'
        }
      );
    }
  }

  return {
    isValid: issues.length === 0,
    terminate: false,
    terminationCode: null,
    issues,
    warnings,
    records,
    events
  };
}

export function runValidationPipeline({ originalText, translatedText, targetLang }) {
  const completeness = evaluateCompleteness(originalText, translatedText, targetLang);
  const quality = evaluateTranslationQuality(originalText, translatedText, targetLang);

  return {
    completeness,
    quality,
    passed: completeness.isComplete && quality.isValid
  };
}
