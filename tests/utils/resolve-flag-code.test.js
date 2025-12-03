import { describe, it, expect } from 'vitest';
import { resolveFlagCode } from '../../app/routes/app.language-domains.jsx';

describe('resolveFlagCode - regional priority', () => {
  it('uses explicit region from locale', () => {
    expect(resolveFlagCode('fr-ca')).toBe('ca');
    expect(resolveFlagCode('pt-br')).toBe('br');
    expect(resolveFlagCode('en-gb')).toBe('gb');
    expect(resolveFlagCode('ar-eg')).toBe('eg');
  });
});

describe('resolveFlagCode - language defaults', () => {
  it('maps common languages', () => {
    expect(resolveFlagCode('fr')).toBe('fr');
    expect(resolveFlagCode('de')).toBe('de');
    expect(resolveFlagCode('ja')).toBe('jp');
    expect(resolveFlagCode('ko')).toBe('kr');
  });
});

describe('resolveFlagCode - extended Shopify languages', () => {
  it('maps less common languages', () => {
    expect(resolveFlagCode('ak')).toBe('gh');
    expect(resolveFlagCode('sq')).toBe('al');
    expect(resolveFlagCode('am')).toBe('et');
    expect(resolveFlagCode('hy')).toBe('am');
    expect(resolveFlagCode('bo')).toBe('cn');
  });
});

describe('resolveFlagCode - market name hint', () => {
  it('uses market name when no direct mapping exists', () => {
    expect(resolveFlagCode('fr', ['Belgium'])).toBe('fr'); // language default wins
    expect(resolveFlagCode('xx', ['Belgium'])).toBe('be');
    expect(resolveFlagCode('fr', ['Belgium', 'Austria'])).toBe('fr');
  });
});

describe('resolveFlagCode - fallbacks', () => {
  it('returns null for unknown language', () => {
    expect(resolveFlagCode('xx')).toBeNull();
    expect(resolveFlagCode('')).toBeNull();
  });
});
