import { describe, expect, it, vi } from 'vitest';
import { selectTranslationStrategy, runTranslationStrategy } from '../../app/services/translation/translation-strategies.server.js';

describe('translation-strategies', () => {
  it('selects long-html when html and length > 1500', () => {
    const text = '<p>' + 'a'.repeat(1600) + '</p>';
    const result = selectTranslationStrategy({ text, targetLang: 'zh-CN', options: { isHtml: true } });
    expect(result.key).toBe('long-html');
  });

  it('selects default for plain text', () => {
    const text = 'hello world';
    const result = selectTranslationStrategy({ text, targetLang: 'zh-CN', options: { isHtml: false } });
    expect(result.key).toBe('default');
  });

  it('falls back to default when long-html runner throws', async () => {
    const logger = { warn: vi.fn() };
    const runners = {
      'long-html': vi.fn().mockRejectedValue(new Error('fail')),
      default: vi.fn().mockResolvedValue({ success: true, text: 'ok' })
    };

    const result = await runTranslationStrategy('long-html', { text: 'x', targetLang: 'en', options: {}, logger }, runners);
    expect(result).toEqual({ success: true, text: 'ok' });
    expect(runners.default).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
