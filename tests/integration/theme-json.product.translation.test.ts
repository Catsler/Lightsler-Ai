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

const findBlock = (section: any, predicate: (block: any) => boolean) => {
  const entry = Object.entries(section?.blocks ?? {}).find(([, block]) => predicate(block));
  expect(entry, 'expected block to exist in section').toBeDefined();
  return entry![1];
};

describe('theme-json product template integration', () => {
  it('translates real product template with ≥95% coverage', async () => {
    const themeData = loadFixture('templates/product.json');
    const resource = {
      id: 'theme.product',
      resourceType: 'ONLINE_STORE_THEME_JSON_TEMPLATE',
      shopId: 'test-shop',
      title: 'Product template',
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

    const originalMain = themeData.sections.main;
    const translatedMain = translatedData.sections.main;

    const originalBuyButtons = findBlock(originalMain, (block) => block.type === 'buy_buttons');
    const translatedBuyButtons = findBlock(translatedMain, (block) => block.type === 'buy_buttons');

    expect(translatedBuyButtons.settings.image_uploader_label).toBe(
      originalBuyButtons.settings.image_uploader_label
    );
    expect(translatedBuyButtons.settings.atc_button_background).toBe(
      originalBuyButtons.settings.atc_button_background
    );

    const originalDeliveryList = findBlock(
      originalMain,
      (block) => block.type === 'list' && block.settings?.item_1_heading === 'Delivery'
    );
    const translatedDeliveryList = findBlock(
      translatedMain,
      (block) =>
        block.type === 'list' &&
        block.settings?.item_1_icon_custom === originalDeliveryList.settings.item_1_icon_custom
    );

    expect(translatedDeliveryList.settings.item_1_heading).toContain('(ZH)');
    expect(translatedDeliveryList.settings.item_1_content).toContain('(ZH)');
    expect(translatedDeliveryList.settings.item_1_icon_custom).toBe(
      originalDeliveryList.settings.item_1_icon_custom
    );

    const originalAccordion = findBlock(originalMain, (block) => block.type === 'accordion');
    const translatedAccordion = findBlock(translatedMain, (block) => block.type === 'accordion');
    const metafieldSnippet = '{{ product.metafields.custom.specifications | metafield_tag }}';
    expect(translatedAccordion.settings.row_content).toContain(metafieldSnippet);
    expect(translatedAccordion.settings.row_content).not.toBe(
      originalAccordion.settings.row_content
    );

    expect(translatedData.sections['product-recommendations'].settings.title).toContain('(ZH)');
    expect(translatedData.sections['custom_liquid_8DerJj'].settings.liquid).toBe(
      themeData.sections['custom_liquid_8DerJj'].settings.liquid
    );
  });
});
