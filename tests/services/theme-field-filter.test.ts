import fs from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../app/utils/logger.server.js', async () => {
  const actual = await vi.importActual<typeof import('../../app/utils/logger.server.js')>(
    '../../app/utils/logger.server.js'
  );
  const noopLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  return {
    ...actual,
    logger: noopLogger,
    apiLogger: noopLogger,
    validationLogger: noopLogger,
    billingLogger: noopLogger,
    translationLogger: noopLogger,
    createTranslationLogger: () => noopLogger
  };
});

const MODULE_URL = new URL('../../app/services/theme-field-filter.server.js', import.meta.url).href;

const {
  shouldTranslateThemeFieldWithReason,
  shouldTranslateThemeField,
  isThemeUrlField,
  evaluateThemeFieldsBatch,
  preloadThemeSchemaCache,
  __resetThemeSchemaCacheForTest,
  MAX_THEME_FIELD_BATCH_SIZE
} = await import('../../app/services/theme-field-filter.server.js');

const { logger } = await import('../../app/utils/logger.server.js');
type ViMock = ReturnType<typeof vi.fn>;
const mockedLogger = logger as unknown as {
  debug: ViMock;
  info: ViMock;
  warn: ViMock;
  error: ViMock;
};

beforeEach(() => {
  __resetThemeSchemaCacheForTest();
  mockedLogger.debug.mockClear();
  mockedLogger.info.mockClear();
  mockedLogger.warn.mockClear();
  mockedLogger.error.mockClear();
});

const runCase = (key: string, value: any, context: Record<string, any> = {}) =>
  shouldTranslateThemeFieldWithReason(key, value, context);

describe('shouldTranslateThemeFieldWithReason', () => {
  it('skips URL-specific keys regardless of value', () => {
    const result = runCase('sections.hero.button_url', '任意文本');
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('URL字段');
  });

  it('skips non-string values', () => {
    const result = runCase('sections.hero.heading', 123);
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('空值或非字符串');
  });

  it('skips technical fields by pattern', () => {
    const result = runCase('sections.hero.color', '任意文本');
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('技术字段');
  });

  it('skips liquid templates', () => {
    const result = runCase('sections.hero.text', '{{ title }}');
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('Liquid模板');
  });

  it('skips numeric or color values', () => {
    const result = runCase('sections.hero.subtitle', '#ff00ff');
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('数字或颜色值');
  });

  it('skips pure URLs even if key is not url field', () => {
    const result = runCase('sections.hero.description', 'https://example.com/page');
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('纯URL');
  });

  it('skips well-known brand names', () => {
    const result = runCase('sections.hero.custom_field', 'Shopify');
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('品牌名');
  });

  it('translates multi-word copy', () => {
    const result = runCase('sections.hero.heading', 'New arrivals are here');
    expect(result.shouldTranslate).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('translates short UI labels', () => {
    const result = runCase('sections.hero.button_label', 'Shop Now');
    expect(result.shouldTranslate).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('falls back to pattern mismatch when nothing applies', () => {
    const result = runCase('sections.hero.unknown', '***');
    expect(result.shouldTranslate).toBe(false);
    expect(result.reason).toBe('不匹配翻译模式');
  });

  it('translates known placeholder phrases', () => {
    const result = runCase('sections.hero.custom_field', 'Your content');
    expect(result.shouldTranslate).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('translates short TitleCase UI tokens', () => {
    const result = runCase('sections.hero.misc', 'Hero');
    expect(result.shouldTranslate).toBe(true);
    expect(result.reason).toBeNull();
  });

  describe('schema integration', () => {
    it('respects schema translate=false', () => {
      const result = runCase(
        'sections.header.settings.navigation_menu',
        'main-menu',
        { sectionType: 'header' }
      );
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('schema标记不翻译');
    });

    it('respects schema translate=true', () => {
      const result = runCase(
        'sections.featured_collection.blocks.block.settings.badge_text',
        'Badge',
        { sectionType: 'featured-collection' }
      );
      expect(result.shouldTranslate).toBe(true);
    });

    it('falls back to pattern when schema unavailable', () => {
      const result = runCase('sections.custom_section.settings.heading', 'Hello', {
        sectionType: 'custom-section'
      });
      expect(result.shouldTranslate).toBe(true);
    });

    it('ignores schema lookup when key is not prefixed with sections', () => {
      const result = runCase('title', 'Standalone heading', { sectionType: 'header' });
      expect(result.shouldTranslate).toBe(true);
    });
  });

  describe('real section schemas', () => {
    it('translates announcement bar inline richtext messages', () => {
      const result = runCase(
        'sections.announcement-bar.blocks.block.settings.text',
        '<p>Flash sale starts now</p>',
        { sectionType: 'announcement-bar' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('translates footer social media copy via schema flags', () => {
      const result = runCase(
        'sections.footer.blocks.block.settings.social_media_content',
        '<p>Stay connected</p>',
        { sectionType: 'footer' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('translates footer social media titles even with social_ prefix', () => {
      const result = runCase(
        'sections.footer.blocks.block.settings.social_media_title',
        'Follow our journey',
        { sectionType: 'footer' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('translates featured collection textarea descriptions', () => {
      const result = runCase(
        'sections.featured_collection.settings.description',
        'Line one\nLine two',
        { sectionType: 'featured-collection' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('translates rich-text section content fields', () => {
      const result = runCase('sections.rich-text.settings.content', '<p>Story</p>', {
        sectionType: 'rich-text'
      });
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('skips countdown timer specific_time strings', () => {
      const result = runCase('sections.countdown.settings.specific_time', '2024-12-31 23:59', {
        sectionType: 'countdown'
      });
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('schema标记不翻译');
    });

    it('translates rich-text block textarea content', () => {
      const result = runCase(
        'sections.rich-text.blocks.block.settings.content',
        'Line 1\nLine 2',
        { sectionType: 'rich-text' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('schema normalization & caching', () => {
    it('normalizes mixed-case sectionType names when resolving schema', () => {
      const result = runCase(
        'sections.slideshow.blocks.block.settings.title',
        'Lookbook highlight',
        { sectionType: 'SlideShow' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('normalizes Shopify sectionType prefixes like t:', () => {
      const result = runCase(
        'sections.image-with-text.settings.subheading',
        'Inspire customers everywhere',
        { sectionType: 't:Image_with_text' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('reuses cached section schema data between lookups', () => {
      const spy = vi.spyOn(fs, 'readdirSync');
      runCase('sections.header.settings.header_layout', 'compact', { sectionType: 'header' });
      runCase('sections.footer.settings.show_payment_icons', '1', { sectionType: 'footer' });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  describe('nested structures', () => {
    it('handles block settings paths', () => {
      const result = runCase('sections.multi.blocks.block.settings.title', 'Block Title', {
        sectionType: 'multi-column'
      });
      expect(result.shouldTranslate).toBe(true);
    });

    it('handles nested menu array labels', () => {
      const result = runCase('sections.header.menu_items[2].label', 'About us', {
        sectionType: 'header'
      });
      expect(result.shouldTranslate).toBe(true);
    });

    it('preserves URLs inside nested blocks', () => {
      const result = runCase('sections.multi.blocks.block.settings.link_url', 'https://example.com', {
        sectionType: 'multi-column'
      });
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('schema标记不翻译');
    });
  });

  describe('complex Liquid scenarios', () => {
    it('skips Liquid filters', () => {
      const result = runCase('sections.product.heading', '{{ product.title | upcase }}');
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('Liquid模板');
    });

    it('skips Liquid control flow', () => {
      const result = runCase('sections.cart.notice', '{% if cart.empty %}Empty{% endif %}');
      expect(result.shouldTranslate).toBe(true);
    });

    it('translates mixed Liquid/text content', () => {
      const result = runCase('sections.hero.heading', 'Welcome to {{ shop.name }} store');
      expect(result.shouldTranslate).toBe(true);
    });

    it('skips translation filter entries', () => {
      const result = runCase("sections.cart.button_text", "{{ 'cart.checkout' | t }}");
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('Liquid模板');
    });

    it('skips translation when only nested Liquid loops remain', () => {
      const content =
        '{% for block in section.blocks %}{{ block.title }}{% for badge in block.badges %}{{ badge }}{% endfor %}{% endfor %}';
      const result = runCase('sections.faq.settings.copy', content);
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('Liquid模板');
    });

    it('translates HTML copy mixed with Liquid placeholders', () => {
      const content = '<p>Save big with {{ shop.name }} <strong>today</strong></p>';
      const result = runCase('sections.hero.settings.text', content);
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('technical field enhancements', () => {
    it('skips handle fields', () => {
      const result = runCase('sections.collection.collection_handle', 'summer-sale');
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('技术字段');
    });

    it('skips id fields', () => {
      const result = runCase('sections.product.product_id', '123456');
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('技术字段');
    });
  });

  describe('edge cases', () => {
    it('skips empty strings', () => {
      const result = runCase('sections.hero.heading', '');
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('空值或非字符串');
    });

    it('skips whitespace-only strings', () => {
      const result = runCase('sections.hero.heading', ' \n\t ');
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('空值或非字符串');
    });

    it('translates long text payloads', () => {
      const longText = 'A'.repeat(1500);
      const result = runCase('sections.hero.description', longText);
      expect(result.shouldTranslate).toBe(true);
    });

    it('translates text with special characters', () => {
      const result = runCase('sections.hero.heading', '🎉 Sale Event! 50% OFF 🔥');
      expect(result.shouldTranslate).toBe(true);
    });

    it('translates HTML entities', () => {
      const result = runCase('sections.hero.text', 'Free &amp; Fast Shipping');
      expect(result.shouldTranslate).toBe(true);
    });

    it('translates mixed language content', () => {
      const result = runCase('sections.hero.title', 'Welcome 欢迎 Bienvenue');
      expect(result.shouldTranslate).toBe(true);
    });
  });

describe('text classification enhancements', () => {
    it('skips brand variants that include trademark glyphs', () => {
      const result = runCase('sections.hero.tagline', 'Onewind™ Gear');
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('品牌名');
    });

    it('skips URLs with fragments even when key is generic', () => {
      const result = runCase(
        'sections.hero.description',
        'https://example.com/products#details'
      );
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe('纯URL');
    });

    it('translates pure CJK marketing copy with emoji', () => {
      const result = runCase('sections.hero.heading', '限时优惠 🔥');
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('P2 boundary scenarios', () => {
    it('translates deeply nested array paths without schema hints', () => {
      const result = runCase(
        'sections.mega.blocks.block.settings.tabs[3].items[2].content',
        'Discover layered warmth',
        { sectionType: 'mega-menu' }
      );
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('handles keys with hyphenated segments', () => {
      const result = runCase('sections.hero.settings.cta-text', 'Claim Deal');
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('translates ultra long strings while keeping punctuation', () => {
      const longNarrative = Array.from({ length: 50 }, (_, idx) => `Paragraph ${idx + 1} celebrates exploration.`).join(
        '\n'
      );
      const result = runCase('sections.story.settings.description', longNarrative);
      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('batch evaluation & cache preload', () => {
    it('returns empty array for non-array or empty inputs', () => {
      expect(evaluateThemeFieldsBatch(null as any)).toEqual([]);
      expect(evaluateThemeFieldsBatch(undefined as any)).toEqual([]);
      expect(evaluateThemeFieldsBatch('not-array' as any)).toEqual([]);
      expect(evaluateThemeFieldsBatch([])).toEqual([]);
      const emptyMap = evaluateThemeFieldsBatch([], { returnAsMap: true });
      expect(emptyMap).toBeInstanceOf(Map);
      expect((emptyMap as Map<any, any>).size).toBe(0);
    });

    it('returns Map when returnAsMap flag is enabled', () => {
      const fields = [
        { key: 'sections.hero.settings.heading', value: 'Hero Heading' },
        { key: 'sections.hero.settings.subheading', value: 'Hero Subheading' }
      ];

      const result = evaluateThemeFieldsBatch(fields, {
        returnAsMap: true,
        computeContext: () => ({ sectionType: 'hero' })
      });

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('sections.hero.settings.heading')?.context.sectionType).toBe('hero');
    });

    it('preloads schema cache once and returns map reference', () => {
      const first = preloadThemeSchemaCache();
      const second = preloadThemeSchemaCache();
      expect(first).toBeInstanceOf(Map);
      expect(second).toBe(first);
    });

    it('evaluates multiple fields while merging contexts', () => {
      const fields = [
        {
          key: 'sections.header.settings.navigation_menu',
          value: 'main-menu'
        },
        {
          key: 'sections.rich-text.settings.content',
          value: 'Tell your story',
          context: { marker: 'custom' }
        }
      ];

      const results = evaluateThemeFieldsBatch(fields, {
        baseContext: { themeId: 't-1' },
        computeContext: (field) => {
          if (field.key.includes('header')) {
            return { sectionType: 'header' };
          }
          if (field.key.includes('rich-text')) {
            return { sectionType: 'rich-text' };
          }
          return {};
        }
      });

      expect(results[0].shouldTranslate).toBe(false);
      expect(results[0].reason).toBe('schema标记不翻译');
      expect(results[1].shouldTranslate).toBe(true);
      expect(results[1].context.marker).toBe('custom');
      expect(results[1].context.themeId).toBe('t-1');
    });

    it('resolves baseContext factory only once per oversized batch', () => {
      const fields = Array.from({ length: MAX_THEME_FIELD_BATCH_SIZE + 10 }, (_, index) => ({
        key: `sections.section-${index}.settings.title`,
        value: `Title ${index}`
      }));

      const baseContextFactory = vi.fn(() => ({ themeId: 't-ctx' }));

      const results = evaluateThemeFieldsBatch(fields, {
        baseContext: baseContextFactory
      });

      expect(results).toHaveLength(MAX_THEME_FIELD_BATCH_SIZE + 10);
      expect(results.every((item) => item.context.themeId === 't-ctx')).toBe(true);
      expect(baseContextFactory).toHaveBeenCalledTimes(1);
    });

    it('warns and splits when input exceeds MAX_THEME_FIELD_BATCH_SIZE', () => {
      const fields = Array.from({ length: MAX_THEME_FIELD_BATCH_SIZE + 5 }, (_, index) => ({
        key: `sections.rich-text.settings.content_${index}`,
        value: `Paragraph ${index}`
      }));

      const result = evaluateThemeFieldsBatch(fields, {
        baseContext: { shopId: 'shop-1' },
        computeContext: () => ({ sectionType: 'rich-text' })
      });

      expect(result).toHaveLength(MAX_THEME_FIELD_BATCH_SIZE + 5);
      expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
      const [warningMessage] = mockedLogger.warn.mock.calls[0];
      expect(warningMessage).toContain('超过单批限制');
    });

    it('still returns Map for oversized batch when returnAsMap=true', () => {
      const fields = Array.from({ length: MAX_THEME_FIELD_BATCH_SIZE + 3 }, (_, index) => ({
        key: `sections.hero.settings.label_${index}`,
        value: `Label ${index}`
      }));

      const result = evaluateThemeFieldsBatch(fields, {
        returnAsMap: true,
        baseContext: { themeId: 'batch-map' }
      });

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(MAX_THEME_FIELD_BATCH_SIZE + 3);
      expect(result.get('sections.hero.settings.label_0')?.context.themeId).toBe('batch-map');
    });

    it('handles malformed field items without throwing', () => {
      const fields = [null, undefined, 'Just value'] as any[];
      const results = evaluateThemeFieldsBatch(fields, {
        baseContext: { themeId: 't-safe' }
      });

      expect(results).toHaveLength(fields.length);
      expect(results[2].value).toBe('Just value');
      expect(results.every((item) => item.context.themeId === 't-safe')).toBe(true);
    });

    it('logs and continues when computeContext throws', () => {
      const fields = [
        { key: 'sections.rich-text.settings.content', value: 'Hello world' },
        { key: 'sections.footer.settings.text', value: 'Footer copy' }
      ];

      const computeContext = vi.fn(() => {
        throw new Error('derive fail');
      });

      const results = evaluateThemeFieldsBatch(fields, {
        computeContext
      });

      expect(results).toHaveLength(2);
      expect(mockedLogger.error).toHaveBeenCalledTimes(2);
      expect(results.every((item) => item.context && Object.keys(item.context).length === 0)).toBe(true);
    });
  });

  describe('schema cache failure handling', () => {
    it('logs warning but continues when schema files cannot be read', async () => {
      vi.resetModules();
      vi.doMock('node:fs', () => ({
        readdirSync: () => {
          throw new Error('boom');
        },
        readFileSync: vi.fn()
      }));

      const mod = await import(`${MODULE_URL}?schemafail=${Date.now()}`);
      const result = mod.shouldTranslateThemeFieldWithReason(
        'sections.header.settings.heading',
        'Welcome shoppers',
        { sectionType: 'header' }
      );

      expect(result.shouldTranslate).toBe(true);
      expect(result.reason).toBeNull();

      vi.doUnmock('node:fs');
      vi.resetModules();
    });
  });
});

describe('isThemeUrlField', () => {
  it('returns false for empty or malformed keys', () => {
    expect(isThemeUrlField()).toBe(false);
    expect(isThemeUrlField('sections.')).toBe(false);
  });

  it('detects explicit *_url suffixes and link keywords', () => {
    expect(isThemeUrlField('link_url')).toBe(true);
    expect(isThemeUrlField('video_url')).toBe(true);
    expect(isThemeUrlField('hero_cta_url')).toBe(true);
  });
});

describe('shouldTranslateThemeField wrapper', () => {
  it('returns boolean result only', () => {
    expect(shouldTranslateThemeField('sections.hero.heading', 'Shop now')).toBe(true);
  });
});
