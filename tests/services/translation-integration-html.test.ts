import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

const reserveMock = vi.fn(async () => ({ billingEnabled: false }));

vi.mock('../../app/utils/logger.server.js', () => {
  const noop = () => {};
  const logger = { info: vi.fn(noop), warn: vi.fn(noop), error: vi.fn(noop), debug: vi.fn(noop), logTranslationStart: vi.fn(noop) };
  return {
    logger,
    apiLogger: logger,
    validationLogger: logger,
    logShortTextTranslation: vi.fn(),
    logTranslationQuality: vi.fn(),
    logEnglishRemnants: vi.fn(),
    createTranslationLogger: () => logger
  };
});

vi.mock('../../app/services/translation/api-client.server.js', () => ({
  createTranslationAPIClient: () => ({
    execute: vi.fn(async ({ text }) => ({
      success: true,
      text: text.replace('__HTML__', '<b>world</b>'),
      meta: { duration: 5 }
    }))
  }),
  createInMemoryCache: () => ({ stats: () => ({}) }),
  createRequestDeduplicator: () => ({ size: () => 0 })
}));

vi.mock('../../app/services/translation/billing-orchestrator.server.js', () => ({
  shouldEnforceBilling: vi.fn(() => false),
  reserveBillingIfNeeded: (...args) => reserveMock(...args),
  confirmBillingIfNeeded: vi.fn(),
  ensureReservationReleased: vi.fn(),
  handleBillingError: vi.fn()
}));

vi.mock('../../app/services/translation/chunking.server.js', () => ({
  chunkText: (text: string) => [text],
  isLikelyHtml: (text: string) => text.includes('<')
}));

vi.mock('../../app/services/translation/html-handler.server.js', () => {
  return {
    protectHtmlTags: (text: string) => {
      const tagMap = new Map<string, string>();
      let counter = 0;
      const protectedText = text.replace(/<[^>]+>/g, (tag) => {
        const token = `__HTML_${counter++}__`;
        tagMap.set(token, tag);
        return token;
      });
      return { text: protectedText, tagMap };
    },
    restoreHtmlTags: (text: string, tagMap: Map<string, string>) => {
      let restored = text;
      for (const [token, tag] of tagMap.entries()) {
        restored = restored.replace(new RegExp(token, 'g'), tag);
      }
      return restored;
    }
  };
});

vi.mock('../../app/services/translation/post-processors.server.js', () => ({
  applyPostProcessors: vi.fn(async (text: string) => text)
}));

vi.mock('../../app/services/translation/post-processor-rules.server.js', () => ({
  checkBrandWords: () => ({ shouldSkip: false }),
  handlePlaceholderFallback: vi.fn(async () => ({ handled: false, result: null })),
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
  evaluateCompleteness: () => ({ isComplete: true, events: [] })
}));

vi.mock('../../app/services/translation/prompts.server.js', () => ({
  buildEnhancedPrompt: () => 'enhanced',
  buildSimplePrompt: () => 'simple',
  getLanguageName: (lang: string) => lang
}));

// 长文本策略兜底
vi.mock('../../app/services/translation/long-text-strategy.server.js', () => ({
  translateLongTextStrategy: vi.fn(async (text: string, targetLang: string) => ({
    success: true,
    text: `[long-html]${text.length}`,
    language: targetLang
  }))
}));

// 简化增强策略，避免依赖 executeTranslationRequest
vi.mock('../../app/services/translation/enhanced-strategy.server.js', () => ({
  translateTextEnhancedStrategy: vi.fn(async (text: string, targetLang: string) => ({
    success: true,
    text: text,
    language: targetLang
  }))
}));

// 避免 theme 模块循环检查报错
vi.mock('../../app/services/theme-translation.server.js', () => ({
  translateThemeResource: vi.fn(async () => ({ skipped: false }))
}));

beforeAll(() => {
  process.env.GPT_API_KEY = 'dummy';
});

const { translateText } = await import('../../app/services/translation/core.server.js');

describe('translation integration - HTML & Liquid', () => {
  beforeEach(() => {
    reserveMock.mockClear();
  });

  it('preserves HTML tags after protect/restore', async () => {
    const res = await translateText('<p>Hello <b>world</b></p>', 'ja');
    const text = typeof res === 'string' ? res : res.text;
    expect(typeof text).toBe('string');
    expect(text).toContain('<b>world</b>');
  });

  it('keeps Liquid placeholders intact', async () => {
    const res = await translateText('Price: {{ product.price }} USD', 'fr');
    const text = typeof res === 'string' ? res : res.text;
    expect(text).toContain('{{ product.price }}');
  });

  it('keeps nested tags and attributes', async () => {
    const res = await translateText('<div><span class=\"x\">Hi</span><img src=\"/a\" /></div>', 'de');
    const text = typeof res === 'string' ? res : res.text;
    expect(text).toContain('<span class=\"x\">');
    expect(text).toContain('<img src=\"/a\" />');
  });

  it('preserves self-closing tags', async () => {
    const res = await translateText('<p>Hi<br/>Line</p>', 'es');
    const text = typeof res === 'string' ? res : res.text;
    expect(text).toContain('<br/>');
  });
});
