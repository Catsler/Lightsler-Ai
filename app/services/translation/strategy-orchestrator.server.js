import { buildSimplePrompt , getLanguageName } from './prompts.server.js';
import { shouldTranslate } from '../hooks-manager.server.js';
import { logger } from '../../utils/logger.server.js';
import { applyPostProcessors } from './post-processors.server.js';
import { selectTranslationStrategy } from './translation-strategies.server.js';
import { runStrategy } from './strategy-runner.server.js';
import { handlePlaceholderFallback, placeholderFallbackStats } from './post-processor-rules.server.js';
import { createErrorResponse } from '../../utils/error-handler.server.js';
import { buildTranslationResult } from './result-utils.server.js';
import { executeTranslationRequest } from './core.server.js'; // re-use core request executor
import { translateConfigKeyWithFallback } from './config-key-fallback.server.js';

export async function translateTextWithFallbackOrchestrated(text, targetLang, options = {}) {
  const normalizedText = typeof text === 'string' ? text : '';

  if (!normalizedText.trim()) {
    return {
      success: true,
      text: normalizedText,
      isOriginal: true,
      language: targetLang
    };
  }

  const translationContext = {
    text: normalizedText,
    targetLang,
    resourceType: options.resourceType,
    shopId: options.shopId,
    resourceId: options.resourceId,
    sessionId: options.sessionId,
    requestId: options.requestId,
    metadata: {
      retryCount: options.retryCount ?? 0,
      allowSimplePrompt: options.allowSimplePrompt !== false,
      ...options.metadata
    }
  };

  const shouldTranslateResult = await shouldTranslate(translationContext);
  if (!shouldTranslateResult) {
    logger.debug('翻译被hooks跳过', { context: translationContext });
    return {
      success: true,
      text: normalizedText,
      isOriginal: true,
      language: targetLang,
      meta: { skippedByHooks: true }
    };
  }

  const allowSimplePrompt = options.allowSimplePrompt !== false;
  const retryCount = options.retryCount ?? 0;
  const additionalFallbacks = Array.isArray(options.fallbacks) ? options.fallbacks : [];
  const postProcessOptions = options.postProcess || {};
  const linkConversion = options.linkConversion;

  const fallbackStrategies = [];

  if (allowSimplePrompt) {
    fallbackStrategies.push({
      name: 'simple',
      prepare: ({ text: originalText, targetLang: lang }) => ({
        text: originalText,
        targetLang: lang,
        systemPrompt: buildSimplePrompt(lang),
        strategy: 'simple',
        extras: { mode: 'simple' },
        cacheKeyExtras: { mode: 'simple' },
        optionsOverride: { maxRetries: 1 }
      })
    });
  }

  for (const fallback of additionalFallbacks) {
    if (fallback) {
      fallbackStrategies.push(fallback);
    }
  }

  const strategiesToTry = [
    {
      name: 'enhanced',
      prepare: ({ text: originalText, targetLang: lang, systemPrompt: prompt }) => ({
        text: originalText,
        targetLang: lang,
        systemPrompt: prompt || buildSimplePrompt(lang),
        strategy: 'enhanced',
        cacheKeyExtras: { mode: 'enhanced' }
      })
    },
    ...fallbackStrategies
  ];

  for (let i = 0; i < strategiesToTry.length; i += 1) {
    const strategy = strategiesToTry[i];
    try {
      const requestPayload = strategy.prepare({
        text: normalizedText,
        targetLang,
        systemPrompt: buildSimplePrompt(targetLang)
      });

      const response = await executeTranslationRequest({
        ...requestPayload,
        context: {
          ...options.context,
          strategy: strategy.name,
          retryCount
        },
        fallbacks: fallbackStrategies.slice(i + 1)
      });

      if (!response.success) {
        logger.warn(`[TRANSLATION] 策略 ${strategy.name} 失败`, {
          error: response.error,
          targetLang,
          retryCount,
          strategy: strategy.name
        });
        continue;
      }

      const placeholderHandled = await handlePlaceholderFallback({
        originalText: normalizedText,
        translatedText: response.text,
        targetLang,
        statsMap: placeholderFallbackStats,
        logger,
        isLikelyConfigKey: (txt) => typeof txt === 'string' && /^[A-Z0-9_]+$/.test(txt),
        translateConfigKeyWithFallback: (txt, lang) =>
          translateConfigKeyWithFallback(txt, lang)
      });

      const postProcessContext = {
        targetLang,
        originalText: normalizedText,
        ...postProcessOptions,
        linkConversion: linkConversion || postProcessOptions.linkConversion,
        tagMap: response.tagMap
      };

      const finalText = await applyPostProcessors(response.text, postProcessContext);

      if (placeholderHandled.handled) {
        return placeholderHandled.result;
      }

      return buildTranslationResult(
        {
          ...response,
          text: finalText
        },
        normalizedText,
        targetLang,
        logger
      );
    } catch (error) {
      const isLastTry = i === strategiesToTry.length - 1;
      logger.warn('[TRANSLATION] 策略执行失败', {
        strategy: strategy.name,
        error: error.message,
        retryCount,
        targetLang,
        isLastTry
      });

      if (isLastTry) {
        return createErrorResponse(error, text);
      }
    }
  }

  return createErrorResponse(new Error('所有翻译策略失败'), text);
}
