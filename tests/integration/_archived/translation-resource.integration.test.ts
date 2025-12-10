import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../app/utils/logger.server.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
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

vi.mock('../../app/services/translation/server', () => ({}));

vi.mock('../../app/services/theme-translation.server.js', () => ({
  translateThemeResource: vi.fn(async () => ({ skipped: false, translations: { titleTrans: 'theme' } }))
}));

vi.mock('../../app/services/translation/core.server.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/services/translation/core.server.js')>();
  return {
    ...actual,
    translateText: vi.fn(async (text: string) => `[tx:${text}]`),
    postProcessTranslation: vi.fn(async (text: string) => text)
  };
});

const { translateResource } = await import('../../app/services/translation/resource-translator.server.js');

describe('translateResource (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips by hooks', async () => {
    const res = await translateResource(
      { id: '1', resourceType: 'product', title: 't' },
      'ja',
      { __mock_shouldTranslate: false } as any
    );
    expect(res.skipped).toBe(true);
  });

  it('translates product fields', async () => {
    const res: any = await translateResource(
      {
        id: 'p1',
        resourceType: 'product',
        title: 'Title',
        description: 'Desc',
        seoTitle: 'SEO',
        seoDescription: 'SEO desc'
      },
      'fr',
      { shopId: 's1' }
    );
    expect(res.skipped).toBe(false);
    expect(res.translations.titleTrans).toBe('[tx:Title]');
    expect(res.translations.seoTitleTrans).toBe('[tx:SEO]');
  });

  it('routes theme resources', async () => {
    const res: any = await translateResource(
      {
        id: 't1',
        resourceType: 'THEME',
        title: 'Theme title'
      },
      'fr',
      {}
    );
    expect(res.translations.titleTrans).toBe('theme');
  });
});
