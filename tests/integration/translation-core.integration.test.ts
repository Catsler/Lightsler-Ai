import { describe, it, expect, vi, beforeEach } from 'vitest';

const translationResponses: any[] = [];

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  logTranslationStart: vi.fn(),
  logTranslationSuccess: vi.fn(),
  logTranslationFailure: vi.fn()
};

vi.mock('../../app/services/translation/api-client.server.js', () => {
  return {
    createInMemoryCache: vi.fn(() => ({
      get: () => null,
      set: () => {},
      clear: () => {}
    })),
    createRequestDeduplicator: vi.fn(() => ({
      run: (_key: string, factory: () => Promise<any>) => factory()
    })),
    createTranslationAPIClient: vi.fn(() => ({
      execute: vi.fn(async () => {
        if (translationResponses.length === 0) {
          return { success: true, text: '[DEFAULT]', meta: { duration: 10 } };
        }
        const next = translationResponses.shift();
        return typeof next === 'function' ? next() : next;
      })
    }))
  };
});

vi.mock('../../app/services/hooks-manager.server.js', () => ({
  shouldTranslate: vi.fn(async () => true),
  schedule: vi.fn(async (task: () => Promise<any>) => task()),
  validate: vi.fn(async () => ({ valid: true }))
}));

vi.mock('../../app/services/translation/post-processors.server.js', () => ({
  applyPostProcessors: vi.fn(async (text: string) => text)
}));

vi.mock('../../app/services/translation/prompts.server.js', () => ({
  buildEnhancedPrompt: () => 'prompt',
  buildSimplePrompt: () => 'prompt',
  buildConfigKeyPrompt: () => 'prompt',
  getLanguageName: () => 'Chinese'
}));

vi.mock('../../app/services/quality-error-analyzer.server.js', () => ({
  qualityErrorAnalyzer: { analyze: () => ({ issues: [], suggestions: [] }) }
}));

vi.mock('../../app/services/error-collector.server.js', () => ({
  collectError: vi.fn(async () => {}),
  ERROR_TYPES: {
    TRANSLATION: 'TRANSLATION'
  }
}));

vi.mock('../../app/utils/logger.server.js', () => ({
  logger: noopLogger,
  validationLogger: noopLogger,
  apiLogger: noopLogger,
  billingLogger: noopLogger,
  translationLogger: noopLogger,
  createTranslationLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logTranslationSuccess: vi.fn(),
    logTranslationFailure: vi.fn()
  }),
  logShortTextTranslation: vi.fn(),
  logTranslationQuality: vi.fn(),
  logEnglishRemnants: vi.fn(),
  memoryLogReader: {
    getRecent: vi.fn(() => [])
  },
  persistentLogReader: vi.fn(async () => []),
  forceFlushPersistentLogs: vi.fn(),
  persistenceConfig: { enabled: false }
}));

vi.mock('../../app/services/theme-translation.server.js', () => ({
  translateThemeResource: vi.fn(async () => ({ skipped: false })),
  translateThemeJsonData: vi.fn(async () => ({}))
}));

const {
  translateTextEnhanced,
  getPlaceholderErrorStats
} = await import('../../app/services/translation/core.server.js');

describe('translation-core integration', () => {
  beforeEach(() => {
    translationResponses.length = 0;
  });

  it('returns translated text when API succeeds', async () => {
    translationResponses.push({ success: true, text: '你好，世界', meta: { duration: 42 } });

    const result = await translateTextEnhanced('Hello world', 'zh-CN');

    expect(result.success).toBe(true);
    expect(result.text).toBe('你好，世界');
    expect(result.language).toBe('zh-CN');
    expect(typeof result.processingTime).toBe('number');
    expect(result.processingTime).toBeGreaterThanOrEqual(0);
  });

  it('falls back when API outputs placeholder token', async () => {
    translationResponses.push({ success: true, text: '__PROTECTED_FAKE__', meta: { duration: 5 } });

    const result = await translateTextEnhanced('Config_KEY_NAME', 'zh-CN');

    expect(result.success).toBe(true);
    expect(result.isOriginal).toBe(true);
    expect(result.text).toBe('Config_KEY_NAME');
    expect(result.fallback).toBe('placeholder_error');

    const stats = getPlaceholderErrorStats();
    expect(stats.byLanguage['zh-CN']).toBeGreaterThanOrEqual(1);
  });
});
