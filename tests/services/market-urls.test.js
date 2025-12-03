import { describe, it, expect } from 'vitest';
import { buildSubfolderSegment, parseMarketsConfig } from '../../app/services/market-urls.server.js';

describe('buildSubfolderSegment - full coverage', () => {
  it('combines simple language + market suffix', () => {
    expect(buildSubfolderSegment('fr', 'be')).toBe('fr-be');
    expect(buildSubfolderSegment('de', 'be')).toBe('de-be');
    expect(buildSubfolderSegment('en', 'be')).toBe('en-be');
  });

  it('keeps suffix when locale already has hyphen (treat suffix as market path)', () => {
    expect(buildSubfolderSegment('en-gb', 'uk')).toBe('uk');
    expect(buildSubfolderSegment('en-ca', 'ca')).toBe('ca');
    expect(buildSubfolderSegment('de-de', 'de')).toBe('de');
  });

  it('keeps suffix if suffix already contains hyphen', () => {
    expect(buildSubfolderSegment('fr', 'fr-be')).toBe('fr-be');
    expect(buildSubfolderSegment('de', 'de-at')).toBe('de-at');
    expect(buildSubfolderSegment('en', 'en-gb')).toBe('en-gb');
  });

  it('keeps suffix when suffix equals locale', () => {
    expect(buildSubfolderSegment('fr', 'fr')).toBe('fr');
    expect(buildSubfolderSegment('de', 'de')).toBe('de');
  });

  it('falls back to locale when suffix is empty/null/undefined', () => {
    expect(buildSubfolderSegment('pt-pt', '')).toBe('pt-pt');
    expect(buildSubfolderSegment('fr', null)).toBe('fr');
    expect(buildSubfolderSegment('fr', undefined)).toBe('fr');
  });

  it('normalizes case and trims slashes', () => {
    expect(buildSubfolderSegment('FR', 'BE')).toBe('fr-be');
    expect(buildSubfolderSegment('De', '/Be/')).toBe('de-be');
    expect(buildSubfolderSegment('en', '//uk//')).toBe('en-uk');
  });
});

describe('parseMarketsConfig - multi-market shared locales', () => {
  it('collects all variants for the same locale while keeping the first mapping', () => {
    const mockData = {
      markets: {
        nodes: [
          {
            id: 'gid://shopify/Market/1',
            name: 'Austria',
            enabled: true,
            primary: false,
            webPresences: {
              nodes: [
                {
                  id: 'gid://shopify/MarketWebPresence/1',
                  defaultLocale: { locale: 'de' },
                  alternateLocales: [],
                  subfolderSuffix: 'at'
                }
              ]
            }
          },
          {
            id: 'gid://shopify/Market/2',
            name: 'Belgium',
            enabled: true,
            primary: false,
            webPresences: {
              nodes: [
                {
                  id: 'gid://shopify/MarketWebPresence/2',
                  defaultLocale: { locale: 'nl' },
                  alternateLocales: [{ locale: 'de' }, { locale: 'fr' }],
                  subfolderSuffix: 'be'
                }
              ]
            }
          }
        ]
      },
      shop: {
        primaryDomain: {
          host: 'example.com',
          url: 'https://example.com'
        },
        name: 'Test Shop'
      }
    };

    const result = parseMarketsConfig(mockData);

    // mappings 应保留首个 de（Austria）
    expect(result.mappings.de).toBeDefined();
    expect(result.mappings.de.marketName).toBe('Austria');
    expect(result.mappings.de.suffix).toBe('de-at');

    // mappingVariants 应包含 Austria + Belgium 的 de 变体
    expect(result.mappingVariants.de).toBeDefined();
    expect(result.mappingVariants.de).toHaveLength(2);
    const belgiumVariant = result.mappingVariants.de.find((entry) => entry.marketName === 'Belgium');
    expect(belgiumVariant).toBeDefined();
    expect(belgiumVariant.suffix).toBe('de-be');
    expect(belgiumVariant.path).toBe('/de-be/');
  });
});
