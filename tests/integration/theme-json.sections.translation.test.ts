import { describe, it, expect, vi } from 'vitest';
import {
  buildSectionTypeMap,
  assertCoverage,
  type CoverageStats
} from './theme-json/utils';

vi.mock('../../app/utils/logger.server.js', async () => {
  const noop = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    logger: noop,
    apiLogger: noop,
    billingLogger: noop,
    validationLogger: noop,
    translationLogger: noop,
    createTranslationLogger: () => noop
  };
});

vi.mock('../../app/services/error-collector.server.js', () => ({
  collectErrorBatch: vi.fn(async () => ({ failed: 0 }))
}));

vi.mock('../../app/services/translation/core.server.js', () => ({
  translateTextWithFallback: vi.fn(async (text: string) => ({ success: true, text: `${text} (ZH)` })),
  postProcessTranslation: vi.fn(async (text: string) => text)
}));

vi.mock('../../app/utils/theme-url-validator.server.js', () => ({
  validateThemeUrl: () => ({ valid: true })
}));

const { translateThemeResource, shouldTranslateThemeFieldWithReason } = await import(
  '../../app/services/theme-translation.server.js'
);

describe('theme-json complex sections integration', () => {
  it('handles multi-column/image-with-text/product-recommendations/header/footer', async () => {
    const themeData = {
      sections: {
        multi: {
          type: 'multi-column',
          blocks: {
            block_1: {
              type: 'item',
              settings: {
                title: 'Column title',
                text: 'Column content',
                link_url: 'https://example.com'
              }
            }
          },
          block_order: ['block_1'],
          settings: {
            heading: 'Featured columns',
            description: 'Our best picks'
          }
        },
        image: {
          type: 'image-with-text',
          blocks: {},
          block_order: [],
          settings: {
            heading: 'Image section',
            text: 'Beautiful imagery',
            button_label: 'Discover more',
            button_link: 'https://example.com/image'
          }
        },
        recommendations: {
          type: 'product-recommendations',
          settings: {
            heading: 'You may also like'
          }
        },
        header: {
          type: 'header',
          settings: {
            announcement_text: 'Free shipping on orders over $50'
          }
        },
        footer: {
          type: 'footer',
          settings: {
            heading: 'Stay connected',
            newsletter_heading: 'Subscribe to our newsletter'
          }
        }
      },
      order: ['multi', 'image', 'recommendations', 'header', 'footer']
    };

    const resource = {
      id: 'theme.sections.test',
      resourceType: 'ONLINE_STORE_THEME_JSON_TEMPLATE',
      shopId: 'test-shop',
      title: 'Sections test',
      contentFields: {
        themeData: JSON.stringify(themeData)
      }
    };

    const result = await translateThemeResource(resource as any, 'zh-CN');
    expect(result.skipped).toBeFalsy();
    const translatedData = JSON.parse(result.translationFields.themeData);

    const sectionTypeMap = buildSectionTypeMap(themeData);
    const stats: CoverageStats = { expected: 0, translated: 0 };

    const shouldTranslateField = (fieldKey: string, fieldValue: string, sectionType: string | null) =>
      shouldTranslateThemeFieldWithReason(fieldKey, fieldValue, { sectionType }).shouldTranslate;

    assertCoverage(themeData, translatedData, sectionTypeMap, stats, shouldTranslateField);

    expect(translatedData.sections.multi.blocks.block_1.settings.link_url).toBe(
      'https://example.com'
    );
    expect(translatedData.sections.image.settings.button_link).toBe('https://example.com/image');

    const coverage = stats.expected === 0 ? 1 : stats.translated / stats.expected;
    expect(coverage).toBeGreaterThanOrEqual(0.95);
  });
});
