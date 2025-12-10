import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  checkBrandWords,
  handlePlaceholderFallback,
  isBrandWord,
  placeholderFallbackStats
} from '../../app/services/translation/post-processor-rules.server.js';

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

describe('post-processor-rules', () => {
  beforeEach(() => {
    placeholderFallbackStats.clear();
  });

  it('checkBrandWords respects vendor protection and patterns', () => {
    expect(checkBrandWords('Nike', { fieldName: 'vendor' }).shouldSkip).toBe(true);
    expect(checkBrandWords('AB-123', {}).shouldSkip).toBe(true);
    expect(checkBrandWords('CPU', {}).shouldSkip).toBe(true);
    expect(checkBrandWords('Long sentence exceeding limit', {}).shouldSkip).toBe(false);
  });

  it('isBrandWord matches known brands and units', () => {
    expect(isBrandWord('Nike')).toBe(true);
    expect(isBrandWord('usb')).toBe(true);
    expect(isBrandWord('cm')).toBe(true);
    expect(isBrandWord('example')).toBe(false);
  });

  it('handlePlaceholderFallback returns original text and updates stats', async () => {
    const logger = createLogger();
    const result = await handlePlaceholderFallback({
      originalText: 'Hello',
      translatedText: '__PROTECTED_IMG__',
      targetLang: 'en',
      logger
    });

    expect(result.handled).toBe(true);
    expect(result.result).toMatchObject({ success: true, text: 'Hello', isOriginal: true });
    expect(placeholderFallbackStats.get('en')).toBe(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('handlePlaceholderFallback tries config-key fallback when provided', async () => {
    const logger = createLogger();
    const translateConfigKeyWithFallback = vi.fn().mockResolvedValue({ success: true, text: 'cfg' });
    const isLikelyConfigKey = vi.fn().mockReturnValue(true);

    const result = await handlePlaceholderFallback({
      originalText: 'SHOPIFY_API_KEY',
      translatedText: '__PROTECTED_PLACEHOLDER__',
      targetLang: 'en',
      logger,
      isLikelyConfigKey,
      translateConfigKeyWithFallback
    });

    expect(result.handled).toBe(true);
    expect(result.result.text).toBe('cfg');
    expect(translateConfigKeyWithFallback).toHaveBeenCalled();
  });
});
