import { performance } from 'node:perf_hooks';
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

const collectMetricMock = vi.fn(async () => ({ success: true }));
vi.mock('../../app/services/metrics-persistence.server.js', () => ({
  collectMetric: collectMetricMock
}));

vi.mock('../../app/services/translation/core.server.js', () => ({
  translateTextWithFallback: vi.fn(async (text: string) => ({ success: true, text: `${text} (ZH)` })),
  postProcessTranslation: vi.fn(async (text: string) => text)
}));

vi.mock('../../app/utils/theme-url-validator.server.js', () => ({
  validateThemeUrl: () => ({ valid: true })
}));

const themeTranslationModule = await import('../../app/services/theme-translation.server.js');
const { translateThemeResource, shouldTranslateThemeFieldWithReason } = themeTranslationModule;
const themeFieldFilterModule = await import('../../app/services/theme-field-filter.server.js');

const PRIMARY_RICH_TEXT_ID = 'rich_text_6B96Y7';
const CUSTOM_RICH_TEXT_ID = 'rich_text_custom';

describe('theme-json collection template integration', () => {
  it('translates collection template with ≥95% coverage', async () => {
    collectMetricMock.mockClear();
    const themeData = loadFixture('templates/collection.json');
    const heroRichText = themeData.sections[PRIMARY_RICH_TEXT_ID];
    heroRichText.settings.subheading = 'Trail essentials for every season';
    heroRichText.settings.content = 'Curated picks for {{ collection.title }} fans';
    heroRichText.settings.button_text = 'Explore gear';
    heroRichText.settings.button_link = 'https://example.com/collections/trail';

    themeData.sections[CUSTOM_RICH_TEXT_ID] = {
      type: 'rich-text',
      settings: {
        subheading: 'Staff favorites',
        title: 'Lightweight layers',
        content: '<p>Stay agile with breathable shells.</p>',
        button_text: 'Shop layers',
        button_link: 'https://example.com/collections/layers',
        background_type: 'boxed',
        text_width: 'narrow',
        text_position: 'left',
        text_alignment: 'left'
      }
    };
    themeData.order.push(CUSTOM_RICH_TEXT_ID);
    const resource = {
      id: 'theme.collection',
      resourceType: 'ONLINE_STORE_THEME_JSON_TEMPLATE',
      shopId: 'test-shop',
      title: 'Collection template',
      contentFields: {
        themeData: JSON.stringify(themeData)
      }
    };

    const totalStringFields = countAllStringFields(themeData);
    const evaluateSpy = vi.spyOn(themeFieldFilterModule, 'evaluateThemeFieldsBatch');
    const startedAt = performance.now();

    const result = await translateThemeResource(resource as any, 'zh-CN');

    const finishedAt = performance.now();
    const durationMs = finishedAt - startedAt;
    expect(durationMs).toBeLessThan(5000);

    try {
      const batchCalls = evaluateSpy.mock.calls.length;
      expect(batchCalls).toBeGreaterThan(0);
      const efficiencyThreshold = Math.max(1, Math.ceil(totalStringFields / 3));
      expect(batchCalls).toBeLessThanOrEqual(efficiencyThreshold);
      const averageFieldsPerCall = totalStringFields / batchCalls;
      expect(averageFieldsPerCall).toBeGreaterThanOrEqual(3);
    } finally {
      evaluateSpy.mockRestore();
    }
    expect(collectMetricMock).toHaveBeenCalledTimes(1);
    const metricCall = collectMetricMock.mock.calls[0];
    expect(metricCall[0]).toBe('theme-translation-batch');
    expect(metricCall[1].fieldCount).toBeGreaterThan(0);
    expect(metricCall[1].batchCount).toBeGreaterThan(0);

    expect(result.skipped).toBeFalsy();
    const translatedData = JSON.parse(result.translationFields.themeData);

    const sectionTypeMap = buildSectionTypeMap(themeData);
    const stats: CoverageStats = { expected: 0, translated: 0 };

    const shouldTranslateField = (fieldKey: string, fieldValue: string, sectionType: string | null) =>
      shouldTranslateThemeFieldWithReason(fieldKey, fieldValue, { sectionType }).shouldTranslate;

    assertCoverage(themeData, translatedData, sectionTypeMap, stats, shouldTranslateField);

    const coverage = stats.expected === 0 ? 1 : stats.translated / stats.expected;
    expect(coverage).toBeGreaterThanOrEqual(0.95);

    const translatedRichText = translatedData.sections[PRIMARY_RICH_TEXT_ID];
    expect(translatedRichText.settings.subheading).toContain('(ZH)');
    expect(translatedRichText.settings.content).toContain('(ZH)');
    expect(translatedRichText.settings.content).toContain('{{ collection.title }}');
    expect(translatedRichText.settings.button_link).toBe(heroRichText.settings.button_link);

    const translatedCustomRichText = translatedData.sections[CUSTOM_RICH_TEXT_ID];
    expect(translatedCustomRichText.settings.title).toContain('(ZH)');
    expect(translatedCustomRichText.settings.button_text).toContain('(ZH)');
    expect(translatedCustomRichText.settings.button_link).toBe(
      themeData.sections[CUSTOM_RICH_TEXT_ID].settings.button_link
    );

    const translatedBanner = translatedData.sections['collection-banner'];
    expect(translatedBanner.settings.image_text_color).toBe(
      themeData.sections['collection-banner'].settings.image_text_color
    );

    const translatedMain = translatedData.sections.main;
    expect(translatedMain.settings.show_product_count).toBe(
      themeData.sections.main.settings.show_product_count
    );
    expect(translatedMain.settings.filter_position).toBe(themeData.sections.main.settings.filter_position);
  });
});

function countAllStringFields(node: unknown): number {
  if (typeof node === 'string') {
    return 1;
  }
  if (Array.isArray(node)) {
    return node.reduce((total, item) => total + countAllStringFields(item), 0);
  }
  if (node && typeof node === 'object') {
    return Object.values(node as Record<string, unknown>).reduce(
      (total, value) => total + countAllStringFields(value),
      0
    );
  }
  return 0;
}
