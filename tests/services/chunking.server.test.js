import { describe, expect, it } from 'vitest';
import { chunkText, isLikelyHtml } from '../../app/services/translation/chunking.server.js';

describe('chunking.server', () => {
  it('detects html with tags', () => {
    expect(isLikelyHtml('<p>hi</p>')).toBe(true);
    expect(isLikelyHtml('plain text')).toBe(false);
  });

  it('splits plain text into chunks respecting max size', () => {
    const text = 'a'.repeat(600) + '\n\n' + 'b'.repeat(600);
    const chunks = chunkText(text, 700, { isHtml: false });
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBeLessThanOrEqual(700);
    expect(chunks[1].length).toBeLessThanOrEqual(700);
  });

  it('splits html respecting smaller limit when list present', () => {
    const html = '<ul>' + '<li>item</li>'.repeat(50) + '</ul>';
    const chunks = chunkText(html, 300, { isHtml: true });
    expect(chunks.length).toBeGreaterThan(1);
  });
});
