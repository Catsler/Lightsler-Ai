import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  isThemeJson,
  sanitizeTranslationValue
} from '../../app/utils/html-sanitizer.server.js';

process.env.LOGGING_RETENTION_DAYS = '{"INFO":7}';
process.env.ENCRYPTION_KEY = 'test-key-must-be-at-least-32-chars-long-for-security';

describe('HTML Sanitizer', () => {
  describe('XSS 防护', () => {
    it('移除 script 标签', () => {
      const malicious = '<p>Hello<script>alert("XSS")</script>World</p>';
      const cleaned = sanitizeHtml(malicious);
      expect(cleaned).toBe('<p>HelloWorld</p>');
      expect(cleaned).not.toContain('<script>');
    });

    it('移除内联事件处理器', () => {
      const malicious = '<a href="#" onclick="alert(\'XSS\')">Click</a>';
      const cleaned = sanitizeHtml(malicious);
      expect(cleaned).toBe('<a>Click</a>');
      expect(cleaned).not.toContain('onclick');
    });

    it('阻止 javascript: 协议', () => {
      const malicious = '<a href="javascript:alert(\'XSS\')">Click</a>';
      const cleaned = sanitizeHtml(malicious);
      expect(cleaned).toBe('<a>Click</a>');
      expect(cleaned).not.toContain('javascript:');
    });

    it('移除 iframe 标签', () => {
      const malicious = '<iframe src="evil.com"></iframe>';
      const cleaned = sanitizeHtml(malicious);
      expect(cleaned).toBe('');
    });

    it('移除 style 标签', () => {
      const malicious = '<style>body{background:url("javascript:alert(1)")}</style>';
      const cleaned = sanitizeHtml(malicious);
      expect(cleaned).toBe('');
    });
  });

  describe('保留安全标签', () => {
    it('保留段落和格式化标签', () => {
      const safe = '<p><strong>Bold</strong> and <em>italic</em></p>';
      const cleaned = sanitizeHtml(safe);
      expect(cleaned).toBe(safe);
    });

    it('保留安全的链接', () => {
      const safe = '<a href="https://example.com" target="_blank">Link</a>';
      const cleaned = sanitizeHtml(safe);
      expect(cleaned).toContain('href="https://example.com"');
      expect(cleaned).not.toContain('onclick');
    });

    it('保留列表标签', () => {
      const safe = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const cleaned = sanitizeHtml(safe);
      expect(cleaned).toBe(safe);
    });
  });

  describe('Theme JSON 检测', () => {
    it('识别 Theme JSON', () => {
      const themeJson = '{"sections": {}, "settings": {}}';
      expect(isThemeJson(themeJson)).toBe(true);
    });

    it('拒绝普通 HTML', () => {
      const html = '<p>Not JSON</p>';
      expect(isThemeJson(html)).toBe(false);
    });

    it('拒绝无效 JSON', () => {
      const invalid = '{sections: invalid}';
      expect(isThemeJson(invalid)).toBe(false);
    });
  });

  describe('智能清理', () => {
    it('自动检测 HTML 并清理', () => {
      const html = '<p>Safe <script>alert(1)</script></p>';
      const cleaned = sanitizeTranslationValue(html, 'auto');
      expect(cleaned).toBe('<p>Safe </p>');
    });

    it('跳过 Theme JSON 清理', () => {
      const json = '{"sections": {"header": {}}}';
      const cleaned = sanitizeTranslationValue(json, 'auto');
      expect(cleaned).toBe(json);
    });

    it('清理纯文本中的标签', () => {
      const text = 'Hello <script>alert(1)</script> World';
      const cleaned = sanitizeTranslationValue(text, 'text');
      expect(cleaned).toBe('Hello  World');
    });
  });
});
