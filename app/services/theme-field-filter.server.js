import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '../utils/logger.server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEME_SCHEMA_BASE = path.resolve(__dirname, 'theme-schemas');

let sectionSchemaCache;

const THEME_TRANSLATABLE_PATTERNS = [
  /^(.+[._])?(title|heading|subheading|subtitle)$/i,
  /^(.+[._])?(description|content|text|body|paragraph)$/i,
  /^(.+[._])?(button|cta|call_to_action).*?(text|label)$/i,
  /^(.+[._])?(label|placeholder|helper|hint)$/i,
  /^(.+[._])?(announcement|alert|banner).*?(text|message)$/i,
  /^(.+[._])?(promo|promotion|offer|deal).*?(text|title)$/i,
  /^(.+[._])?(cart|checkout).*?(text|label|message)$/i,
  /^(.+[._])?(newsletter|contact|signup).*?(text|description)$/i,
  /^(.+[._])?(header|footer|section).*?(text|title)$/i,
  /^(.+[._])?(testimonial|review).*?(text|quote)$/i,
  /^(.+[._])?(faq|question|answer)$/i,
  /^(.+[._])?(blog|article|post|news).*?(text|title|excerpt)$/i,
  /^(.+[._])?(author|date|category|tag).*?(text|label)$/i,
  /^(.+[._])?(social|share|follow|like).*?(text|label)$/i,
  /^(.+[._])?(facebook|twitter|instagram|youtube).*?(text|title)$/i,
  /^(.+[._])?(empty|no_results|not_found).*?(text|message)$/i,
  /^(.+[._])?(countdown|timer|progress).*?(text|label)$/i,
  /^(.+[._])?(collection_list|product_grid|featured_product).*?(text|heading|subheading)$/i,
  /^(.+[._])?(newsletter|contact|about).*?(text|description|heading)$/i
];

const THEME_TECHNICAL_PATTERNS = [
  /^(.+\.)?(id|key|handle|slug|type|kind|variant)$/i,
  /_handle$/i,
  /^(.+\.)?(class|className|style|css|scss)$/i,
  /^(.+[._])?(url|href|src|path|endpoint|route|link)$/i,
  /^(.+[._])?(link_url|image_url|asset_url|video_url)$/i,
  /_url$/i,
  /^(.+\.)?(asset|assets|file|filename|image|icon)$/i,
  /^(.+_)?video_url$/i,
  /^(.+\.)?(color|colour|background|bg|font|font_size)$/i,
  /^(.+\.)?(size|width|height|margin|padding|spacing)$/i,
  /^(.+\.)?(position|align|alignment|justify|display)$/i,
  /^(.+\.)?(border|radius|shadow|opacity|z_index)$/i,
  /^(.+\.)?(enabled|disabled|active|inactive|visible|hidden)$/i,
  /^(.+\.)?(required|optional|default|min|max|limit)$/i,
  /^(.+\.)?(setting|settings|config|configuration|option|options)$/i,
  /^(.+\.)?(data|value|values|count|number|amount)$/i,
  /^(.+\.)?(condition|conditions|rule|rules|filter|filters)$/i,
  /^(.+\.)?(template|templates|layout|layouts|schema)$/i,
  /^(.+\.)?(api|endpoint|method|param|params|query)$/i,
  /^(.+\.)?(script|scripts|code|function|callback)$/i,
  /^(.+\.)?(metafield|metafields|namespace|collection_id|product_id)$/i,
  /^(.+\.)?(vendor|sku|barcode|inventory|variant_id)$/i
];

export const MAX_THEME_FIELD_BATCH_SIZE = 1000;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSchemaKey(key) {
  if (!key) return null;
  const normalized = key
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^t:/, '')
    .replace(/[^a-z0-9]+/g, '');
  return normalized || null;
}

function loadSectionSchemaCache() {
  if (sectionSchemaCache) {
    return sectionSchemaCache;
  }

  const cache = new Map();
  const sectionsDir = path.join(THEME_SCHEMA_BASE, 'sections');

  try {
    const files = fs.readdirSync(sectionsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(sectionsDir, file);
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const fileBase = file.replace(/\.json$/, '');
      const keys = [schema?.type, schema?.name, fileBase];
      keys.forEach((key) => {
        const normalized = normalizeSchemaKey(key);
        if (normalized) {
          cache.set(normalized, schema);
        }
      });
    }
  } catch (error) {
    logger.warn('[Theme翻译] 读取 section schema 失败', { error: error?.message || error });
  }

  sectionSchemaCache = cache;
  return cache;
}

function getSectionSchema(sectionType) {
  if (!sectionType) return null;
  const cache = loadSectionSchemaCache();
  const normalized = normalizeSchemaKey(sectionType);
  if (!normalized) return null;
  return cache.get(normalized) || null;
}

function findBlockSetting(schema, fieldId) {
  if (!fieldId) return undefined;
  for (const block of schema.blocks || []) {
    const list = Array.isArray(block.settings) ? block.settings : [];
    const found = list.find((setting) => setting.id === fieldId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function lookupSchemaTranslateFlag(sectionType, fullKey) {
  const schema = getSectionSchema(sectionType);
  if (!schema) return undefined;

  const remainder = fullKey.replace(/^sections\.[^.]+\.?/, '');
  if (!remainder || remainder === fullKey) {
    return undefined;
  }

  const settingsMatch = remainder.match(/settings\.([^.]+)$/);
  if (!settingsMatch) {
    return undefined;
  }

  const fieldId = settingsMatch[1];
  const scope = remainder.includes('blocks') ? 'block' : 'section';

  if (scope === 'section') {
    const target = (schema.settings || []).find((setting) => setting.id === fieldId);
    if (target && Object.prototype.hasOwnProperty.call(target, 'translate')) {
      return Boolean(target.translate);
    }
    return undefined;
  }

  const blockSetting = findBlockSetting(schema, fieldId);
  if (blockSetting && Object.prototype.hasOwnProperty.call(blockSetting, 'translate')) {
    return Boolean(blockSetting.translate);
  }

  return undefined;
}

export function isThemeUrlField(key = '') {
  if (typeof key !== 'string' || !key) {
    return false;
  }

  const segments = key.split(/[\._]/);
  const lastSegment = segments[segments.length - 1] || '';

  if (!lastSegment) {
    return false;
  }

  if (/^(url|href|src|path|endpoint|route|link)$/i.test(lastSegment)) {
    return true;
  }

  if (/^(link|video|image|asset|background|button)_?url$/i.test(lastSegment)) {
    return true;
  }

  if (/.*_url$/i.test(lastSegment)) {
    return true;
  }

  return false;
}

function removeLiquidTags(text) {
  return text
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\{%[^%]+%\}/g, '')
    .trim();
}

export function shouldTranslateThemeFieldWithReason(key, value, context = {}) {
  const sectionType = context.sectionType || null;
  const schemaFlag = lookupSchemaTranslateFlag(sectionType, key);
  if (schemaFlag === true) {
    return { shouldTranslate: true, reason: null };
  }
  if (schemaFlag === false) {
    return { shouldTranslate: false, reason: 'schema标记不翻译' };
  }
  if (isThemeUrlField(key)) {
    logger.debug(`[Theme翻译] 跳过URL字段: ${key}`);
    return { shouldTranslate: false, reason: 'URL字段' };
  }

  if (typeof value !== 'string' || !value.trim()) {
    logger.debug(`[Theme翻译] 跳过非字符串字段: ${key}`);
    return { shouldTranslate: false, reason: '空值或非字符串' };
  }

  if (THEME_TECHNICAL_PATTERNS.some((pattern) => pattern.test(key))) {
    logger.debug(`[Theme翻译] 跳过技术字段: ${key}`);
    return { shouldTranslate: false, reason: '技术字段' };
  }

  if (value.includes('{{') || value.includes('{%')) {
    const stripped = removeLiquidTags(value);
    if (!stripped) {
      logger.debug(`[Theme翻译] 跳过Liquid模板: ${key}`);
      return { shouldTranslate: false, reason: 'Liquid模板' };
    }
  }

  if (/^\d+$/.test(value) || /^#[0-9A-Fa-f]{3,6}$/.test(value)) {
    logger.debug(`[Theme翻译] 跳过数字/颜色值: ${key}`);
    return { shouldTranslate: false, reason: '数字或颜色值' };
  }

  if (/^https?:\/\//.test(value) && !value.includes(' ')) {
    logger.debug(`[Theme翻译] 跳过纯URL: ${key}`);
    return { shouldTranslate: false, reason: '纯URL' };
  }

  const isTranslatable = THEME_TRANSLATABLE_PATTERNS.some((pattern) => pattern.test(key));
  if (isTranslatable) {
    logger.debug(`[Theme翻译] 需要翻译字段: ${key}`);
    return { shouldTranslate: true, reason: null };
  }

  const placeholderTexts = [
    'Your content',
    'Paragraph',
    'Image with text',
    'Subheading',
    'Easy Setup',
    'rear went mesh',
    'Item',
    'Content',
    'Title',
    'Description'
  ];

  if (placeholderTexts.includes(value)) {
    logger.debug(`[Theme翻译] 检测到占位符文本，需要翻译: ${key} = "${value}"`);
    return { shouldTranslate: true, reason: null };
  }

  if (value.length >= 2 && /[a-zA-Z]/.test(value)) {
    if (/[®™]/.test(value) || /^(Onewind|Shopify|Amazon|Google|Facebook|Apple|Microsoft)/i.test(value)) {
      logger.debug(`[Theme翻译] 跳过品牌名: ${key} = "${value}"`);
      return { shouldTranslate: false, reason: '品牌名' };
    }

    if (value.split(' ').length > 1) {
      logger.debug(`[Theme翻译] 检测到多词文本内容，需要翻译: ${key} = "${value}"`);
      return { shouldTranslate: true, reason: null };
    }

    if (value.length >= 4 && /^[A-Z][a-z]+/.test(value)) {
      logger.debug(`[Theme翻译] 检测到可能的UI文本，需要翻译: ${key} = "${value}"`);
      return { shouldTranslate: true, reason: null };
    }

    if (
      value.length >= 2 &&
      value.length <= 20 &&
      !/^[0-9#.]/.test(value) &&
      !/^\w+\.(jpg|png|gif|svg|webp|css|js)$/i.test(value) &&
      !/^(true|false|null|undefined)$/i.test(value)
    ) {
      logger.debug(`[Theme翻译] 检测到短文本，考虑翻译: ${key} = "${value}"`);
      return { shouldTranslate: true, reason: null };
    }
  }

  logger.debug(`[Theme翻译] 跳过字段: ${key} = "${value}"`);
  return { shouldTranslate: false, reason: '不匹配翻译模式' };
}

export function shouldTranslateThemeField(key, value) {
  return shouldTranslateThemeFieldWithReason(key, value).shouldTranslate;
}

export function __resetThemeSchemaCacheForTest() {
  sectionSchemaCache = null;
}

export function preloadThemeSchemaCache() {
  return loadSectionSchemaCache();
}

export function evaluateThemeFieldsBatch(fields = [], options = {}) {
  const returnAsMap = options.returnAsMap === true;
  if (!Array.isArray(fields) || fields.length === 0) {
    return returnAsMap ? new Map() : [];
  }

  const resolvedBaseContext =
    typeof options.baseContext === 'function' ? options.baseContext() || {} : options.baseContext || {};
  const computeContext = typeof options.computeContext === 'function' ? options.computeContext : () => ({});
  const results = returnAsMap ? new Map() : [];

  const appendResult = (evaluation) => {
    if (returnAsMap) {
      results.set(evaluation.key || '', evaluation);
    } else {
      results.push(evaluation);
    }
  };

  const evaluateChunk = (chunk, offset = 0) =>
    chunk.forEach((field, index) => {
      const fieldIndex = offset + index;
      const normalizedField = isRecord(field) ? field : { value: field };
      const key = normalizedField.key || '';
      const fieldContext = isRecord(normalizedField.context) ? normalizedField.context : {};
      let derivedContext = {};

      try {
        const computed = computeContext(normalizedField) || {};
        derivedContext = isRecord(computed) ? computed : {};
      } catch (error) {
        logger.error('[Theme翻译] computeContext 执行失败', {
          error: error?.message || error,
          key,
          fieldIndex
        });
      }

      const mergedContext = {
        ...resolvedBaseContext,
        ...derivedContext,
        ...fieldContext
      };
      const evaluation = shouldTranslateThemeFieldWithReason(key, normalizedField.value, mergedContext);
      appendResult({
        ...normalizedField,
        ...evaluation,
        context: mergedContext
      });
    });

  if (fields.length <= MAX_THEME_FIELD_BATCH_SIZE) {
    evaluateChunk(fields, 0);
    return results;
  }

  const batchCount = Math.ceil(fields.length / MAX_THEME_FIELD_BATCH_SIZE);
  logger.warn(
    `[Theme翻译] evaluateThemeFieldsBatch 收到 ${fields.length} 个字段，超过单批限制 ${MAX_THEME_FIELD_BATCH_SIZE}，将拆分为 ${batchCount} 个批次`
  );

  for (let startIndex = 0; startIndex < fields.length; startIndex += MAX_THEME_FIELD_BATCH_SIZE) {
    const chunk = fields.slice(startIndex, startIndex + MAX_THEME_FIELD_BATCH_SIZE);
    evaluateChunk(chunk, startIndex);
  }
  return results;
}
