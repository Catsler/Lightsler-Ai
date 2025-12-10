import { describe, expect, it } from 'vitest';
import {
  protectHtmlTags,
  restoreHtmlTags
} from '../../app/services/translation/html-handler.server.js';

describe('html-handler', () => {
  it('returns original text and empty map when no html present', () => {
    const input = 'plain text only';
    const { text, tagMap } = protectHtmlTags(input);

    expect(text).toBe(input);
    expect(tagMap).toBeInstanceOf(Map);
    expect(tagMap.size).toBe(0);
    expect(restoreHtmlTags(text, tagMap)).toBe(input);
  });

  it('protects and restores script/style/comment/img blocks', () => {
    const input = '<p>Hi<script>alert(1)</script><style>.a{}</style><img src="a"/><!--c--></p>';
    const { text, tagMap } = protectHtmlTags(input);

    expect(tagMap.size).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('<style>');
    expect(text).not.toContain('<img');
    expect(text).not.toContain('<!--c-->');

    const restored = restoreHtmlTags(text, tagMap);
    expect(restored).toBe(input);
  });

  it('keeps Liquid placeholders intact', () => {
    const input = '<p>{{ product.title }} iPhone</p>';
    const { text, tagMap } = protectHtmlTags(input);

    expect(text).toContain('{{ product.title }}');
    const restored = restoreHtmlTags(text, tagMap);
    expect(restored).toBe(input);
  });

  it('handles self-closing media tags and restores them', () => {
    const input = '<div><img src="x"><source src="y"></div>';
    const { text, tagMap } = protectHtmlTags(input);

    expect(tagMap.size).toBeGreaterThanOrEqual(2);
    expect(restoreHtmlTags(text, tagMap)).toBe(input);
  });
});
