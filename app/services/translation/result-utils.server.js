export function analyzeIdenticalResult(text) {
  const trimmedText = text.trim();
  
  // 产品代码/SKU模式
  if (/^[A-Z]{2,}-\d+/.test(trimmedText)) {
    return 'product_code';
  }
  
  // 技术术语
  if (/^(API|URL|HTML|CSS|JS|JSON|XML|SQL)$/i.test(trimmedText)) {
    return 'technical_term';
  }
  
  // 品牌词检测（简单版）
  if (trimmedText.length < 50 && /^[A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(trimmedText)) {
    return 'possible_brand';
  }
  
  // 默认返回
  return 'identical_result';
}

export function buildTranslationResult(translationResult, originalText, targetLang, logger) {
  const normalizedOriginal = (originalText || '').trim().toLowerCase();
  const normalizedTranslated = (translationResult.text || '').trim().toLowerCase();

  if ((translationResult.isOriginal || normalizedOriginal === normalizedTranslated) && normalizedOriginal) {
    const skipReason = analyzeIdenticalResult(originalText);
    
    logger.info('[TRANSLATION] 译文与原文相同', {
      targetLang,
      skipReason,
      originalSample: (originalText || '').trim().slice(0, 50)
    });
    
    return {
      text: translationResult.text,
      skipped: true,
      skipReason
    };
  }

  return translationResult.text;
}
