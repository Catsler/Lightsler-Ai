import fs from 'node:fs';
import path from 'node:path';

import { bench, describe } from 'vitest';

import { evaluateThemeFieldsBatch } from '../../app/services/theme-field-filter.server.js';

type ThemeField = { key: string; value: string };

const BASE_CONTEXT = { themeId: 'perf-theme', locale: 'en', shopId: 'bench-shop' };

const computeContext = (field: ThemeField) => {
  if (!field?.key) {
    return {};
  }

  const sectionMatch = field.key.match(/^sections\.([^.[\]]+)/);
  if (!sectionMatch) {
    return {};
  }
  return { sectionType: sectionMatch[1] };
};

const makeFieldBatch = (count: number, section = 'hero'): ThemeField[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `sections.${section}.settings.text_${index}`,
    value: `Sample text ${index} for ${section}`
  }));

const makeDeepFieldBatch = (depth: number, breadth: number): ThemeField[] => {
  const result: ThemeField[] = [];
  for (let level = 0; level < depth; level++) {
    for (let branch = 0; branch < breadth; branch++) {
      const sectionKey = `sections.deep_${level}.blocks.branch_${branch}.settings.content`;
      result.push({
        key: `${sectionKey}.paragraph_${branch}`,
        value: `Nested paragraph ${branch} at level ${level}`
      });
      result.push({
        key: `${sectionKey}.cta_${branch}`,
        value: `Call to action ${branch}`
      });
    }
  }
  return result;
};

const FIXTURE_BASE = path.resolve('tests/fixtures/themes/dawn/templates');

const loadFixtureFields = (relativePath: string): ThemeField[] => {
  const filePath = path.join(FIXTURE_BASE, relativePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return collectStringFields(data);
};

const collectStringFields = (node: unknown, baseKey = ''): ThemeField[] => {
  if (typeof node === 'string') {
    return baseKey ? [{ key: baseKey, value: node }] : [];
  }

  if (Array.isArray(node)) {
    return node.flatMap((item, index) => {
      const key = baseKey ? `${baseKey}[${index}]` : `[${index}]`;
      return collectStringFields(item, key);
    });
  }

  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => {
      const nextKey = baseKey ? `${baseKey}.${key}` : key;
      return collectStringFields(value, nextKey);
    });
  }

  return [];
};

const entries100 = makeFieldBatch(100);
const entries500 = makeFieldBatch(500, 'promo');
const entries1000 = makeFieldBatch(1000, 'collection');
const deepNestedEntries = makeDeepFieldBatch(10, 5);
const collectionTemplateEntries = loadFixtureFields('collection.json');

const runBatch = (fields: ThemeField[]) => {
  const result = evaluateThemeFieldsBatch(fields, {
    baseContext: BASE_CONTEXT,
    computeContext,
    returnAsMap: true
  });

  if (!(result instanceof Map) || result.size !== fields.length) {
    throw new Error(`Batch result mismatch: expected ${fields.length}, got ${result instanceof Map ? result.size : -1}`);
  }
};

describe('evaluateThemeFieldsBatch performance', () => {
  bench('100 fields - hero section mix', () => {
    runBatch(entries100);
  });

  bench('500 fields - promo section mix', () => {
    runBatch(entries500);
  });

  bench('1000 fields - collection section mix', () => {
    runBatch(entries1000);
  });

  bench('deep nested JSON (10 levels x 5 branches)', () => {
    runBatch(deepNestedEntries);
  });

  bench('real Dawn collection template strings', () => {
    runBatch(collectionTemplateEntries);
  });
});
