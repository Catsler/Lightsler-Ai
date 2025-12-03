import { describe, it, expect } from 'vitest';

import { buildSubfolderSegment } from '../../app/services/market-urls.server.js';
import { transformUrl } from '../../app/services/link-converter.server.js';

describe('buildSubfolderSegment - 智能组合策略', () => {
  it('简单语言码 + 纯市场后缀时自动组合语言码', () => {
    expect(buildSubfolderSegment('fr', 'be')).toBe('fr-be');
    expect(buildSubfolderSegment('de', 'be')).toBe('de-be');
    expect(buildSubfolderSegment('en', 'be')).toBe('en-be');
  });

  it('locale 已包含连字符时，suffix 视为市场路径保持原样', () => {
    expect(buildSubfolderSegment('en-gb', 'uk')).toBe('uk');
    expect(buildSubfolderSegment('de-de', 'de')).toBe('de');
  });

  it('suffix 已含连字符时保持原样', () => {
    expect(buildSubfolderSegment('fr', 'fr-be')).toBe('fr-be');
    expect(buildSubfolderSegment('de', 'de-at')).toBe('de-at');
  });

  it('suffix 等于 locale 时保持原样', () => {
    expect(buildSubfolderSegment('fr', 'fr')).toBe('fr');
    expect(buildSubfolderSegment('de', 'de')).toBe('de');
  });

  it('suffix 为空时回退到语言码', () => {
    expect(buildSubfolderSegment('pt-pt', '')).toBe('pt-pt');
    expect(buildSubfolderSegment('fr', null)).toBe('fr');
    expect(buildSubfolderSegment('fr', undefined)).toBe('fr');
  });
});

describe('transformUrl locale handling', () => {
  const primaryHost = 'lightsler-ai.myshopify.com';
  const primaryUrl = `https://${primaryHost}`;

  it('keeps already localized relative paths', () => {
    const result = transformUrl(
      '/en-de/products',
      { type: 'subfolder', suffix: 'en-de', url: `${primaryUrl}/en-de` },
      primaryHost,
      primaryUrl
    );
    expect(result).toBe('/en-de/products');
  });

  it('rewrites absolute URLs without duplicating locale prefix', () => {
    const result = transformUrl(
      `${primaryUrl}/en-de/products`,
      { type: 'subfolder', suffix: 'de-de', url: `${primaryUrl}/de-de` },
      primaryHost,
      primaryUrl,
      { strategy: 'aggressive' }
    );
    expect(result).toBe(`${primaryUrl}/de-de/products`);
  });
});
