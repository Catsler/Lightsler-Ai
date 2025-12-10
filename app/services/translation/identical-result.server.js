import { logger } from '../../utils/logger.server.js';

function analyzeIdenticalResult(text) {
  const trimmedText = text.trim();
  
  if (/^[A-Z]{2,}-\d+/.test(trimmedText)) {
    return 'product_code';
  }
  
  if (/^(API|URL|HTML|CSS|JS|JSON|XML|SQL)$/i.test(trimmedText)) {
    return 'technical_term';
  }
  
  if (trimmedText.length < 50 && /^[A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(trimmedText)) {
    return 'possible_brand';
  }
  
  return 'identical_result';
}

export function buildTranslationResult(translationResult, originalText, targetLang) {
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
