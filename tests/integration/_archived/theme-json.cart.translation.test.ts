import { describe, it, expect, vi } from 'vitest';
import {
  loadFixture,
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

const CART_DRAWER_ID = 'cart-drawer';
const COUNTDOWN_BLOCK_ID = 'drawer_countdown';
const CART_RECOMMENDATIONS_ID = 'cart-recommendations';

describe('theme-json cart template integration', () => {
  it('translates cart template with ≥95% coverage', async () => {
    const themeData = loadFixture('templates/cart.json');
    themeData.sections[CART_RECOMMENDATIONS_ID].settings = {
      title: 'Recommended for you',
      subheading: 'Complete your kit'
    };

    themeData.sections[CART_DRAWER_ID] = {
      type: 'cart-drawer',
      settings: {
        show_recommendations: true,
        recommendations_title: 'Cart drawer picks',
        empty_button_link: 'https://example.com/collections/new-arrivals'
      },
      blocks: {
        [COUNTDOWN_BLOCK_ID]: {
          type: 'countdown',
          settings: {
            title: 'Flash deal ends soon',
            mode: 'specific',
            relative_minutes: 0,
            specific_time: '2025-12-31 23:59:00+0000',
            hide_on_complete: true
          }
        }
      },
      block_order: [COUNTDOWN_BLOCK_ID]
    };
    themeData.order.push(CART_DRAWER_ID);

    const resource = {
      id: 'theme.cart',
      resourceType: 'ONLINE_STORE_THEME_JSON_TEMPLATE',
      shopId: 'test-shop',
      title: 'Cart template',
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

    const coverage = stats.expected === 0 ? 1 : stats.translated / stats.expected;
    expect(coverage).toBeGreaterThanOrEqual(0.95);

    const translatedRecommendations = translatedData.sections[CART_RECOMMENDATIONS_ID];
    expect(translatedRecommendations.settings.title).toContain('(ZH)');
    expect(translatedRecommendations.settings.subheading).toContain('(ZH)');

    const translatedDrawer = translatedData.sections[CART_DRAWER_ID];
    expect(translatedDrawer.settings.recommendations_title).toContain('(ZH)');
    expect(translatedDrawer.settings.empty_button_link).toBe(
      themeData.sections[CART_DRAWER_ID].settings.empty_button_link
    );

    const translatedCountdown = translatedDrawer.blocks[COUNTDOWN_BLOCK_ID];
    expect(translatedCountdown.settings.title).toContain('(ZH)');
    expect(translatedCountdown.settings.specific_time).toBe(
      themeData.sections[CART_DRAWER_ID].blocks[COUNTDOWN_BLOCK_ID].settings.specific_time
    );
  });
});
