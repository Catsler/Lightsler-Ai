import { bench, describe, vi } from 'vitest';

import { loadFixture, buildSectionTypeMap } from '../integration/theme-json/utils';

vi.mock('../../app/utils/logger.server.js', async () => {
  const noop = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const actual = await vi.importActual<typeof import('../../app/utils/logger.server.js')>(
    '../../app/utils/logger.server.js'
  );
  return {
    ...actual,
    logger: noop,
    translationLogger: noop,
    validationLogger: noop,
    apiLogger: noop,
    billingLogger: noop,
    createTranslationLogger: () => noop
  };
});

vi.mock('../../app/services/error-collector.server.js', () => ({
  collectErrorBatch: vi.fn(async () => ({ failed: 0 }))
}));

vi.mock('../../app/services/translation/core.server.js', () => ({
  translateTextWithFallback: vi.fn(async (text: string) => ({
    success: true,
    text: `${text} [ZH]`
  })),
  postProcessTranslation: vi.fn(async (text: string) => text)
}));

vi.mock('../../app/utils/theme-url-validator.server.js', () => ({
  validateThemeUrl: () => ({ valid: true })
}));

const { translateThemeJsonData } = await import('../../app/services/theme-translation.server.js');

const cloneTheme = <T>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

const cartTemplate = loadFixture('templates/cart.json');
const collectionTemplate = loadFixture('templates/collection.json');
const productTemplate = loadFixture('templates/product.json');

const runTranslation = async (template: any, key: string) => {
  const workingCopy = cloneTheme(template);
  const sectionTypeMap = buildSectionTypeMap(workingCopy);
  const translated = await translateThemeJsonData(workingCopy, 'zh-CN', key, { sectionTypeMap });
  if (!translated) {
    throw new Error('翻译结果为空');
  }
};

describe('translateThemeJsonData performance', () => {
  bench('cart template translation', async () => {
    await runTranslation(cartTemplate, 'templates.cart');
  });

  bench('collection template translation', async () => {
    await runTranslation(collectionTemplate, 'templates.collection');
  });

  bench('product template translation', async () => {
    await runTranslation(productTemplate, 'templates.product');
  });
});
