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

const getBlockById = (section: any, blockId: string) => {
  const block = section?.blocks?.[blockId];
  expect(block, `expected block ${blockId} to exist`).toBeDefined();
  return block;
};

describe('theme-json index template integration', () => {
  it('translates homepage template with ≥95% coverage', async () => {
    const themeData = loadFixture('templates/index.json');
    const resource = {
      id: 'theme.index',
      resourceType: 'ONLINE_STORE_THEME_JSON_TEMPLATE',
      shopId: 'test-shop',
      title: 'Index template',
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

    const slideshowOriginal = themeData.sections.slideshow;
    const slideshowTranslated = translatedData.sections.slideshow;
    const firstSlideId = slideshowOriginal.block_order[0];
    const originalSlide = getBlockById(slideshowOriginal, firstSlideId);
    const translatedSlide = getBlockById(slideshowTranslated, firstSlideId);

    expect(translatedSlide.settings.title).toContain('(ZH)');
    expect(translatedSlide.settings.content).toContain('(ZH)');
    expect(translatedSlide.settings.button_1_text).toContain('(ZH)');
    expect(translatedSlide.settings.button_1_link).toBe(originalSlide.settings.button_1_link);

    const countdownTranslated = translatedData.sections.countdown;
    expect(countdownTranslated.settings.title).toContain('(ZH)');
    expect(countdownTranslated.settings.button_text).toContain('(ZH)');
    expect(countdownTranslated.settings.specific_time).toBe(
      themeData.sections.countdown.settings.specific_time
    );

    const imageWithTextId = 'image_with_text_YpHzCE';
    const imageWithTextOriginal = themeData.sections[imageWithTextId];
    const imageWithTextTranslated = translatedData.sections[imageWithTextId];
    const imageBlockId = imageWithTextOriginal.block_order[0];
    const originalImageBlock = getBlockById(imageWithTextOriginal, imageBlockId);
    const translatedImageBlock = getBlockById(imageWithTextTranslated, imageBlockId);

    expect(translatedImageBlock.settings.title).toContain('(ZH)');
    expect(translatedImageBlock.settings.content).toContain('(ZH)');
    expect(translatedImageBlock.settings.button_link).toBe(
      originalImageBlock.settings.button_link
    );

    const collectionListOriginal = themeData.sections['collection_list_EeU7r3'];
    const collectionListTranslated = translatedData.sections['collection_list_EeU7r3'];
    const collageBlockId = collectionListOriginal.block_order[0];
    const originalCollectionBlock = getBlockById(collectionListOriginal, collageBlockId);
    const translatedCollectionBlock = getBlockById(collectionListTranslated, collageBlockId);
    expect(translatedCollectionBlock.settings.link_url).toBe(
      originalCollectionBlock.settings.link_url
    );

    const shopTheLookOriginal = themeData.sections['shop-the-look'];
    const shopTheLookTranslated = translatedData.sections['shop-the-look'];
    const lookBlockId = shopTheLookOriginal.block_order[0];
    const originalLookBlock = getBlockById(shopTheLookOriginal, lookBlockId);
    const translatedLookBlock = getBlockById(shopTheLookTranslated, lookBlockId);
    expect(translatedLookBlock.settings.product_1).toBe(originalLookBlock.settings.product_1);
    expect(translatedLookBlock.settings.product_2).toBe(originalLookBlock.settings.product_2);

    expect(translatedData.sections.custom_liquid_GFL4in.settings.liquid).toBe(
      themeData.sections.custom_liquid_GFL4in.settings.liquid
    );
  });
});
