import { buildEnhancedPrompt } from './prompts.server.js';
import { applyPostProcessors } from './post-processors.server.js';
import { runValidationPipeline } from './validators.server.js';
import { buildTranslationResult } from './result-utils.server.js';
import { logger , logShortTextTranslation, logTranslationQuality, logEnglishRemnants } from '../../utils/logger.server.js';
import { createErrorResponse, withErrorHandling } from '../../utils/error-handler.server.js';
import { executeTranslationRequest } from './core.server.js';
import { translateLongTextStrategy } from './long-text-strategy.server.js';

export async function translateTextEnhancedStrategy(text, targetLang, options = {}) {
  const runtimeOptions = typeof options === 'number' ? { retryCount: options } : { ...(options || {}) };
  const retryCount = runtimeOptions.retryCount ?? 0;
  const postProcessOptions = runtimeOptions.postProcess || {};
  const linkConversion = runtimeOptions.linkConversion;

  if (!text || !text.trim()) {
    return {
      success: true,
      text,
      isOriginal: true
    };
  }

  if (!process.env.GPT_API_KEY) {
    logger.warn('API密钥未配置，返回原文');
    return createErrorResponse(new Error('API密钥未配置'), text);
  }

  if (text.length > (runtimeOptions.longTextThreshold ?? 1500)) {
    return translateLongTextStrategy(text, targetLang, {
      postProcess: postProcessOptions,
      linkConversion,
      maxChunkSize: runtimeOptions.maxChunkSize
    });
  }

  logger.logTranslationStart(text, targetLang, { strategy: 'enhanced' });

  const systemPrompt = buildEnhancedPrompt(targetLang);

  const translationFunction = withErrorHandling(async () => {
    const startTime = Date.now();

    const result = await executeTranslationRequest({
      text,
      targetLang,
      systemPrompt,
      strategy: 'enhanced',
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

    if (text.length <= 100) {
      logShortTextTranslation(text, translatedText, targetLang, {
        processingTime,
        tokenLimit: result.tokenLimit,
        isBoundaryCase: text.length >= 15 && text.length <= 20
      });
    }

    if (translatedText === 'TEXT_TOO_LONG' || translatedText.includes('TEXT_TOO_LONG')) {
      logger.warn('API返回TEXT_TOO_LONG标识', {
        originalText: text.substring(0, 100),
        originalLength: text.length,
        targetLang,
        returnedText: translatedText,
        strategy: 'enhanced'
      });

      return createErrorResponse(new Error('文本过长，建议分段或批量翻译'), text);
    }

    // 验证完整性与质量
    const validation = runValidationPipeline({
      originalText: text,
      translatedText,
      targetLang
    });

    if (!validation.passed) {
      logger.warn('翻译可能不完整，未通过完整性验证', {
        originalLength: text.length,
        translatedLength: translatedText.length,
        targetLang,
        validation
      });
    }

    logTranslationQuality(text, translatedText, targetLang, {
      processingTime,
      strategy: 'enhanced'
    });

    const englishRemnants = translatedText.match(/[a-zA-Z]{5,}/g);
    if (englishRemnants) {
      logEnglishRemnants(text, translatedText, targetLang, {
        remnants: englishRemnants.slice(0, 5)
      });
    }

    const finalContext = {
      targetLang,
      originalText: text,
      ...postProcessOptions,
      linkConversion: linkConversion || postProcessOptions.linkConversion
    };

    const finalText = await applyPostProcessors(translatedText, finalContext);

    return {
      success: true,
      text: finalText,
      isOriginal: !validation.passed,
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
    logger.logTranslationFailure(text, error, {
      attempt: retryCount + 1,
      maxRetries: runtimeOptions.maxRetries ?? 2,
      strategy: 'enhanced'
    });

    if (error.retryable && retryCount < (runtimeOptions.maxRetries ?? 2) - 1) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      logger.info(`翻译失败，${delay}ms后进行第${retryCount + 2}次尝试`, {
        error: error.message,
        strategy: 'exponential_backoff'
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      const nextOptions = { ...runtimeOptions, retryCount: retryCount + 1 };
      return translateTextEnhancedStrategy(text, targetLang, nextOptions);
    }

    return createErrorResponse(error, text);
  }
}
