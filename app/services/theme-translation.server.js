/**
 * Theme资源专用翻译服务
 * 处理所有ONLINE_STORE_THEME相关资源的翻译逻辑
 * 与其他资源翻译逻辑完全独立，避免相互影响
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { translateTextWithFallback, postProcessTranslation } from './translation.server.js';
import { logger } from '../utils/logger.server.js';
import { collectErrorBatch, ERROR_TYPES, ERROR_CATEGORIES } from './error-collector.server.js';
import { validateThemeUrl } from '../utils/theme-url-validator.server.js';
import {
  shouldTranslateThemeFieldWithReason,
  shouldTranslateThemeField,
  isThemeUrlField,
  evaluateThemeFieldsBatch,
  preloadThemeSchemaCache
} from './theme-field-filter.server.js';
import { collectMetric } from './metrics-persistence.server.js';

// 验证必需函数是否正确导入
if (typeof translateTextWithFallback !== 'function') {
  throw new Error('translateTextWithFallback未正确导入，请检查translation.server.js的导出');
}
if (typeof postProcessTranslation !== 'function') {
  throw new Error('postProcessTranslation未正确导入，请检查translation.server.js的导出');
}

preloadThemeSchemaCache();

const METRIC_OPERATION = 'theme-translation-batch';

function createMetricsTracker() {
  return {
    totalFields: 0,
    batchCalls: 0
  };
}

function recordBatchMetrics(tracker, fieldCount) {
  if (!tracker || !fieldCount) {
    return;
  }
  tracker.totalFields += fieldCount;
  tracker.batchCalls += 1;
}

function recordFieldMetrics(tracker, count = 1) {
  if (!tracker || !count) {
    return;
  }
  tracker.totalFields += count;
}

const themeErrorContextStorage = new AsyncLocalStorage();
/**
 * 主题翻译错误上下文，用于在整个翻译流程中汇总错误与跳过统计
 */
class ThemeErrorContext {
  constructor(resource, targetLang, options = {}) {
    this.resource = resource;
    this.targetLang = targetLang;
    this.translatedCount = 0;
    this.skipCounts = {
      technical: 0,
      empty: 0,
      patternMismatch: 0,
      liquid: 0,
      brand: 0,
      other: 0
    };
    this.skipSamples = {
      technical: [],
      patternMismatch: [],
      liquid: [],
      brand: []
    };
    this.errors = [];
    this.sectionTypeMap = options.sectionTypeMap || {};
    this.sectionStats = {};
  }

  setSectionTypeMap(map = {}) {
    this.sectionTypeMap = map;
    this.sectionStats = {};
  }

  recordTranslation(fieldPath) {
    this.translatedCount += 1;
    if (fieldPath) {
      this._updateSectionStats(fieldPath, 'translated');
    }
  }

  recordSkip(reason, field, value) {
    const category = this._categorize(reason);
    this.skipCounts[category] = (this.skipCounts[category] || 0) + 1;
    if (field) {
      this._updateSectionStats(field, 'skipped');
    }

    // patternMismatch 采样日志（10% 采样率）
    if (category === 'patternMismatch' && Math.random() < 0.1) {
      const segments = field.split(/[._-]/);
      const fieldPrefix = segments[0] || 'unknown';
      const fieldSecondary = segments[1] || '';

      logger.debug('[Theme翻译] 模式不匹配字段样本', {
        resourceType: this.resource?.resourceType,
        fieldKey: field,
        fieldPrefix,
        fieldSecondary,
        fieldValue: typeof value === 'string' ? value.substring(0, 50) : String(value).substring(0, 50),
        skipCategory: category
      });
    }

    if (this.skipSamples[category] && this.skipSamples[category].length < 5) {
      const alreadyRecorded = this.skipSamples[category].some(
        (sample) => sample.field === field && sample.reason === reason
      );

      if (!alreadyRecorded) {
        const truncatedField =
          typeof field === 'string' && field.length > 80 ? `${field.slice(0, 77)}...` : field;
        const valueStr = String(value ?? '').replace(/\s+/g, ' ');
        const truncatedValue = valueStr.length > 100 ? `${valueStr.slice(0, 97)}...` : valueStr;

        this.skipSamples[category].push({
          field: truncatedField,
          value: truncatedValue,
          reason: reason || '其他原因'
        });
      }
    }
  }

  recordError(error, context = {}) {
    this.errors.push({
      error,
      context,
      timestamp: Date.now()
    });
  }

  async flush() {
    const batch = [];
    const { totalFields, translatedFields, skipStats } = this.getTotals();
    const totalSkips = totalFields - translatedFields;

    const sectionStats = this._buildSectionStats();

    const diagnostics = {
      skipStats,
      samples: JSON.parse(JSON.stringify(this.skipSamples)),
      totalFields,
      translatedFields,
      sectionStats
    };

    if (totalSkips > 0) {
      batch.push({
        data: {
          errorType: ERROR_TYPES.TRANSLATION,
          category: ERROR_CATEGORIES.WARNING,
          errorCode: 'THEME_FIELD_SKIPPED',
          message: `主题翻译跳过 ${totalSkips} 个字段 (技术:${this.skipCounts.technical}, 模式:${this.skipCounts.patternMismatch}, 品牌:${this.skipCounts.brand}, Liquid:${this.skipCounts.liquid}, 空值:${this.skipCounts.empty}, 其他:${this.skipCounts.other})`,
          isTranslationError: true
        },
        context: {
          resourceId: this.resource?.id ?? null,
          resourceType: this.resource?.resourceType ?? null,
          targetLang: this.targetLang,
          shopId: this.resource?.shopId ?? null,
          diagnostics
        }
      });
    }

    const lowCoverageSections = Object.entries(sectionStats).filter(([, stats]) => {
      return stats.total >= 5 && stats.coverage < 90;
    });

    for (const [sectionType, stats] of lowCoverageSections) {
      batch.push({
        data: {
          errorType: ERROR_TYPES.TRANSLATION,
          category: ERROR_CATEGORIES.WARNING,
          errorCode: 'THEME_COVERAGE_LOW',
          message: `Section ${sectionType} 覆盖率 ${stats.coverage}% (${stats.translated}/${stats.total})`,
          isTranslationError: true
        },
        context: {
          resourceId: this.resource?.id ?? null,
          resourceType: this.resource?.resourceType ?? null,
          targetLang: this.targetLang,
          shopId: this.resource?.shopId ?? null,
          sectionType,
          sectionStats: stats
        }
      });
    }

    for (const { error, context } of this.errors) {
      batch.push({
        data: {
          errorType: ERROR_TYPES.TRANSLATION,
          category: ERROR_CATEGORIES.ERROR,
          errorCode: error?.code || 'THEME_TRANSLATION_ERROR',
          message: error?.message || 'Theme翻译过程中发生未知错误',
          stack: error?.stack || null,
          isTranslationError: true
        },
        context: {
          resourceId: this.resource?.id ?? null,
          resourceType: this.resource?.resourceType ?? null,
          targetLang: this.targetLang,
          shopId: this.resource?.shopId ?? null,
          ...context
        }
      });
    }

    if (batch.length === 0) {
      return;
    }

    try {
      const result = await collectErrorBatch(batch);
      if (result?.failed > 0) {
        logger.warn(`[Theme翻译] ${result.failed}/${batch.length} 条错误记录写入失败`, {
          errors: result.errors
        });
      }
    } catch (error) {
      logger.error('[Theme翻译] 错误批量提交失败', { error: error?.message || error });
    }
  }

  /**
   * 获取翻译统计汇总数据
   * @returns {Object} 包含 totalFields, translatedFields, skipStats, coverage 的统计对象
   */
  getTotals() {
    const translatedCount = this.translatedCount;
    const totalSkips = Object.values(this.skipCounts).reduce((sum, count) => sum + (count || 0), 0);
    const totalFields = translatedCount + totalSkips;
    const coverage = totalFields > 0 ? (translatedCount / totalFields * 100).toFixed(1) : '0.0';

    return {
      totalFields,
      translatedFields: translatedCount,
      skipStats: { ...this.skipCounts },
      coverage: `${coverage}%`
    };
  }

  /**
   * 将reason字符串分类到预定义的类别
   *
   * 分类规则（关键字匹配，不区分大小写）：
   * - technical: '技术' OR '数字' OR '颜色' OR 'url'
   * - empty: '空'
   * - patternMismatch: '模式'
   * - liquid: 'liquid'
   * - brand: '品牌'
   * - other: 以上都不匹配
   *
   * 对应的reason字符串来源：
   * - technical类: '技术字段', '数字或颜色值', '纯URL'
   * - empty类: '空值或非字符串'
   * - patternMismatch类: '不匹配翻译模式'
   * - liquid类: 'Liquid模板'
   * - brand类: '品牌名'
   */
  _categorize(reason) {
    if (!reason) {
      return 'other';
    }

    const normalized = reason.toLowerCase();

    if (
      normalized.includes('技术') ||
      normalized.includes('数字') ||
      normalized.includes('颜色') ||
      normalized.includes('url')
    ) {
      return 'technical';
    }

    if (normalized.includes('空')) {
      return 'empty';
    }

    if (normalized.includes('模式')) {
      return 'patternMismatch';
    }

    if (normalized.includes('liquid')) {
      return 'liquid';
    }

    if (normalized.includes('品牌')) {
      return 'brand';
    }

    return 'other';
  }

  _resolveSectionKey(fieldPath) {
    if (!fieldPath || typeof fieldPath !== 'string') {
      return 'global';
    }
    const match = fieldPath.match(/^sections\.([^./\[]+)/);
    if (!match) {
      return 'global';
    }
    const sectionId = match[1];
    return this.sectionTypeMap[sectionId] || sectionId || 'global';
  }

  _updateSectionStats(fieldPath, kind) {
    const sectionKey = this._resolveSectionKey(fieldPath);
    if (!sectionKey) return;
    const bucket = this.sectionStats[sectionKey] || { total: 0, translated: 0, skipped: 0 };
    bucket.total += 1;
    if (kind === 'translated') {
      bucket.translated += 1;
    } else if (kind === 'skipped') {
      bucket.skipped += 1;
    }
    this.sectionStats[sectionKey] = bucket;
  }

  _buildSectionStats() {
    const stats = {};
    for (const [section, bucket] of Object.entries(this.sectionStats)) {
      const coverage = bucket.total ? Number(((bucket.translated / bucket.total) * 100).toFixed(1)) : 0;
      stats[section] = {
        total: bucket.total,
        translated: bucket.translated,
        skipped: bucket.skipped,
        coverage
      };
    }
    return stats;
  }
}

function getErrorContext() {
  return themeErrorContextStorage.getStore();
}

async function translateThemeValue(text, targetLang) {
  if (typeof text !== 'string') {
    return text;
  }

  const result = await translateTextWithFallback(text, targetLang);
  if (!result.success && result.error) {
    logger.warn(`[Theme翻译] 字段翻译失败，保留原文`, { targetLang, error: result.error });
  }
  return result.text;
}

/**
 * 扁平化翻译字段中的复杂嵌套结构
 * 将 { key: { value, digest, original } } 转换为 { key: value }
 * @param {Object} translationFields - 翻译字段对象
 * @returns {Object} 扁平化后的对象
 */
function flattenTranslationFields(translationFields) {
  if (!translationFields || typeof translationFields !== 'object') {
    return {};
  }

  const flattened = {};

  for (const [key, value] of Object.entries(translationFields)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // 处理嵌套对象结构
      if (value.value !== undefined) {
        // 提取 value 字段 (来自 { value, digest, original } 结构)
        flattened[key] = value.value;
      } else if (key === 'dynamicFields' || key === 'themeData') {
        // 递归处理 dynamicFields 和 themeData
        flattened[key] = flattenTranslationFields(value);
      } else {
        // 保持其他对象原样 (可能是合法的JSON结构)
        flattened[key] = value;
      }
    } else {
      // 字符串、数字、null等直接保留
      flattened[key] = value;
    }
  }

  return flattened;
}


/**
 * 判断Theme字段是否需要翻译
 * @param {string} key - 字段键名
 * @param {any} value - 字段值
 * @returns {boolean} 是否需要翻译
 */
/**
 * 检查是否为Shopify默认主题内容
 * @param {Object} resource - Theme资源对象
 * @returns {Object} 检查结果 {shouldSkip: boolean, reason: string}
 */
function checkDefaultThemeContent(resource) {
  // Shopify官方默认主题列表
  const DEFAULT_THEMES = [
    'Dawn', 'Refresh', 'Craft', 'Sense', 'Studio', 'Colorblock',
    'Impulse', 'Minimal', 'Narrative', 'Supply', 'Venture', 'Brooklyn',
    'Simple', 'Debut', 'Expression', 'Symmetry', 'Streamline'
  ];

  // 检查主题名称
  const themeName = resource.title || '';
  const isDefaultTheme = DEFAULT_THEMES.some(defaultName => 
    themeName.toLowerCase().includes(defaultName.toLowerCase())
  );

  if (isDefaultTheme) {
    return {
      shouldSkip: true,
      reason: `Shopify默认主题"${themeName}"，由官方处理多语言`
    };
  }

  // 检查文件路径是否包含默认主题标识
  const resourceId = resource.id || '';
  const gid = resource.gid || '';
  
  const pathIndicators = [
    'shopify/themes/dawn',
    'shopify/themes/refresh', 
    'shopify/themes/craft',
    'shopify/themes/sense',
    'shopify/themes/studio',
    '/dawn/', '/refresh/', '/craft/', '/sense/', '/studio/'
  ];

  const hasDefaultThemePath = pathIndicators.some(indicator => 
    resourceId.toLowerCase().includes(indicator) || 
    gid.toLowerCase().includes(indicator)
  );

  if (hasDefaultThemePath) {
    return {
      shouldSkip: true,
      reason: 'Shopify默认主题路径，由官方处理多语言'
    };
  }

  // 检查内容特征：典型的默认主题占位符文本
  const contentFields = resource.contentFields || {};
  const defaultPlaceholders = [
    'Talk about your brand',
    'Share information about your brand',
    'Describe a product, share announcements',
    'Your content goes here',
    'Add your own custom content',
    'Use this text to share information'
  ];

  // 检查是否包含大量默认占位符文本
  let placeholderCount = 0;
  let totalTextFields = 0;

  function countPlaceholders(obj) {
    if (typeof obj === 'string') {
      totalTextFields++;
      if (defaultPlaceholders.some(placeholder => 
        obj.toLowerCase().includes(placeholder.toLowerCase())
      )) {
        placeholderCount++;
      }
    } else if (typeof obj === 'object' && obj !== null) {
      Object.values(obj).forEach(countPlaceholders);
    }
  }

  countPlaceholders(contentFields);

  // 如果80%以上的文本字段都是默认占位符，认为是默认主题
  if (totalTextFields > 0 && (placeholderCount / totalTextFields) >= 0.8) {
    return {
      shouldSkip: true,
      reason: `包含${placeholderCount}/${totalTextFields}个默认占位符，疑似默认主题内容`
    };
  }

  // 不跳过
  return {
    shouldSkip: false,
    reason: null
  };
}

function buildSectionTypeMap(themeData) {
  const map = {};
  if (!themeData || typeof themeData !== 'object') {
    return map;
  }

  const sections = themeData.sections;
  if (sections && typeof sections === 'object') {
    for (const [sectionId, sectionConfig] of Object.entries(sections)) {
      if (sectionConfig && typeof sectionConfig === 'object' && sectionConfig.type) {
        map[sectionId] = sectionConfig.type;
      }
    }
  }

  return map;
}

function getSectionTypeFromKey(fullKey, sectionTypeMap) {
  if (!sectionTypeMap) {
    return null;
  }

  const match = fullKey.match(/^sections\.([^./]+)/);
  if (!match) {
    return null;
  }

  return sectionTypeMap[match[1]] || null;
}

/**
 * 保护Liquid变量和特殊标记
 * @param {string} text - 原始文本
 * @returns {object} 保护后的文本和映射
 */
function protectLiquidVariables(text) {
  const protectedMap = new Map();
  let protectedText = text;
  let index = 0;
  
  // 保护 {{ variable }} 格式
  protectedText = protectedText.replace(/\{\{[^}]+\}\}/g, (match) => {
    const placeholder = `__LIQUID_VAR_${index}__`;
    protectedMap.set(placeholder, match);
    index++;
    return placeholder;
  });
  
  // 保护 {% tag %} 格式
  protectedText = protectedText.replace(/\{%[^%]+%\}/g, (match) => {
    const placeholder = `__LIQUID_TAG_${index}__`;
    protectedMap.set(placeholder, match);
    index++;
    return placeholder;
  });
  
  return { protectedText, protectedMap };
}

/**
 * 恢复Liquid变量和特殊标记
 * @param {string} text - 翻译后的文本
 * @param {Map} protectedMap - 保护映射
 * @returns {string} 恢复后的文本
 */
function restoreLiquidVariables(text, protectedMap) {
  let restoredText = text;
  
  for (const [placeholder, original] of protectedMap) {
    restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
  }
  
  return restoredText;
}

/**
 * Theme JSON数据递归翻译
 * @param {any} data - JSON数据
 * @param {string} targetLang - 目标语言
 * @param {string} parentKey - 父级键名（用于上下文）
 * @returns {Promise<any>} 翻译后的数据
 */
async function translateThemeJsonData(data, targetLang, parentKey = '', options = {}) {
  if (!options.__fieldContextResolver) {
    options.__fieldContextResolver = (field) => {
      if (!options.sectionTypeMap) {
        return {};
      }
      const sectionType = getSectionTypeFromKey(field.key, options.sectionTypeMap);
      return sectionType ? { sectionType } : {};
    };
  }

  const computeFieldContext = options.__fieldContextResolver;
  const metricsTracker = options.__metricsTracker;

  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    const translatedArray = [];
    const stringFields = data
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => typeof item === 'string')
      .map(({ item, index }) => ({ key: `${parentKey}[${index}]`, value: item }));

    let evaluationMap = new Map();
    if (stringFields.length) {
      recordBatchMetrics(metricsTracker, stringFields.length);
      evaluationMap = evaluateThemeFieldsBatch(stringFields, {
        computeContext: computeFieldContext,
        returnAsMap: true
      });
    }

    for (let index = 0; index < data.length; index++) {
      const item = data[index];
      const itemKey = `${parentKey}[${index}]`;

      if (typeof item === 'string') {
        const evaluation = evaluationMap.get(itemKey) || {
          shouldTranslate: false,
          reason: '空值或非字符串'
        };

        if (evaluation.shouldTranslate) {
          const ctx = getErrorContext();
          try {
            const { protectedText, protectedMap } = protectLiquidVariables(item);
            let translatedText = await translateThemeValue(protectedText, targetLang);
            translatedText = restoreLiquidVariables(translatedText, protectedMap);
            translatedText = await postProcessTranslation(translatedText, targetLang, item, {
              linkConversion: options?.linkConversion
            });
            ctx?.recordTranslation(itemKey);
            translatedArray.push(translatedText);
            logger.debug(`[Theme翻译] 成功翻译 ${itemKey}: "${item.substring(0, 50)}..."`);
          } catch (error) {
            logger.error(`[Theme翻译] 翻译失败 ${itemKey}:`, error?.message || error);
            ctx?.recordError(error, { fieldPath: itemKey });
            translatedArray.push(item);
          }
        } else {
          const ctx = getErrorContext();
          ctx?.recordSkip(evaluation.reason, itemKey, item);
          translatedArray.push(item);
        }
      } else if (item && typeof item === 'object') {
        translatedArray.push(await translateThemeJsonData(item, targetLang, itemKey, options));
      } else {
        translatedArray.push(item);
      }
    }

    return translatedArray;
  }

  const translated = {};
  const objectEntries = Object.entries(data);
  const stringFields = objectEntries
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => ({ key: parentKey ? `${parentKey}.${key}` : key, value }));
  let objectEvaluationMap = new Map();
  if (stringFields.length) {
    recordBatchMetrics(metricsTracker, stringFields.length);
    objectEvaluationMap = evaluateThemeFieldsBatch(stringFields, {
      computeContext: computeFieldContext,
      returnAsMap: true
    });
  }

  for (const [key, value] of objectEntries) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;

    if (typeof value === 'string') {
      const evaluation = objectEvaluationMap.get(fullKey) || {
        shouldTranslate: false,
        reason: '空值或非字符串'
      };

      if (evaluation.shouldTranslate) {
        const ctx = getErrorContext();
        try {
          const { protectedText, protectedMap } = protectLiquidVariables(value);
          let translatedText = await translateThemeValue(protectedText, targetLang);
          translatedText = restoreLiquidVariables(translatedText, protectedMap);
          translatedText = await postProcessTranslation(translatedText, targetLang, value, {
            linkConversion: options?.linkConversion
          });

          if (isThemeUrlField(fullKey)) {
            const validation = validateThemeUrl(translatedText, { fieldPath: fullKey, targetLang });
            if (!validation.valid) {
              logger.warn('[Theme翻译] URL校验失败，回退原值', {
                fieldPath: fullKey,
                original: value,
                translated: translatedText,
                error: validation.error
              });
              ctx?.recordSkip('URL格式无效', fullKey, translatedText);
              translated[key] = value;
              continue;
            }
          }

          translated[key] = translatedText;
          ctx?.recordTranslation(fullKey);
          logger.debug(
            `[Theme翻译] 成功翻译 ${fullKey}: "${value.substring(0, 50)}..." -> "${translatedText.substring(0, 50)}..."`
          );
        } catch (error) {
          logger.error(`[Theme翻译] 翻译失败 ${fullKey}:`, error?.message || error);
          ctx?.recordError(error, { fieldPath: fullKey });
          translated[key] = value;
        }
      } else {
        const ctx = getErrorContext();
        ctx?.recordSkip(evaluation.reason, fullKey, value);
        translated[key] = value;
      }
    } else if (value && typeof value === 'object') {
      translated[key] = await translateThemeJsonData(value, targetLang, fullKey, options);
    } else {
      translated[key] = value;
    }
  }

  return translated;
}

/**
 * Theme资源主翻译函数
 * @param {Object} resource - Theme资源对象
 * @param {string} targetLang - 目标语言
 * @returns {Promise<Object>} 翻译结果
 */
export async function translateThemeResource(resource, targetLang, options = {}) {
  const errorContext = new ThemeErrorContext(resource, targetLang, { sectionTypeMap: {} });
  const metricsTracker = createMetricsTracker();
  const runtimeOptions = { ...options, __metricsTracker: metricsTracker };
  const operationStart = performance.now();
  const startHeap = process.memoryUsage().heapUsed;
  let translationError = null;
  let translationSkipped = false;
  let translationSkipReason = null;
  let result;

  return themeErrorContextStorage.run(errorContext, async () => {
    try {
      logger.debug(`[Theme翻译] 开始翻译Theme资源: ${resource.resourceType} - ${resource.id}`);

      const defaultThemeCheck = checkDefaultThemeContent(resource);
      if (defaultThemeCheck.shouldSkip) {
        errorContext.recordSkip(defaultThemeCheck.reason, 'theme', resource.title);
        logger.warn('[Theme翻译] 跳过Shopify默认主题内容', {
          resourceId: resource.id,
          reason: defaultThemeCheck.reason,
          title: resource.title?.slice(0, 50)
        });
        translationSkipped = true;
        translationSkipReason = defaultThemeCheck.reason;

        return {
          titleTrans: resource.title,
          descTrans: null,
          handleTrans: null,
          seoTitleTrans: null,
          seoDescTrans: null,
          translationFields: {},
          skipped: true,
          skipReason: defaultThemeCheck.reason
        };
      }

      result = {
        titleTrans: resource.title,
        descTrans: null,
        handleTrans: null,
        seoTitleTrans: null,
        seoDescTrans: null,
        translationFields: {}
      };

      const contentFields = resource.contentFields || {};

      if (!contentFields || Object.keys(contentFields).length === 0) {
        logger.error(`[Theme翻译] 错误：Theme资源缺少contentFields数据: ${resource.id}`);
        throw new Error(`Theme资源缺少必要的contentFields数据。请重新扫描Theme资源。`);
      }

      const resourceType = resource.resourceType.toUpperCase();

      switch (resourceType) {
        case 'ONLINE_STORE_THEME':
        case 'ONLINE_STORE_THEME_JSON_TEMPLATE':
        case 'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS': {
          logger.debug(`[Theme翻译] 处理JSON模板类型资源`);

          if (contentFields.themeData) {
            const hasValidThemeData =
              contentFields.themeData &&
              contentFields.themeData !== 0 &&
              contentFields.themeData !== '0' &&
              String(contentFields.themeData).trim() !== '';

            if (!hasValidThemeData && contentFields.dynamicFields) {
              const reason = 'Theme资源结构不匹配(无有效themeData)';
              errorContext.recordSkip(reason, 'themeData', contentFields.themeData);
              logger.warn(`[Theme翻译] Theme资源缺少有效themeData，跳过翻译: ${resource.id}`);
              translationSkipped = true;
              translationSkipReason = reason;
              return {
                ...result,
                skipped: true,
                skipReason: reason
              };
            }

            try {
              logger.debug(`[Theme翻译] 解析并翻译themeData`);
              const themeData =
                typeof contentFields.themeData === 'string'
                  ? JSON.parse(contentFields.themeData)
                  : contentFields.themeData;

              const sectionTypeMap = buildSectionTypeMap(themeData);
              errorContext.setSectionTypeMap(sectionTypeMap);
              const translatedData = await translateThemeJsonData(
                themeData,
                targetLang,
                '',
                { ...runtimeOptions, sectionTypeMap }
              );
              result.translationFields.themeData = JSON.stringify(translatedData, null, 2);
              logger.debug(`[Theme翻译] themeData翻译完成`);
            } catch (error) {
              logger.error('[Theme翻译] 处理themeData失败:', error);
              errorContext.recordError(error, { fieldPath: 'themeData', phase: 'themeData' });
              result.translationFields.themeData = contentFields.themeData;
            }
          }

          if (contentFields.dynamicFields) {
            logger.debug(
              `[Theme翻译] 处理dynamicFields，共${Object.keys(contentFields.dynamicFields).length}个字段`
            );
            const translatedDynamic = {};

            for (const [key, fieldData] of Object.entries(contentFields.dynamicFields)) {
              const fieldValue = Object.prototype.hasOwnProperty.call(fieldData, 'value')
                ? fieldData.value
                : fieldData;
              if (typeof fieldValue === 'string') {
                recordFieldMetrics(metricsTracker);
              }

              let decision =
                typeof fieldValue === 'string'
                  ? shouldTranslateThemeFieldWithReason(key, fieldValue)
                  : { shouldTranslate: false, reason: '空值或非字符串' };

              let { shouldTranslate, reason } = decision;

              // 技术字段（如 url、id、class）不进入 JSON Template override，避免错误翻译导致 Shopify 验证失败
              if (!shouldTranslate && reason !== '技术字段' && resourceType === 'ONLINE_STORE_THEME_JSON_TEMPLATE') {
                if (
                  typeof fieldValue === 'string' &&
                  fieldValue.length >= 2 &&
                  /[a-zA-Z]/.test(fieldValue)
                ) {
                  const isTechnical = /^(https?:\/\/|#[0-9A-Fa-f]{3,6}|[\d]+px|[\d]+%)$/.test(fieldValue);
                  const isBrand = /[®™]/.test(fieldValue) || /^(Onewind|Shopify)/i.test(fieldValue);

                  if (!isTechnical && !isBrand && !fieldValue.includes('{{') && !fieldValue.includes('{%')) {
                    logger.debug(
                      `[Theme翻译] JSON Template特殊处理，强制翻译: ${key} = "${fieldValue}"`
                    );
                    shouldTranslate = true;
                    reason = null;
                  }
                }
              }

              if (shouldTranslate && typeof fieldValue === 'string') {
                try {
                  const { protectedText, protectedMap } = protectLiquidVariables(fieldValue);
                  let translatedText = await translateThemeValue(protectedText, targetLang);
                  translatedText = restoreLiquidVariables(translatedText, protectedMap);
                  translatedText = await postProcessTranslation(translatedText, targetLang, fieldValue, {
                    linkConversion: runtimeOptions?.linkConversion
                  });

                  translatedDynamic[key] = {
                    value: translatedText,
                    digest: fieldData.digest || null,
                    original: fieldValue
                  };
                  errorContext.recordTranslation(key);
                } catch (error) {
                  logger.error(`[Theme翻译] 翻译dynamicField失败 ${key}:`, error?.message || error);
                  errorContext.recordError(error, { fieldPath: key, section: 'dynamicFields' });
                  translatedDynamic[key] = fieldData;
                }
              } else {
                if (reason) {
                  errorContext.recordSkip(reason, key, fieldValue);
                }
                translatedDynamic[key] = fieldData;
              }
            }

            result.translationFields.dynamicFields = translatedDynamic;
            logger.debug(`[Theme翻译] dynamicFields处理完成`);
          }

          if (contentFields.translatableFields && Array.isArray(contentFields.translatableFields)) {
            logger.debug(`[Theme翻译] 处理translatableFields数组`);
            const translatedFields = [];

            for (const field of contentFields.translatableFields) {
              if (typeof field.value === 'string') {
                recordFieldMetrics(metricsTracker);
                const { shouldTranslate, reason } = shouldTranslateThemeFieldWithReason(
                  field.key,
                  field.value
                );

                if (shouldTranslate) {
                  try {
                    const { protectedText, protectedMap } = protectLiquidVariables(field.value);
                    let translatedText = await translateThemeValue(protectedText, targetLang);
                    translatedText = restoreLiquidVariables(translatedText, protectedMap);
                    translatedText = await postProcessTranslation(translatedText, targetLang, field.value, {
                      linkConversion: runtimeOptions?.linkConversion
                    });

                    translatedFields.push({
                      ...field,
                      value: translatedText,
                      original: field.value
                    });
                    errorContext.recordTranslation(field.key);
                  } catch (error) {
                    logger.error(`[Theme翻译] 翻译field失败 ${field.key}:`, error?.message || error);
                    errorContext.recordError(error, { fieldPath: field.key, section: 'translatableFields' });
                    translatedFields.push(field);
                  }
                } else {
                  errorContext.recordSkip(reason, field.key, field.value);
                  translatedFields.push(field);
                }
              } else {
                errorContext.recordSkip('空值或非字符串', field.key, field.value);
                translatedFields.push(field);
              }
            }

            result.translationFields.translatableFields = translatedFields;
          }
          break;
        }
        case 'ONLINE_STORE_THEME_LOCALE_CONTENT': {
          logger.debug(`[Theme翻译] 处理本地化内容类型资源`);

          if (contentFields.localeContent) {
            try {
              recordFieldMetrics(metricsTracker);
              const { protectedText, protectedMap } = protectLiquidVariables(contentFields.localeContent);
              let translatedText = await translateThemeValue(protectedText, targetLang);
              translatedText = restoreLiquidVariables(translatedText, protectedMap);
              translatedText = await postProcessTranslation(translatedText, targetLang, contentFields.localeContent, {
                linkConversion: runtimeOptions?.linkConversion
              });
              result.translationFields.localeContent = translatedText;
              errorContext.recordTranslation('localeContent');
            } catch (error) {
              logger.error('[Theme翻译] 翻译localeContent失败:', error);
              errorContext.recordError(error, { fieldPath: 'localeContent' });
              result.translationFields.localeContent = contentFields.localeContent;
            }
          }
          break;
        }
        case 'ONLINE_STORE_THEME_APP_EMBED':
        case 'ONLINE_STORE_THEME_SECTION_GROUP':
        case 'ONLINE_STORE_THEME_SETTINGS_CATEGORY': {
          logger.debug(`[Theme翻译] 处理设置类型资源`);

          for (const [key, value] of Object.entries(contentFields)) {
            if (typeof value === 'string') {
              recordFieldMetrics(metricsTracker);
              const { shouldTranslate, reason } = shouldTranslateThemeFieldWithReason(key, value);

              if (shouldTranslate) {
                try {
                  const { protectedText, protectedMap } = protectLiquidVariables(value);
                  let translatedText = await translateThemeValue(protectedText, targetLang);
                  translatedText = restoreLiquidVariables(translatedText, protectedMap);
                  translatedText = await postProcessTranslation(translatedText, targetLang, value, {
                    linkConversion: runtimeOptions?.linkConversion
                  });

                  result.translationFields[key] = translatedText;
                  errorContext.recordTranslation(key);
                } catch (error) {
                  logger.error(`[Theme翻译] 翻译字段失败 ${key}:`, error);
                  errorContext.recordError(error, { fieldPath: key, section: 'settings' });
                  result.translationFields[key] = value;
                }
              } else {
                errorContext.recordSkip(reason, key, value);
                result.translationFields[key] = value;
              }
            } else if (value && typeof value === 'object') {
              result.translationFields[key] = await translateThemeJsonData(value, targetLang, key, runtimeOptions);
            } else {
              result.translationFields[key] = value;
            }
          }
          break;
        }
        default: {
          logger.debug(`[Theme翻译] 未知的Theme资源类型: ${resourceType}，使用通用处理`);

          for (const [key, value] of Object.entries(contentFields)) {
            if (typeof value === 'string') {
              recordFieldMetrics(metricsTracker);
              const { shouldTranslate, reason } = shouldTranslateThemeFieldWithReason(key, value);

              if (shouldTranslate) {
                try {
                  const { protectedText, protectedMap } = protectLiquidVariables(value);
                  let translatedText = await translateThemeValue(protectedText, targetLang);
                  translatedText = restoreLiquidVariables(translatedText, protectedMap);
                  translatedText = await postProcessTranslation(translatedText, targetLang, value, {
                    linkConversion: runtimeOptions?.linkConversion
                  });
                  result.translationFields[key] = translatedText;
                  errorContext.recordTranslation(key);
                } catch (error) {
                  logger.error(`[Theme翻译] 翻译字段失败 ${key}:`, error);
                  errorContext.recordError(error, { fieldPath: key, section: 'generic' });
                  result.translationFields[key] = value;
                }
              } else {
                errorContext.recordSkip(reason, key, value);
                result.translationFields[key] = value;
              }
            } else {
              result.translationFields[key] = value;
            }
          }
        }
      }

      if (result.translationFields) {
        result.translationFields = flattenTranslationFields(result.translationFields);
      }

      logger.info('[Theme翻译] Theme资源翻译完成', {
        resourceId: resource.id,
        resourceType: resource.resourceType,
        fieldCount: Object.keys(result.translationFields || {}).length,
        structure: 'flattened'
      });

      // 记录翻译结果概要
      const { totalFields, translatedFields, skipStats, coverage } = errorContext.getTotals();
      logger.info('[Theme翻译] 翻译结果概要', {
        resourceId: resource.id,
        resourceType: resource.resourceType,
        targetLang,
        totalFields,
        translatedFields,
        skipStats,
        coverage
      });

      return result;
    } catch (error) {
      translationError = error;
      errorContext.recordError(error, { phase: 'main', operation: 'translateThemeResource' });
      throw error;
    } finally {
      const durationMs = Math.max(0, performance.now() - operationStart);
      const memoryDelta = Math.max(0, process.memoryUsage().heapUsed - startHeap);
      const finalSkipped = translationSkipped || Boolean(result?.skipped);
      const finalSkipReason = translationSkipReason || result?.skipReason || null;
      try {
        await collectMetric(
          METRIC_OPERATION,
          {
            resourceId: resource.id,
            resourceType: resource.resourceType,
            shopId: resource.shopId,
            language: targetLang,
            durationMs: Math.round(durationMs),
            memoryDelta,
            fieldCount: metricsTracker.totalFields,
            batchCount: metricsTracker.batchCalls,
            skipped: finalSkipped,
            skipReason: finalSkipReason
          },
          { success: !translationError }
        );
      } catch (metricError) {
        logger.warn('[Theme翻译] collectMetric失败', { error: metricError?.message || metricError });
      }
      try {
        await errorContext.flush();
      } catch (flushError) {
        logger.error('[Theme翻译] 错误提交失败', { error: flushError?.message || flushError });
      }
    }
  });
}

/**
 * 验证Theme翻译结果
 * @param {Object} original - 原始数据
 * @param {Object} translated - 翻译后数据
 * @returns {boolean} 验证是否通过
 */
export function validateThemeTranslation(original, translated) {
  // 验证JSON结构是否保持一致
  if (typeof original !== typeof translated) {
    logger.error('[Theme翻译] 验证失败：数据类型不一致');
    return false;
  }
  
  if (typeof original === 'object' && original !== null) {
    const originalKeys = Object.keys(original);
    const translatedKeys = Object.keys(translated);
    
    // 验证键的数量是否一致
    if (originalKeys.length !== translatedKeys.length) {
      logger.error('[Theme翻译] 验证失败：键数量不一致');
      return false;
    }
    
    // 验证所有键都存在
    for (const key of originalKeys) {
      if (!(key in translated)) {
        logger.error(`[Theme翻译] 验证失败：缺少键 ${key}`);
        return false;
      }
    }
  }
  
  return true;
}

// 导出工具函数供测试使用
export {
  shouldTranslateThemeField,
  shouldTranslateThemeFieldWithReason,
  protectLiquidVariables,
  restoreLiquidVariables,
  translateThemeJsonData
};
