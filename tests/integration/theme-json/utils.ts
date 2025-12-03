import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

const FIXTURE_BASE = path.resolve('tests/fixtures/themes/dawn');

export function loadFixture(relativePath: string) {
  const filePath = path.join(FIXTURE_BASE, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export interface CoverageStats {
  expected: number;
  translated: number;
}

export function buildSectionTypeMap(themeData: any) {
  const map: Record<string, string> = {};
  if (themeData?.sections && typeof themeData.sections === 'object') {
    for (const [sectionId, sectionConfig] of Object.entries(themeData.sections)) {
      if (sectionConfig && typeof sectionConfig === 'object' && 'type' in sectionConfig) {
        map[sectionId] = String((sectionConfig as any).type);
      }
    }
  }
  return map;
}

export function getSectionTypeFromKey(fullKey: string, map: Record<string, string>) {
  const match = fullKey.match(/^sections\.([^./]+)/);
  if (!match) return null;
  return map[match[1]] || null;
}

export function assertCoverage(
  original: any,
  translated: any,
  sectionTypeMap: Record<string, string>,
  stats: CoverageStats,
  shouldTranslateField: (key: string, value: string, sectionType: string | null) => boolean,
  baseKey = ''
) {
  if (typeof original === 'string') {
    const sectionType = getSectionTypeFromKey(baseKey, sectionTypeMap);
    const shouldTranslate = shouldTranslateField(baseKey, original, sectionType);
    const translatedValue = translated;

    if (shouldTranslate) {
      stats.expected += 1;
      expect(translatedValue).toBeDefined();
      expect(translatedValue).not.toBe(original);
      expect(String(translatedValue)).toContain(' (ZH)');
      stats.translated += 1;
    } else {
      expect(translatedValue).toBe(original);
    }
    return;
  }

  if (Array.isArray(original)) {
    expect(Array.isArray(translated)).toBe(true);
    for (let i = 0; i < original.length; i++) {
      const newKey = `${baseKey}[${i}]`;
      assertCoverage(original[i], translated?.[i], sectionTypeMap, stats, shouldTranslateField, newKey);
    }
    return;
  }

  if (original && typeof original === 'object') {
    expect(translated && typeof translated === 'object').toBe(true);
    for (const key of Object.keys(original)) {
      const newKey = baseKey ? `${baseKey}.${key}` : key;
      assertCoverage(original[key], translated?.[key], sectionTypeMap, stats, shouldTranslateField, newKey);
    }
  }
}
