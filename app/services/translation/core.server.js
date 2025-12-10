/* eslint-disable import/first, no-unused-vars, no-console */
/**
 * GPT翻译API服务
 */

import { config } from '../../utils/config.server.js';
import { collectError, ERROR_TYPES } from '../error-collector.server.js';

// 导入新的工具函数
import {
  createTranslationAPIClient,
  createInMemoryCache,
  createRequestDeduplicator
} from './api-client.server.js';
import { runTranslationDiagnostics } from './diagnostics.server.js';
import { executeTranslationRequest as executeTranslationRequestBase } from './request-executor.server.js';

export { runTranslationDiagnostics } from './diagnostics.server.js';
import {
  chunkText,
  isLikelyHtml
} from './chunking.server.js';
import { protectHtmlTags, restoreHtmlTags } from './html-handler.server.js';
import { applyPostProcessors } from './post-processors.server.js';
import {
  checkBrandWords,
  handlePlaceholderFallback,
  isBrandWord,
  placeholderFallbackStats,
  SKIP_BRAND_CHECK_FIELDS
} from './post-processor-rules.server.js';
import { selectTranslationStrategy } from './translation-strategies.server.js';
import { runStrategy } from './strategy-runner.server.js';
import { buildTranslationResult } from './identical-result.server.js';
export { isBrandWord, placeholderFallbackStats } from './post-processor-rules.server.js';
import { 
  TranslationError, 
  withErrorHandling, 
  createErrorResponse, 
  ErrorCollector 
} from '../../utils/error-handler.server.js';
import {
  logger,
  apiLogger,
  validationLogger,
  logShortTextTranslation,
  logTranslationQuality,
  logEnglishRemnants,
  createTranslationLogger
} from '../../utils/logger.server.js';
import { getLocalizedErrorMessage } from '../../utils/error-messages.server.js';
import {
  shouldEnforceBilling,
  reserveBillingIfNeeded,
  confirmBillingIfNeeded,
  ensureReservationReleased,
  handleBillingError
} from './billing-orchestrator.server.js';
export {
  validateTranslationConfig,
  testTranslationAPI,
  getTranslationServiceStatus
} from './config-check.server.js';
export { getTranslationStats, getTranslationLogs, getPlaceholderErrorStats } from './logs.server.js';

// 导入质量分析器
import { qualityErrorAnalyzer } from '../quality-error-analyzer.server.js';

// 导入内存缓存服务
import {
  getCachedTranslation,
  setCachedTranslation,
  getMemoryCache
} from '../memory-cache.server.js';

// 提示词与语言名称
import {
  buildEnhancedPrompt,
  buildSimplePrompt,
  getLanguageName
} from './prompts.server.js';
import {
  evaluateCompleteness,
  evaluateTranslationQuality
} from './validators.server.js';
import { recordTranslationCall, getTranslationMetrics } from './metrics.server.js';

// 导入crypto用于生成哈希
import crypto from 'crypto'; // { language: count }

// 导入Sequential Thinking核心服务
import {
  DecisionEngine,
  TranslationScheduler
} from '../sequential-thinking-core.server.js';

const BILLING_ENABLED = process.env.SHOPIFY_BILLING_ENABLED === 'true';
const BILLING_BYPASS = process.env.BILLING_BYPASS === 'true';


const translationLogger = createTranslationLogger('TRANSLATION');

const translationApiCache = createInMemoryCache({ ttlSeconds: config.translation.cacheTTL ?? 3600 });
const translationApiDeduplicator = createRequestDeduplicator();

const translationClient = createTranslationAPIClient({
  maxRetries: config.translation.maxRetries ?? 2,
  retryDelay: config.translation.retryDelay ?? 1000,
  useExponentialBackoff: config.translation.useExponentialBackoff ?? true,
  cache: translationApiCache,
  cacheTTL: config.translation.cacheTTL ?? 3600,
  deduplicate: translationApiDeduplicator,
  fallbacks: [
    {
      name: 'reduce-context',
      prepare: ({ text, targetLang, systemPrompt }) => ({
        text: text ? text.slice(0, Math.max(50, Math.floor(text.length * 0.7))) : text,
        targetLang,
        systemPrompt,
        strategy: 'reduced-context',
        extras: { mode: 'reduced' }
      })
    }
  ]
});

export async function executeTranslationRequest(params) {
  return executeTranslationRequestBase({
    client: translationClient,
    ...params
  });
}

export { translationLogger };

/**
 * 带超时的fetch函数
 * @param {string} url - 请求URL
 * @param {Object} options - fetch选项
 * @param {number} timeout - 超时时间（毫秒），默认30秒
 */
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeout);

  const { signal: userSignal, ...restOptions } = options ?? {};
  let signal = controller.signal;

  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timeoutId);
      throw userSignal.reason ?? new Error('请求被取消');
    }

    if (typeof AbortSignal !== 'undefined' && AbortSignal.any) {
      signal = AbortSignal.any([userSignal, controller.signal]);
    } else {
      userSignal.addEventListener('abort', () => controller.abort(userSignal.reason), { once: true });
    }
  }

  try {
    const response = await fetch(url, { ...restOptions, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error && (error.name === 'AbortError' || error.message === 'timeout') && !(userSignal?.aborted)) {
      throw new Error(`请求超时（${timeout / 1000}秒）`);
    }

    throw error;
  }
}

/**
 * 语言代码到语言名称的映射
 * @param {string} langCode - 语言代码
 * @returns {string} 语言名称
 */

/**
 * 调用GPT翻译API，支持重试机制
 * @param {string} text - 待翻译文本
 * @param {string} targetLang - 目标语言代码
 * @param {number} retryCount - 当前重试次数
 * @returns {Promise<string>} 翻译结果
 */


export async function postProcessTranslation(translatedText, targetLang, originalText = '', options = {}) {
  let textToProcess = translatedText;

  // 统一处理 translateText() 的两种返回格式：string 或 {text, skipped, ...}
  if (translatedText && typeof translatedText === 'object') {
    textToProcess = translatedText.text ?? translatedText.value ?? originalText ?? '';

    // 调试日志：记录skip事件
    if (translatedText.skipped) {
      logger.debug('[postProcessTranslation] 检测到skip结果', {
        skipReason: translatedText.skipReason,
        originalText: originalText?.slice(0, 50),
        targetLang
      });
    }
  }

  // 类型检查，非字符串直接返回原文
  if (typeof textToProcess !== 'string') {
    return originalText;
  }

  const context = {
    targetLang,
    originalText,
    tagMap: translatedText?.tagMap ?? options.tagMap,
    ...(options || {})
  };

  return applyPostProcessors(textToProcess, context);
}

export async function translateText(text, targetLang, options = {}) {
  let retryCount = 0;
  let optionPayload = {};
  let translationResult = null;
  let strategyKey = 'default';

  if (typeof options === 'number') {
    retryCount = options;
    optionPayload = { retryCount };
  } else if (options && typeof options === 'object') {
    retryCount = options.retryCount ?? 0;
    optionPayload = { ...options, retryCount };
  } else {
    optionPayload = { retryCount };
  }

  // 品牌词保护检测
  const normalizedText = typeof text === 'string' ? text : '';
  const sourceTextForBilling = typeof text === 'string' ? text : normalizedText;
  const brandWordResult = checkBrandWords(normalizedText, optionPayload);
  if (brandWordResult.shouldSkip) {
    logger.info('[TRANSLATION] 品牌词保护跳过翻译', {
      text: normalizedText.slice(0, 50),
      reason: brandWordResult.reason,
      targetLang
    });
    return {
      text: normalizedText,
      skipped: true,
      skipReason: brandWordResult.reason
    };
  }

  const strategySelection = selectTranslationStrategy({
    text: normalizedText,
    targetLang,
    options: {
      ...optionPayload,
      isHtml: isLikelyHtml(normalizedText)
    }
  });
  strategyKey = strategySelection.key;
  const runnerKey = strategyKey === 'long-html' ? 'long-html' : 'enhanced';
  logger.info('[TRANSLATION] 策略选择', {
    runnerKey,
    strategyKey,
    reason: strategySelection.reason,
    textLength: normalizedText.length,
    resourceType: optionPayload.resourceType
  });

  const hasTranslatableText = typeof normalizedText === 'string' && normalizedText.trim().length > 0;
  const billingContext = hasTranslatableText
    ? await reserveBillingIfNeeded(normalizedText, targetLang, optionPayload, translationLogger)
    : { billingEnabled: false };
  const billingEnabled = billingContext.billingEnabled;
  const billingReservationId = billingContext.reservationId;
  const estimatedUsage = billingContext.estimatedUsage;

  try {
    translationResult = await runStrategy({
      key: runnerKey,
      payload: {
        text: normalizedText,
        targetLang,
        options: optionPayload,
        logger
      },
      logger
    });

    if (!translationResult.success) {
      throw new TranslationError(`翻译失败: ${translationResult.error || '未知错误'}`, {
        code: translationResult.errorCode || 'TRANSLATION_FAILED',
        category: 'TRANSLATION',
        retryable: translationResult.retryable ?? true,
        context: {
          targetLang,
          retryCount,
          isOriginal: translationResult.isOriginal ?? false
        }
      });
    }

    if (billingEnabled && billingReservationId) {
      await confirmBillingIfNeeded(
        billingReservationId,
        sourceTextForBilling,
        translationResult.text,
        targetLang,
        optionPayload,
        estimatedUsage
      );
    }
  } catch (error) {
    handleBillingError(error, billingEnabled, estimatedUsage, optionPayload, targetLang, translationLogger);
    throw error;
  } finally {
    if (billingEnabled && billingReservationId) {
      await ensureReservationReleased(billingReservationId);
    }
  }

  return buildTranslationResult(translationResult, text, targetLang, logger);
}

/**
 * 检查品牌词保护（最小版本）
 */
// 包装translateText以处理skip逻辑
async function translateTextWithSkip(text, targetLang, context = {}) {
  if (!text || text.trim() === '') {
    return null;
  }
  
  try {
    const result = await translateText(text, targetLang, context);
    
    // 检查是否返回skip标记
    if (result && typeof result === 'object' && result.skipped) {
      translationLogger.warn('[TRANSLATION] 翻译被跳过', {
        reason: result.skipReason,
        original: text.slice(0, 100),
        targetLang,
        ...context
      });
      return null; // 返回null表示跳过
    }
    
    return result;
  } catch (error) {
    // 如果是skip情况，不应该抛出错误
    translationLogger.error('[TRANSLATION] 翻译失败', {
      error: error.message,
      original: text.slice(0, 100),
      targetLang,
      ...context
    });
    throw error;
  }
}

/**
 * 增强版翻译函数，返回详细的状态信息
 * @param {string} text - 要翻译的文本
 * @param {string} targetLang - 目标语言
 * @param {number} retryCount - 重试次数
 * @returns {Promise<{success: boolean, text: string, error?: string, isOriginal?: boolean, language?: string}>}

/**
 * 验证翻译结果是否真的被翻译了
 * @param {string} originalText - 原始文本
 * @param {string} translatedText - 翻译后的文本
 * @param {string} targetLang - 目标语言
 * @returns {Promise<boolean>}
 */
// 增强的翻译完整性验证
// 增强的翻译完整性验证
async function validateTranslationCompleteness(originalText, translatedText, targetLang) {
  const evaluation = evaluateCompleteness(originalText, translatedText, targetLang);

  for (const event of evaluation.events) {
    const { level = 'debug', message, meta } = event;
    if (logger[level]) {
      logger[level](message, meta);
    }
  }

  return {
    isComplete: evaluation.isComplete,
    reason: evaluation.reason
  };
}

export async function validateTranslation(originalText, translatedText, targetLang) {
  const evaluation = evaluateTranslationQuality(originalText, translatedText, targetLang);

  for (const event of evaluation.events) {
    const { level = 'debug', message, meta } = event;
    if (logger[level]) {
      logger[level](message, meta);
    }
  }

  for (const record of evaluation.records) {
    await collectError({
      errorType: ERROR_TYPES.VALIDATION,
      errorCategory: record.category,
      errorCode: record.code,
      message: record.message,
      operation: 'validateTranslation',
      severity: record.severity,
      retryable: record.retryable,
      context: record.context
    });
  }

  return evaluation.isValid;
}




export function getTranslationOrchestratorStatus() {
  const cacheStats = typeof translationApiCache.stats === 'function'
    ? translationApiCache.stats()
    : {
        size: null,
        hits: null,
        misses: null,
        hitRate: null
      };

  const dedupeSize = typeof translationApiDeduplicator.size === 'function'
    ? translationApiDeduplicator.size()
    : null;

  return {
    cache: cacheStats,
    deduplicator: {
      inFlight: dedupeSize
    }
  };
}
