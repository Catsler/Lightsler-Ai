/* global globalThis */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.GPT_API_KEY = 'test-key';

const translationResponses = new Map();
const memoryLogStore = [];
let persistentLogStore = [];
const persistenceConfigExport = { enabled: false };
const collectedErrors = [];
const simplePromptFailureKeywords = new Set();

globalThis.fetch = async (_url, options = {}) => {
  const body = typeof options.body === 'string' ? options.body : '';
  const shouldFail = Array.from(simplePromptFailureKeywords).some(keyword => body.includes(keyword));

  if (shouldFail) {
    const failureText = JSON.stringify({ error: 'unauthorized' });
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
      text: async () => failureText
    };
  }

  const payload = {
    choices: [
      {
        message: { content: '[stubbed-response]' }
      }
    ],
    usage: { total_tokens: 200 }
  };

  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
};

const baseLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  log: () => {},
  logTranslationStart: () => {},
  logTranslationSuccess: (_text, _translated, context = {}) => {
    memoryLogStore.unshift({
      id: `mem-${Date.now()}`,
      timestamp: new Date(),
      level: 'info',
      category: 'TRANSLATION',
      message: '翻译完成',
      data: { success: true, durationMs: context.processingTime ?? 0 }
    });
  },
  logTranslationFailure: (_text, error) => {
    memoryLogStore.unshift({
      id: `mem-${Date.now()}`,
      timestamp: new Date(),
      level: 'error',
      category: 'TRANSLATION',
      message: '翻译失败',
      data: { error }
    });
  }
};

await mock.module('../../app/utils/logger.server.js', {
  namedExports: {
    logger: baseLogger,
    apiLogger: baseLogger,
    validationLogger: baseLogger,
    logShortTextTranslation: () => {},
    logTranslationQuality: () => {},
    logEnglishRemnants: () => {},
    createTranslationLogger: () => baseLogger,
    memoryLogReader: {
      getRecent: ({ limit = memoryLogStore.length }) => memoryLogStore.slice(0, limit)
    },
    persistentLogReader: async () => persistentLogStore,
    forceFlushPersistentLogs: async () => {},
    persistenceConfig: persistenceConfigExport,
    translationLogger: baseLogger
  }
});

await mock.module('../../app/services/error-collector.server.js', {
  namedExports: {
    collectError: async entry => {
      collectedErrors.push(entry);
    },
    ERROR_TYPES: {
      API: 'API',
      DB: 'DB',
      VALIDATION: 'VALIDATION',
      NETWORK: 'NETWORK',
      UI: 'UI',
      QUEUE: 'QUEUE',
      GRAPHQL: 'GRAPHQL',
      TRANSLATION: 'TRANSLATION',
      SHOPIFY: 'SHOPIFY',
      AUTH: 'AUTH',
      SYSTEM: 'SYSTEM'
    },
    __getCollectedErrors: () => collectedErrors
  }
});

await mock.module('../../app/utils/api.server.js', {
  namedExports: {
    makeTranslationAPICall: async () => ({ success: true, text: 'ok', tokenLimit: 1000 }),
    makeTranslationAPICallWithRetry: async (text, targetLang) => {
      const keysToTry = [text, `${targetLang}:${text}`];
      for (const key of keysToTry) {
        if (translationResponses.has(key)) {
          const response = translationResponses.get(key);
          if (typeof response === 'function') {
            return await response({ text, targetLang });
          }
          if (typeof response === 'string') {
            return { success: true, text: response, tokenLimit: 1000 };
          }
          return response;
        }
      }
      return { success: true, text: `[${targetLang}] ${text}`, tokenLimit: 1000 };
    }
  }
});

await mock.module('../../app/services/quality-error-analyzer.server.js', {
  namedExports: {
    qualityErrorAnalyzer: {
      analyze: () => ({ issues: [], suggestions: [] })
    }
  }
});

await mock.module('../../app/services/memory-cache.server.js', {
  namedExports: {
    getCachedTranslation: async () => null,
    setCachedTranslation: async () => {},
    getMemoryCache: () => ({
      get: () => null,
      set: () => {},
      getStats: () => ({ hits: 0, misses: 0 })
    })
  }
});

await mock.module('../../app/services/sequential-thinking-core.server.js', {
  namedExports: {
    DecisionEngine: class {
      evaluate() {
        return { shouldProceed: true };
      }
    },
    TranslationScheduler: class {
      async scheduleTranslation(resources) {
        return { schedule: [], batches: [resources], skipped: [], analysis: {} };
      }
    },
    OptimizationAnalyzer: class {}
  }
});

const translationModule = await import('../../app/services/translation.server.js');
const {
  isBrandWord,
  translateText,
  translateTextEnhanced,
  batchTranslateTexts,
  validateTranslation,
  getTranslationStats,
  getTranslationLogs
} = translationModule;

const { config } = await import('../../app/utils/config.server.js');
const errorCollectorModule = await import('../../app/services/error-collector.server.js');
const getCollectedErrors = errorCollectorModule.__getCollectedErrors;

const resetState = () => {
  translationResponses.clear();
  memoryLogStore.length = 0;
  persistentLogStore = [];
  collectedErrors.length = 0;
  simplePromptFailureKeywords.clear();
  persistenceConfigExport.enabled = false;
  config.translation.apiKey = 'test-key';
  config.translation.delayMs = 0;
  config.translation.longTextThreshold = 1500;
};

resetState();

test.beforeEach(() => {
  resetState();
});

// --- Individual scenarios ---

test('isBrandWord identifies known brand tokens', () => {
  assert.equal(isBrandWord('apple'), true);
});

test('isBrandWord returns false for generic words', () => {
  assert.equal(isBrandWord('example'), false);
});

test('translateTextEnhanced returns original text for blank input', async () => {
  const result = await translateTextEnhanced('   ', 'zh-CN');
  assert.equal(result.success, true);
  assert.equal(result.isOriginal, true);
  assert.equal(result.text, '   ');
});

test('translateTextEnhanced reports config error when API key missing', async () => {
  config.translation.apiKey = undefined;
  const result = await translateTextEnhanced('Hello world', 'zh-CN');
  assert.equal(result.success, false);
  assert.equal(result.isOriginal, true);
  assert.ok(result.error.toLowerCase().includes('配置'));
});

test('translateTextEnhanced returns stubbed translation when API succeeds', async () => {
  translationResponses.set('Hello world', '你好，世界');
  const result = await translateTextEnhanced('Hello world', 'zh-CN');
  assert.equal(result.success, true);
  assert.equal(result.text, '你好，世界');
  assert.equal(result.language, 'zh-CN');
});

test('translateTextEnhanced treats TEXT_TOO_LONG response on short text as failure', async () => {
  translationResponses.set('short case', 'TEXT_TOO_LONG');
  const result = await translateTextEnhanced('short case', 'zh-CN');
  assert.equal(result.success, false);
  assert.ok(result.error.includes('短文本'));
});

test('translateTextEnhanced flags placeholder-only responses', async () => {
  translationResponses.set('placeholder scenario', '__PROTECTED_FAKE__');
  const result = await translateTextEnhanced('placeholder scenario', 'zh-CN');
  assert.equal(result.success, false);
  assert.equal(result.isOriginal, true);
});

test('translateTextEnhanced rejects translations that are too short for long inputs', async () => {
  const original = 'A'.repeat(200);
  translationResponses.set(original, '短');
  const result = await translateTextEnhanced(original, 'zh-CN');
  assert.equal(result.success, false);
  assert.equal(result.isOriginal, true);
});

test('translateText returns translated text when fallback succeeds', async () => {
  translationResponses.set('Simple success', '简单成功');
  const result = await translateText('Simple success', 'zh-CN');
  assert.equal(result, '简单成功');
});

test('translateText throws when translation returns original content', async () => {
  translationResponses.set('SameCase', 'SameCase');
  await assert.rejects(() => translateText('SameCase', 'zh-CN'), error => {
    assert.equal(error.code, 'TRANSLATION_NOT_EFFECTIVE');
    return true;
  });
});

test('translateText throws when fallback returns failure response', async () => {
  simplePromptFailureKeywords.add('Forced failure');
  translationResponses.set('Forced failure', { success: false, error: 'forced failure', isOriginal: true });
  await assert.rejects(() => translateText('Forced failure', 'zh-CN'), error => {
    assert.equal(error.code, 'TRANSLATION_FAILED');
    return true;
  });
});

test('batchTranslateTexts preserves originals when individual translation fails', async () => {
  simplePromptFailureKeywords.add('Batch-2');
  translationResponses.set('Batch-1', '批量一');
  translationResponses.set('Batch-2', { success: false, error: 'fail', isOriginal: true });
  translationResponses.set('Batch-3', '批量三');
  const result = await batchTranslateTexts(['Batch-1', 'Batch-2', 'Batch-3'], 'zh-CN');
  assert.deepEqual(result, ['批量一', 'Batch-2', '批量三']);
});

test('validateTranslation returns false for empty translation', async () => {
  const isValid = await validateTranslation('Hello', '', 'zh-CN');
  assert.equal(isValid, false);
  assert.ok(getCollectedErrors().some(entry => entry?.errorCode === 'EMPTY_TRANSLATION'));
});

test('validateTranslation returns false when translation matches original', async () => {
  const isValid = await validateTranslation('Hello world', 'Hello world', 'zh-CN');
  assert.equal(isValid, false);
});

test('validateTranslation accepts translated Chinese content', async () => {
  const isValid = await validateTranslation('Lightweight hammock', '轻量吊床', 'zh-CN');
  assert.equal(isValid, true);
});

test('validateTranslation rejects translations lacking target language characters', async () => {
  const isValid = await validateTranslation('Lightweight hammock', 'Lightweight hammock translated', 'zh-CN');
  assert.equal(isValid, false);
});

test('validateTranslation accepts short translations with target language characters', async () => {
  const isValid = await validateTranslation('Size', '尺寸', 'zh-CN');
  assert.equal(isValid, true);
});

test('validateTranslation rejects overly short translations for long source text', async () => {
  const original = 'This is a very long marketing description that should not collapse to a tiny fragment.';
  const isValid = await validateTranslation(original, '短句', 'zh-CN');
  assert.equal(isValid, false);
});

test('validateTranslation tolerates missing brand words as warning', async () => {
  const isValid = await validateTranslation('Onewind hammock', '轻量吊床', 'zh-CN');
  assert.equal(isValid, true);
});

test('getTranslationStats aggregates recent memory logs', () => {
  memoryLogStore.push({
    id: '1',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    level: 'info',
    category: 'TRANSLATION',
    message: '翻译完成',
    data: { success: true, durationMs: 120 }
  });
  memoryLogStore.push({
    id: '2',
    timestamp: new Date('2024-01-01T00:01:00Z'),
    level: 'error',
    category: 'TRANSLATION',
    message: '翻译失败',
    data: { error: 'boom' }
  });

  const stats = getTranslationStats();
  assert.equal(stats.totalTranslations, 1);
  assert.equal(stats.successfulTranslations, 1);
  assert.equal(stats.failedTranslations, 1);
  assert.equal(stats.averageDuration, 120);
  assert.equal(stats.recentErrors.length, 1);
});

test('getTranslationLogs merges memory and persistent logs respecting limit', async () => {
  memoryLogStore.push({
    id: 'm1',
    timestamp: new Date('2024-01-01T01:00:00Z'),
    level: 'info',
    category: 'TRANSLATION',
    message: '翻译完成',
    data: { success: true }
  });
  persistentLogStore = [{
    id: 'p1',
    timestamp: new Date('2024-01-02T00:00:00Z'),
    level: 'info',
    category: 'TRANSLATION',
    message: '翻译完成',
    context: { success: true },
    durationMs: 150
  }];
  persistenceConfigExport.enabled = true;

  const logs = await getTranslationLogs({ limit: 5 });
  assert.equal(logs.length, 2);
  assert.ok(new Date(logs[0].timestamp) >= new Date(logs[1].timestamp));
});
