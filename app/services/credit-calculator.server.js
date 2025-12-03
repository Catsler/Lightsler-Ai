import { stripHtml } from '../utils/html-utils.server.js';
import { PRICING_CONFIG } from '../utils/pricing-config.js';

/**
 * CreditCalculator 负责统一的字数统计与权重计算，确保预估与实际使用逻辑一致。
 * 最新规则：仅根据字符数计算额度，1 额度 = 20,000 字符。
 */
class CreditCalculator {
  hasHtmlTags(text = '') {
    return /<[^>]+>/.test(text);
  }

  countCharacters(text = '', { stripHtmlTags = false } = {}) {
    const raw = text ?? '';
    const trimmed = stripHtmlTags && this.hasHtmlTags(raw) ? stripHtml(raw) : raw;
    return {
      rawLength: raw.length,
      effectiveLength: trimmed.length,
      hasHtml: this.hasHtmlTags(raw)
    };
  }

  /**
   * 根据有效字符数计算额度。
   */
  calculateCredits(effectiveChars) {
    if (!effectiveChars || effectiveChars <= 0) {
      return PRICING_CONFIG.MIN_CREDIT_CHARGE;
    }

    const credits = Math.ceil(
      effectiveChars / PRICING_CONFIG.CREDIT_TO_CHARS
    );

    return Math.max(credits, PRICING_CONFIG.MIN_CREDIT_CHARGE);
  }

  calculateEstimated(sourceText, targetLanguage, resourceType, options = {}) {
    const charCount = this.countCharacters(sourceText, { stripHtmlTags: true, ...options });
    const credits = this.calculateCredits(charCount.effectiveLength);

    return {
      credits,
      details: {
        rawChars: charCount.rawLength,
        effectiveChars: charCount.effectiveLength,
        multiplier: 1,
        targetLanguage,
        resourceType
      }
    };
  }

  calculateActual(sourceText, translatedText, targetLanguage, resourceType, options = {}) {
    const sourceCount = this.countCharacters(sourceText, { stripHtmlTags: true, ...options });
    const translatedCount = this.countCharacters(translatedText, { stripHtmlTags: false });
    const credits = this.calculateCredits(sourceCount.effectiveLength);

    return {
      credits,
      details: {
        targetLanguage,
        resourceType,
        sourceEffectiveChars: sourceCount.effectiveLength,
        translatedEffectiveChars: translatedCount.effectiveLength,
        htmlStrippedChars: sourceCount.rawLength - sourceCount.effectiveLength,
        translationExpansion:
          sourceCount.effectiveLength > 0
            ? translatedCount.effectiveLength / sourceCount.effectiveLength
            : 1,
        multiplier: 1
      }
    };
  }
}

export const creditCalculator = new CreditCalculator();
export { CreditCalculator };
