import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { translateThemeResource } = await import('../../app/services/theme-translation.server.js');

describe('translateThemeResource - Theme JSON', () => {
  const resourceBase = {
    id: 'theme.json.product',
    resourceType: 'ONLINE_STORE_THEME_JSON_TEMPLATE',
    shopId: 'test-shop',
    title: 'Product template',
    contentFields: {}
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('translates string fields while keeping technical ones intact', async () => {
    const themeData = {
      sections: {
        main: {
          type: 'rich-text',
          settings: {
            heading: 'New arrivals',
            text: 'Welcome to our store',
            button_label: 'Shop now',
            button_link: 'https://example.com'
          },
          blocks: [
            {
              type: 'text_block',
              settings: {
                title: 'Block title',
                content: 'Block content',
                cta_link: 'https://example.com/cta'
              }
            }
          ]
        }
      }
    };

    const resource = {
      ...resourceBase,
      contentFields: {
        themeData: JSON.stringify(themeData)
      }
    };

    const result = await translateThemeResource(resource as any, 'zh-CN');

    expect(result.skipped).toBeFalsy();
    expect(typeof result.translationFields.themeData).toBe('string');

    const translated = JSON.parse(result.translationFields.themeData);
    const mainSettings = translated.sections.main.settings;
    const blockSettings = translated.sections.main.blocks[0].settings;

    expect(mainSettings.heading).toMatch(/New arrivals/);
    expect(mainSettings.heading).toMatch(/ZH/);
    expect(mainSettings.button_label).toMatch(/Shop now/);
    expect(mainSettings.button_label).toMatch(/ZH/);

    // URL fields should remain untouched
    expect(mainSettings.button_link).toBe('https://example.com');
    expect(blockSettings.cta_link).toBe('https://example.com/cta');

    expect(blockSettings.title).toMatch(/Block title/);
    expect(blockSettings.content).toMatch(/Block content/);
  });
});
