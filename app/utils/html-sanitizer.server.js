import createDOMPurify from 'isomorphic-dompurify';
import { JSDOM } from 'jsdom';
import { logger } from './logger.server.js';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const SHOPIFY_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 'i', 'b',
  'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre',
  'span', 'div'
];

const SHOPIFY_ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'class'
];

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: SHOPIFY_ALLOWED_TAGS,
  ALLOWED_ATTR: SHOPIFY_ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i
};

export function sanitizeHtml(html, options = {}) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  try {
    const config = { ...SANITIZE_CONFIG, ...options };
    const cleaned = DOMPurify.sanitize(html, config);

    if (cleaned !== html) {
      logger.debug('HTML sanitized', {
        originalLength: html.length,
        cleanedLength: cleaned.length,
        removed: html.length - cleaned.length
      });
    }

    return cleaned;
  } catch (error) {
    logger.error('HTML sanitize failed', { error: error.message });
    return '';
  }
}

export function isThemeJson(content) {
  if (typeof content !== 'string') return false;

  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && (
      Object.prototype.hasOwnProperty.call(parsed, 'sections') ||
      Object.prototype.hasOwnProperty.call(parsed, 'settings') ||
      Object.prototype.hasOwnProperty.call(parsed, 'blocks')
    );
  } catch (error) {
    logger.debug('Theme JSON detection failed', { error: error.message });
    return false;
  }
}

export function sanitizeTranslationValue(value, fieldType = 'auto') {
  if (!value || typeof value !== 'string') {
    return '';
  }

  let resolvedFieldType = fieldType;
  if (fieldType === 'auto') {
    if (isThemeJson(value)) {
      resolvedFieldType = 'json';
    } else if (value.includes('<') && value.includes('>')) {
      resolvedFieldType = 'html';
    } else {
      resolvedFieldType = 'text';
    }
  }

  switch (resolvedFieldType) {
    case 'json':
      logger.debug('Skip sanitize for theme JSON');
      return value;
    case 'html':
      return sanitizeHtml(value);
    case 'text':
      return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
    default:
      logger.warn('Unknown field type for sanitize, fallback to HTML', { resolvedFieldType });
      return sanitizeHtml(value);
  }
}
