import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../app/utils/logger.server.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logTranslationSuccess: vi.fn()
  },
  translationLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  createTranslationLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('../../app/services/translation/config-check.server.js', () => ({
  validateTranslationConfig: vi.fn(async () => ({ valid: true, apiKeyConfigured: true, apiConnectable: true })),
  getTranslationServiceStatus: vi.fn(async () => ({ status: 'healthy' }))
}));

vi.mock('../../app/services/translation/api-client.server.js', () => ({
  createTranslationAPIClient: () => ({
    execute: vi.fn(async ({ text }) => ({
      success: true,
      text: `[tx:${text}]`,
      meta: { duration: 5 }
    }))
  }),
  createInMemoryCache: () => ({ stats: () => ({}) }),
  createRequestDeduplicator: () => ({ size: () => 0 })
}));

vi.mock('../../app/services/translation/chunking.server.js', () => ({
  chunkText: (text: string) => [text],
  isLikelyHtml: (text: string) => text.includes('<')
}));

vi.mock('../../app/services/translation/html-handler.server.js', () => ({
  protectHtmlTags: (text: string) => ({ text: `__HTML__${text}__HTML__`, tagMap: new Map() }),
  restoreHtmlTags: (text: string) => text.replace(/__HTML__/g, '')
}));

vi.mock('../../app/services/translation/post-processors.server.js', () => ({
  applyPostProcessors: vi.fn(async (text: string) => text)
}));

vi.mock('../../app/services/translation/post-processor-rules.server.js', () => ({
  checkBrandWords: (text: string) => ({ shouldSkip: /brand/i.test(text), reason: 'brand_word' }),
  handlePlaceholderFallback: vi.fn(async ({ translatedText }) => ({
    handled: translatedText === '__PROTECTED__',
    result: { success: true, text: 'placeholder-fallback', isOriginal: true }
  })),
  placeholderFallbackStats: new Map(),
  isBrandWord: () => false,
  SKIP_BRAND_CHECK_FIELDS: []
}));

vi.mock('../../app/services/translation/metrics.server.js', () => ({
  recordTranslationCall: vi.fn(),
  getTranslationMetrics: vi.fn(() => ({}))
}));

vi.mock('../../app/services/translation/validators.server.js', () => ({
  evaluateTranslationQuality: () => ({ isValid: true, events: [], records: [] }),
  evaluateCompleteness: () => ({ isComplete: true, reason: 'ok', events: [] })
}));

vi.mock('../../app/services/translation/prompts.server.js', () => ({
  buildEnhancedPrompt: () => 'enhanced',
  buildSimplePrompt: () => 'simple',
  getLanguageName: (lang: string) => lang
}));

vi.mock('../../app/services/translation/strategy-orchestrator.server.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/services/translation/strategy-orchestrator.server.js')>();
  return {
    ...actual,
    translateTextWithFallbackOrchestrated: vi.fn(async (text: string, targetLang: string) => ({
      success: true,
      text: `[fallback:${text}]`,
      language: targetLang
    }))
  };
});

vi.mock('../../app/services/translation/enhanced-strategy.server.js', () => ({
  translateTextEnhancedStrategy: vi.fn(async (text: string, targetLang: string) => ({
    success: true,
    text: `[enhanced:${text}]`,
    language: targetLang
  }))
}));

vi.mock('../../app/services/translation/long-text-strategy.server.js', () => ({
  translateLongTextStrategy: vi.fn(async (text: string, targetLang: string) => ({
    success: true,
    text: `[long:${text}]`,
    language: targetLang
  }))
}));

vi.mock('../../app/services/translation/resource-translator.server.js', () => ({
  translateResource: vi.fn()
}));

const { translateText } = await import('../../app/services/translation/core.server.js');

describe('translation orchestrator integration (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips brand words', async () => {
    const res = await translateText('Brand protected', 'zh-CN');
    expect(res.skipped).toBe(true);
    expect(res.text).toBe('Brand protected');
  });

  it('uses enhanced strategy by default', async () => {
    const res = await translateText('hello', 'ja');
    expect(res.text).toBe('[enhanced:hello]');
  });

  it('routes long html to long-html strategy', async () => {
    const longHtml = '<div>' + 'x'.repeat(1600) + '</div>';
    const res = await translateText(longHtml, 'fr');
    expect(res.text.startsWith('[long:')).toBe(true);
  });

  it('handles placeholder fallback', async () => {
    const { translateTextWithFallbackOrchestrated } = await import('../../app/services/translation/strategy-orchestrator.server.js');
    (translateTextWithFallbackOrchestrated as any).mockResolvedValueOnce({
      success: true,
      text: '__PROTECTED__',
      language: 'en'
    });
    const res = await translateText('config_key', 'en', { allowSimplePrompt: true });
    expect(res.text).toBe('placeholder-fallback');
  });
});
