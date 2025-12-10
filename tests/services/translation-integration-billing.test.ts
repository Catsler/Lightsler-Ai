import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

const reserveMock = vi.fn(async () => ({ billingEnabled: true, reservationId: 'res-1', estimatedUsage: 1 }));
const confirmMock = vi.fn(async () => ({}));
const releaseMock = vi.fn(async () => ({}));

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
      text: `[tx]${text}`,
      meta: { duration: 5, cached: false, retries: 0 }
    }))
  }),
  createInMemoryCache: () => ({ stats: () => ({}) }),
  createRequestDeduplicator: () => ({ size: () => 0 })
}));

vi.mock('../../app/services/translation/billing-orchestrator.server.js', () => ({
  shouldEnforceBilling: vi.fn(() => true),
  reserveBillingIfNeeded: (...args) => reserveMock(...args),
  confirmBillingIfNeeded: (...args) => confirmMock(...args),
  ensureReservationReleased: (...args) => releaseMock(...args),
  handleBillingError: vi.fn()
}));

vi.mock('../../app/services/translation/chunking.server.js', () => ({
  chunkText: (text: string) => ['chunk1', 'chunk2'],
  isLikelyHtml: (text: string) => text.includes('<')
}));

vi.mock('../../app/services/translation/html-handler.server.js', () => ({
  protectHtmlTags: (text: string) => ({ text, tagMap: new Map() }),
  restoreHtmlTags: (text: string) => text
}));

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

// 避免 theme 模块循环检查报错
vi.mock('../../app/services/theme-translation.server.js', () => ({
  translateThemeResource: vi.fn(async () => ({ skipped: false }))
}));

// 简化长文本策略，避免依赖 executeTranslationRequest
vi.mock('../../app/services/translation/long-text-strategy.server.js', () => ({
  translateLongTextStrategy: vi.fn(async (text: string, targetLang: string) => ({
    success: true,
    text: `[long-merged]${text.length}`,
    language: targetLang
  }))
}));

// 简化增强策略，直接返回拼接结果
vi.mock('../../app/services/translation/enhanced-strategy.server.js', () => ({
  translateTextEnhancedStrategy: vi.fn(async (text: string, targetLang: string) => ({
    success: true,
    text: `[enhanced]${text}`,
    language: targetLang
  }))
}));

beforeAll(() => {
  process.env.GPT_API_KEY = 'dummy';
});

const { translateText } = await import('../../app/services/translation/core.server.js');

describe('translation integration - billing & chunking', () => {
  beforeEach(() => {
    reserveMock.mockClear();
    confirmMock.mockClear();
    releaseMock.mockClear();
  });

  it('reserves, confirms, and releases billing on success', async () => {
    const result = await translateText('hello world', 'fr', { shopId: 's1' });
    expect(typeof result).toBe('string');
    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('uses long-html strategy for long HTML and merges chunks', async () => {
    const longHtml = '<div>' + 'x'.repeat(2000) + '</div>';
    const result = await translateText(longHtml, 'de', { shopId: 's1' });
    expect(typeof result).toBe('string');
    expect(result).toContain('[long-merged]');
  });

  it('releases billing on strategy error', async () => {
    const { translateTextEnhancedStrategy } = await import('../../app/services/translation/enhanced-strategy.server.js');
    (translateTextEnhancedStrategy as any).mockRejectedValueOnce(new Error('mock-fail'));

    await expect(translateText('trigger error', 'en', { shopId: 's1' })).rejects.toThrow();
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
