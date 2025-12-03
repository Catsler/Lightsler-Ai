import { config } from '../../utils/config.server.js';
import { PRICING_CONFIG } from '../../utils/pricing-config.js';
import {
  createAPIHeaders,
  createTranslationRequestBody,
  parseAPIResponse,
  extractTranslationFromResponse,
  estimateTokenCount,
  calculateDynamicTokenLimit
} from '../../utils/api.server.js';
import { logger } from '../../utils/logger.server.js';

function createRateLimiter({ minIntervalMs = 0, maxRequestsPerMinute = 0 } = {}) {
  const requestTimestamps = [];
  let lastRequestTime = 0;
  let queue = Promise.resolve();

  async function schedule() {
    const now = Date.now();
    let delay = 0;

    if (minIntervalMs > 0 && lastRequestTime > 0) {
      const sinceLast = now - lastRequestTime;
      if (sinceLast < minIntervalMs) {
        delay = Math.max(delay, minIntervalMs - sinceLast);
      }
    }

    if (maxRequestsPerMinute > 0) {
      const windowStart = now - 60000;
      while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
        requestTimestamps.shift();
      }

      if (requestTimestamps.length >= maxRequestsPerMinute) {
        const earliest = requestTimestamps[0];
        const waitTime = earliest + 60000 - now;
        if (waitTime > delay) {
          delay = waitTime;
        }
      }
    }

    if (delay > 0) {
      logger.debug('[Translation RateLimiter] 触发限流等待', { delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const timestamp = Date.now();
    requestTimestamps.push(timestamp);
    lastRequestTime = timestamp;
  }

  function acquire() {
    queue = queue.then(schedule).catch((error) => {
      logger.warn('[Translation RateLimiter] 计划执行失败', { error: error?.message });
      throw error;
    });
    return queue;
  }

  return { acquire };
}

const requestRateLimiter = createRateLimiter({
  minIntervalMs: Math.max(0, config.translation.minRequestIntervalMs ?? 0),
  maxRequestsPerMinute: Math.max(0, config.translation.maxRequestsPerMinute ?? 0)
});

const DEFAULT_OPTIONS = {
  maxRetries: 2,
  retryDelay: 1000,
  maxRetryDelay: 10000,
  useExponentialBackoff: true,
  cache: null,
  cacheTTL: 3600,
  deduplicate: null,
  fallbacks: []
};

function buildCacheKey(text, targetLang, systemPrompt, extras = {}) {
  const base = `${targetLang}::${systemPrompt}::${text}`;
  const entries = Object.entries(extras || {});

  if (!entries.length) {
    return base;
  }

  const extrasKey = entries
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('|');

  return `${base}::${extrasKey}`;
}

async function delay(ms) {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetry(result) {
  if (!result || result.success) return false;
  if (result.retryable === false) return false;

  const error = result.originalError;
  const message = result.error || '';

  return (
    error?.name === 'AbortError' ||
    error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message.includes('fetch failed') ||
    message.includes('超时') ||
    message.includes('网络') ||
    message.includes('429')
  );
}

function normalizeResponse(result, context = {}) {
  if (!result) {
    return {
      success: false,
      text: context.text,
      error: '未知翻译错误',
      isOriginal: true,
      language: context.targetLang
    };
  }

  return {
    success: result.success,
    text: result.text,
    error: result.error,
    isOriginal: result.isOriginal,
    language: result.language || context.targetLang,
    tokenLimit: result.tokenLimit,
    raw: result,
    meta: result.meta
  };
}

/**
 * 创建轻量级内存缓存
 * @param {Object} options
 * @param {number} options.ttlSeconds 缓存超时时长
 * @param {number} options.cleanupIntervalSeconds 清理间隔
 * @param {number} options.maxEntries 最大缓存条目数
 */
export function createInMemoryCache({ ttlSeconds = 3600, cleanupIntervalSeconds = 300, maxEntries = 1000 } = {}) {
  const store = new Map();
  let hits = 0;
  let misses = 0;

  function get(key) {
    const entry = store.get(key);
    if (!entry) {
      misses += 1;
      return null;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      store.delete(key);
      misses += 1;
      return null;
    }

    hits += 1;
    return entry.value;
  }

  function set(key, value, ttl = ttlSeconds) {
    const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : null;
    store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });

    if (store.size > maxEntries) {
      const entries = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      const overflow = entries.slice(0, store.size - maxEntries);
      for (const [overflowKey] of overflow) {
        store.delete(overflowKey);
      }
    }
  }

  function remove(key) {
    return store.delete(key);
  }

  function clear() {
    store.clear();
  }

  function cleanup() {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }

  if (cleanupIntervalSeconds > 0) {
    const timer = setInterval(cleanup, cleanupIntervalSeconds * 1000);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  function stats() {
    const total = hits + misses;
    return {
      size: store.size,
      hits,
      misses,
      hitRate: total ? hits / total : 0
    };
  }

  return {
    get,
    set,
    delete: remove,
    clear,
    cleanup,
    stats
  };
}

/**
 * 创建请求去重器，确保相同请求只会执行一次
 * @param {Object} options
 * @param {number} options.maxInFlight 最大并发中的请求数
 */
export function createRequestDeduplicator({ maxInFlight = 500 } = {}) {
  const inFlight = new Map();

  async function run(key, factory) {
    if (!key) {
      return factory();
    }

    const existing = inFlight.get(key);
    if (existing) {
      existing.refCount += 1;
      return existing.promise;
    }

    const entry = {
      createdAt: Date.now(),
      refCount: 1,
      promise: Promise.resolve().then(factory)
    };

    entry.promise = entry.promise.finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, entry);

    if (inFlight.size > maxInFlight) {
      const oldest = [...inFlight.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) {
        inFlight.delete(oldest[0]);
      }
    }

    return entry.promise;
  }

  function clear() {
    inFlight.clear();
  }

  function size() {
    return inFlight.size;
  }

  return {
    run,
    clear,
    size
  };
}

async function fetchTranslation({ text, targetLang, systemPrompt, options, context }) {
  await requestRateLimiter.acquire();

  const headers = createAPIHeaders();
  const transformedText = text ?? '';
  const modelToUse = options.model || PRICING_CONFIG.GPT_MODEL_NAME;

  const dynamicMaxTokens = options.maxTokens || calculateDynamicTokenLimit(transformedText, targetLang);
  const estimatedInputTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(transformedText, targetLang);
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

  const requestBody = createTranslationRequestBody(transformedText, targetLang, systemPrompt, safeMaxTokens);

  const controller = new AbortController();
  const timeout = options.timeout ?? config.translation.timeout ?? 45000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${config.translation.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const result = await parseAPIResponse(response, {
      textLength: transformedText.length,
      targetLang,
      model: modelToUse,
      maxTokens: safeMaxTokens,
      ...context
    });

    const translatedText = extractTranslationFromResponse(result);

    return {
      success: true,
      text: translatedText,
      isOriginal: false,
      language: targetLang,
      tokenLimit: safeMaxTokens,
      meta: {
        modelUsed: modelToUse,
        isFallbackModel: modelToUse !== PRICING_CONFIG.GPT_MODEL_NAME
      }
    };
  } catch (error) {
    clearTimeout(timeoutId);

    let errorMessage = '未知翻译错误';
    if (error.name === 'AbortError') {
      errorMessage = '翻译API调用超时，请检查网络连接或稍后重试';
    } else if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message?.includes('fetch failed')) {
      errorMessage = '无法连接到翻译服务，请检查网络连接或API配置';
    } else if (error.message?.includes('401') || error.message?.includes('403')) {
      errorMessage = 'API密钥无效或权限不足';
    } else if (error.message?.includes('429')) {
      errorMessage = 'API调用频率限制，请稍后重试';
    } else if (error.message?.includes('500')) {
      errorMessage = '翻译服务内部错误，请稍后重试';
    } else {
      errorMessage = error.message || errorMessage;
    }

    return {
      success: false,
      text: transformedText,
      error: errorMessage,
      isOriginal: true,
      originalError: error,
      meta: {
        modelUsed: modelToUse,
        isFallbackModel: modelToUse !== PRICING_CONFIG.GPT_MODEL_NAME
      }
    };
  }
}

function normalizeFallbackDefinitions(fallbacks = []) {
  return fallbacks
    .map((entry, index) => {
      if (!entry) return null;

      if (typeof entry === 'function') {
        return {
          name: entry.name || `fallback_${index + 1}`,
          type: 'handler',
          handler: entry,
          index,
          isFallback: true
        };
      }

      const {
        name,
        handler,
        prepare,
        buildRequest,
        strategy,
        systemPrompt,
        text,
        targetLang,
        context,
        extras,
        optionsOverride,
        cacheKeyExtras,
        skipCache,
        skipDeduplicate,
        cacheTTL
      } = entry;

      const resolvedName = name || `fallback_${index + 1}`;

      if (typeof handler === 'function') {
        return {
          name: resolvedName,
          type: 'handler',
          handler,
          index,
          isFallback: true
        };
      }

      const requestBuilder = typeof prepare === 'function'
        ? prepare
        : (typeof buildRequest === 'function' ? buildRequest : null);

      if (requestBuilder) {
        return {
          name: resolvedName,
          type: 'api',
          prepare: requestBuilder,
          optionsOverride,
          cacheKeyExtras,
          skipCache,
          skipDeduplicate,
          cacheTTL,
          index,
          isFallback: true
        };
      }

      if (strategy || systemPrompt || text || targetLang || context || extras || optionsOverride) {
        const staticRequest = {
          strategy,
          systemPrompt,
          text,
          targetLang,
          context,
          extras,
          optionsOverride,
          cacheKeyExtras,
          skipCache,
          skipDeduplicate,
          cacheTTL
        };

        return {
          name: resolvedName,
          type: 'api',
          prepare: () => staticRequest,
          optionsOverride,
          cacheKeyExtras,
          skipCache,
          skipDeduplicate,
          cacheTTL,
          index,
          isFallback: true
        };
      }

      return null;
    })
    .filter(Boolean);
}

function createPrimaryStep({ strategy, text, targetLang, systemPrompt, context, extras = {} }) {
  return {
    name: strategy,
    type: 'api',
    request: {
      text,
      targetLang,
      systemPrompt,
      context,
      strategy,
      extras
    },
    index: -1,
    isFallback: false
  };
}

export class TranslationAPIClient {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    };

    this.cache = this.options.cache;
    this.cacheTTL = this.options.cacheTTL ?? DEFAULT_OPTIONS.cacheTTL;
    this.deduplicator = this.options.deduplicate;
    this.defaultFallbacks = Array.isArray(this.options.fallbacks) ? this.options.fallbacks : [];
  }

  async execute({ text, targetLang, systemPrompt, context = {}, strategy = 'primary', fallbacks = [], extras = {} }) {
    const startTime = Date.now();
    const basePayload = {
      text,
      targetLang,
      systemPrompt,
      context
    };

    // 构建 Fallback 策略链
    const defaultFallbacks = [];

    // 如果启用了自动 Fallback 且当前不是在重试 Fallback 本身
    if (PRICING_CONFIG.FALLBACK_ENABLED && strategy === 'primary') {
      defaultFallbacks.push({
        name: 'gpt-4o-fallback',
        type: 'api',
        optionsOverride: {
          model: PRICING_CONFIG.FALLBACK_MODEL_NAME,
          maxRetries: 1 // Fallback 仅重试一次
        }
      });
    }

    const steps = [
      createPrimaryStep({ strategy, text, targetLang, systemPrompt, context, extras }),
      ...normalizeFallbackDefinitions([...defaultFallbacks, ...this.defaultFallbacks, ...fallbacks])
    ];

    let totalRetries = 0;
    let fromCache = false;
    let usedFallback = null;
    let finalResult = null;
    let lastOutcome = null;
    let lastStepName = strategy;

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      let outcome;

      if (step.type === 'handler') {
        outcome = await this.#executeHandlerStep(step, basePayload, lastOutcome);
      } else {
        outcome = await this.#executeApiStep(step, basePayload, lastOutcome);
      }

      if (outcome.skipped) {
        continue;
      }

      lastOutcome = outcome;
      lastStepName = step.name;
      totalRetries += outcome.attemptCount ?? 0;

      if (outcome.fromCache) {
        fromCache = true;
        finalResult = outcome.result;
        if (step.isFallback) {
          usedFallback = { name: step.name, index: step.index };
        }
        break;
      }

      if (outcome.result?.success) {
        finalResult = outcome.result;
        if (step.isFallback) {
          usedFallback = { name: step.name, index: step.index };
        }
        break;
      }

      if (i < steps.length - 1) {
        const nextStep = steps[i + 1];
        logger.warn('翻译策略失败，准备尝试降级', {
          previousStrategy: step.name,
          nextStrategy: nextStep.name,
          targetLang,
          error: outcome.result?.error
        });
      }
    }

    if (!finalResult) {
      finalResult = lastOutcome?.result ?? normalizeResponse(null, { text, targetLang });
    }

    const duration = Date.now() - startTime;
    const finalStrategyName = usedFallback ? usedFallback.name : lastStepName;
    const { meta: resultMeta, ...resultWithoutMeta } = finalResult;

    const meta = {
      ...(resultMeta || {}),
      strategy: finalStrategyName,
      originStrategy: strategy,
      cached: fromCache,
      retries: totalRetries,
      duration
    };

    if (usedFallback) {
      meta.fallback = {
        name: usedFallback.name,
        index: usedFallback.index,
        chain: `${strategy}->${usedFallback.name}`
      };
      logger.warn('[Translation] Fallback model used', {
        targetLang,
        strategyChain: meta.fallback.chain,
        modelUsed: resultWithoutMeta?.meta?.modelUsed || PRICING_CONFIG.FALLBACK_MODEL_NAME
      });
    } else if (resultWithoutMeta?.meta?.modelUsed) {
      logger.debug('[Translation] Primary model used', {
        targetLang,
        modelUsed: resultWithoutMeta.meta.modelUsed
      });
    }

    return {
      ...resultWithoutMeta,
      meta
    };
  }

  async #executeApiStep(step, basePayload, previousOutcome) {
    let requestConfig = step.request;

    if (!requestConfig && typeof step.prepare === 'function') {
      try {
        requestConfig = step.prepare({
          ...basePayload,
          lastResult: previousOutcome?.result,
          lastRaw: previousOutcome?.raw,
          attemptCount: previousOutcome?.attemptCount ?? 0
        });
      } catch (error) {
        logger.error('降级策略构建失败', {
          strategy: step.name,
          error: error.message
        });
        return {
          result: normalizeResponse(null, { text: basePayload.text, targetLang: basePayload.targetLang }),
          raw: null,
          duration: 0,
          attemptCount: 0,
          fromCache: false,
          cacheKey: null,
          strategyName: step.name
        };
      }
    }

    if (!requestConfig) {
      return { skipped: true };
    }

    const textToUse = requestConfig.text ?? basePayload.text;
    const targetLangToUse = requestConfig.targetLang ?? basePayload.targetLang;
    const systemPromptToUse = requestConfig.systemPrompt ?? basePayload.systemPrompt;
    const strategyName = requestConfig.strategy || step.name || 'fallback';

    const contextToUse = {
      ...basePayload.context,
      ...(requestConfig.context || {}),
      strategy: strategyName
    };

    const cacheKeyExtras = {
      strategy: strategyName,
      ...(requestConfig.extras || {}),
      ...(step.cacheKeyExtras || {}),
      ...(requestConfig.cacheKeyExtras || {})
    };

    const skipCache = Boolean(requestConfig.skipCache ?? step.skipCache);
    const cacheKey = this.cache && !skipCache
      ? buildCacheKey(textToUse, targetLangToUse, systemPromptToUse, cacheKeyExtras)
      : null;

    if (cacheKey && this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.debug('命中翻译缓存', { strategy: strategyName, targetLang: targetLangToUse, cacheKey });
        const normalized = normalizeResponse(cached, { text: textToUse, targetLang: targetLangToUse });
        return {
          result: normalized,
          raw: cached,
          duration: 0,
          attemptCount: 0,
          fromCache: true,
          cacheKey,
          strategyName
        };
      }
    }

    const dedupeEnabled = !(requestConfig.skipDeduplicate ?? step.skipDeduplicate);
    const dedupeKey = dedupeEnabled && this.deduplicator
      ? buildCacheKey(textToUse, targetLangToUse, systemPromptToUse, { ...cacheKeyExtras, dedupe: true })
      : null;

    const callOptions = {
      ...this.options,
      ...(step.optionsOverride || {}),
      ...(requestConfig.optionsOverride || {})
    };

    const maxRetries = Number.isInteger(callOptions.maxRetries) ? callOptions.maxRetries : this.options.maxRetries;
    const retryDelay = callOptions.retryDelay ?? this.options.retryDelay;
    const useExponentialBackoff = callOptions.useExponentialBackoff ?? this.options.useExponentialBackoff;
    const maxRetryDelay = callOptions.maxRetryDelay ?? this.options.maxRetryDelay ?? DEFAULT_OPTIONS.maxRetryDelay;
    const cacheTTL = requestConfig.cacheTTL ?? step.cacheTTL ?? callOptions.cacheTTL ?? this.cacheTTL;

    const { cache: _unusedCache, deduplicate: _unusedDeduplicate, fallbacks: _unusedFallbacks, ...apiOptions } = callOptions;

    const start = Date.now();
    let retries = 0;
    let lastRawResult = null;
    let lastResult = null;

    while (true) {
      const call = () => fetchTranslation({
        text: textToUse,
        targetLang: targetLangToUse,
        systemPrompt: systemPromptToUse,
        options: {
          ...apiOptions,
          // 优先使用策略指定的模型，否则使用配置的主模型
          model: requestConfig.model || PRICING_CONFIG.GPT_MODEL_NAME
        },
        context: contextToUse
      });

      const rawResult = dedupeKey ? await this.deduplicator.run(dedupeKey, call) : await call();
      lastRawResult = rawResult;
      lastResult = normalizeResponse(rawResult, { text: textToUse, targetLang: targetLangToUse });

      if (!shouldRetry(rawResult) || retries >= maxRetries) {
        break;
      }

      const nextAttempt = retries + 1;
      const delayMs = useExponentialBackoff
        ? Math.min(retryDelay * Math.pow(2, nextAttempt - 1), maxRetryDelay)
        : retryDelay;

      logger.warn('翻译调用失败，准备重试', {
        strategy: strategyName,
        attempt: nextAttempt,
        maxRetries,
        delay: delayMs,
        error: lastResult.error
      });

      retries = nextAttempt;
      await delay(delayMs);
    }

    const duration = Date.now() - start;

    if (!lastResult) {
      lastResult = normalizeResponse(null, { text: textToUse, targetLang: targetLangToUse });
    }

    if (cacheKey && this.cache && lastResult.success) {
      await this.cache.set(cacheKey, { ...lastResult }, cacheTTL);
    }

    return {
      result: lastResult,
      raw: lastRawResult,
      duration,
      attemptCount: retries,
      fromCache: false,
      cacheKey,
      strategyName
    };
  }

  async #executeHandlerStep(step, basePayload, previousOutcome) {
    const start = Date.now();

    let rawResult;
    try {
      rawResult = await step.handler({
        ...basePayload,
        lastResult: previousOutcome?.result,
        lastRaw: previousOutcome?.raw,
        attemptCount: previousOutcome?.attemptCount ?? 0
      });
    } catch (error) {
      logger.error('降级处理函数执行失败', {
        strategy: step.name,
        error: error.message
      });
      rawResult = {
        success: false,
        text: basePayload.text,
        error: error.message,
        isOriginal: true
      };
    }

    if (rawResult == null) {
      return { skipped: true };
    }

    const normalized = normalizeResponse(rawResult, {
      text: basePayload.text,
      targetLang: basePayload.targetLang
    });

    const duration = Date.now() - start;

    return {
      result: normalized,
      raw: rawResult,
      duration,
      attemptCount: rawResult?.meta?.retries ?? 0,
      fromCache: false,
      cacheKey: null,
      strategyName: step.name
    };
  }
}

export function createTranslationAPIClient(options = {}) {
  return new TranslationAPIClient(options);
}
