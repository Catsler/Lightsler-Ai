import { shouldTranslate, schedule, validate } from '../hooks-manager.server.js';
import { translateText, postProcessTranslation, translationLogger } from './core.server.js';
import { logger } from '../../utils/logger.server.js';

function normalizeOptionValue(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'object' && value !== null) {
    if (Object.prototype.hasOwnProperty.call(value, 'value') && value.value !== undefined) {
      return String(value.value).trim();
    }
    if (Object.prototype.hasOwnProperty.call(value, 'label') && value.label !== undefined) {
      return String(value.label).trim();
    }

    try {
      const jsonStr = JSON.stringify(value);
      logger.warn('[normalizeOptionValue] 对象类型选项值已序列化', {
        originalValue: value,
        keys: Object.keys(value),
        serialized: jsonStr
      });
      return jsonStr;
    } catch (err) {
      logger.error('[normalizeOptionValue] JSON序列化失败，使用String转换', {
        error: err.message,
        value: value
      });
      return String(value).trim();
    }
  }

  if (value !== undefined && value !== null) {
    return String(value).trim();
  }

  return '';
}

export async function translateResource(resource, targetLang, options = {}) {
  if (options && options.__mock_shouldTranslate === false) {
    return {
      skipped: true,
      reason: 'skipped_by_hooks',
      translations: {}
    };
  }

  translationLogger.info('开始翻译资源', {
    resourceId: resource.id,
    resourceType: resource.resourceType,
    targetLang
  });

  const translationContext = {
    text: resource.title || resource.description || '',
    targetLang,
    resourceType: resource.resourceType,
    shopId: options.shopId,
    resourceId: resource.id,
    sessionId: options.sessionId,
    requestId: options.requestId,
    metadata: {
      resourceData: {
        hasTitle: !!resource.title,
        hasDescription: !!resource.description,
        hasDescriptionHtml: !!resource.descriptionHtml,
        hasSeoFields: !!(resource.seoTitle || resource.seoDescription)
      },
      ...options.metadata
    }
  };

  const shouldTranslateResult = await shouldTranslate(translationContext);
  if (!shouldTranslateResult) {
    translationLogger.warn('资源翻译被hooks跳过', {
      resourceId: resource.id,
      resourceType: resource.resourceType,
      reason: 'hook_should_translate'
    });
    return {
      skipped: true,
      reason: 'skipped_by_hooks',
      translations: {}
    };
  }

  const normalizedResourceType = (resource.resourceType || '').toUpperCase();
  if (normalizedResourceType.includes('THEME')) {
    translationLogger.info('检测到Theme资源，使用专用翻译逻辑', {
      resourceType: resource.resourceType
    });

    try {
      const { translateThemeResource } = await import('../theme-translation.server.js');
      const themeResult = await translateThemeResource(resource, targetLang, options);
      return {
        skipped: themeResult.skipped || false,
        skipReason: themeResult.skipReason,
        translations: themeResult
      };
    } catch (error) {
      translationLogger.error('Theme资源翻译失败', { error: error.message });
      throw error;
    }
  }

  const resourceTranslationTask = async () => {
    const baseTranslationOptions = {
      shopId: options.shopId,
      resourceType: resource.resourceType,
      resourceId: resource.id,
      operation: 'translate_resource',
      sessionId: options.sessionId,
      requestId: options.requestId,
      sourceLanguage: options.sourceLanguage,
      batchId: options.batchId
    };

    const translateField = async (value, fieldName, extraOptions = {}) => {
      if (!value) return value;
      return translateText(value, targetLang, {
        ...baseTranslationOptions,
        fieldName,
        ...extraOptions
      });
    };

    const translated = {
      titleTrans: null,
      descTrans: null,
      handleTrans: null,
      summaryTrans: null,
      labelTrans: null,
      seoTitleTrans: null,
      seoDescTrans: null
    };

    try {
      if (resource.title) {
        translated.titleTrans = await translateField(resource.title, 'title');
        translated.titleTrans = await postProcessTranslation(
          translated.titleTrans,
          targetLang,
          resource.title,
          { linkConversion: options.linkConversion }
        );
        translationLogger.info('标题翻译完成', {
          original: resource.title,
          translated: translated.titleTrans
        });
      }

      let descriptionToTranslate = null;
      if (resource.resourceType === 'page') {
        descriptionToTranslate = resource.description || resource.descriptionHtml;
      } else {
        descriptionToTranslate = resource.descriptionHtml || resource.description;
      }

      if (descriptionToTranslate) {
        translated.descTrans = await translateField(descriptionToTranslate, 'description');
        translated.descTrans = await postProcessTranslation(
          translated.descTrans,
          targetLang,
          descriptionToTranslate,
          { linkConversion: options.linkConversion }
        );
        translationLogger.info('描述翻译完成', {
          length: descriptionToTranslate.length
        });
      }

      if (resource.handle) {
        translationLogger.info('URL handle保持原始值（不翻译）', {
          handle: resource.handle
        });
        translated.handleTrans = null;
      }

      if (resource.summary) {
        translated.summaryTrans = await translateField(resource.summary, 'summary');
        translated.summaryTrans = await postProcessTranslation(
          translated.summaryTrans,
          targetLang,
          resource.summary,
          { linkConversion: options.linkConversion }
        );
      }

      if (resource.label) {
        translated.labelTrans = await translateField(resource.label, 'label');
        translated.labelTrans = await postProcessTranslation(
          translated.labelTrans,
          targetLang,
          resource.label,
          { linkConversion: options.linkConversion }
        );
      }

      if (resource.seoTitle) {
        translated.seoTitleTrans = await translateField(resource.seoTitle, 'seoTitle');
        translated.seoTitleTrans = await postProcessTranslation(
          translated.seoTitleTrans,
          targetLang,
          resource.seoTitle,
          { linkConversion: options.linkConversion }
        );
        translationLogger.info('SEO标题翻译完成', {
          original: resource.seoTitle,
          translated: translated.seoTitleTrans
        });
      }

      if (resource.seoDescription) {
        translated.seoDescTrans = await translateField(resource.seoDescription, 'seoDescription');
        translated.seoDescTrans = await postProcessTranslation(
          translated.seoDescTrans,
          targetLang,
          resource.seoDescription,
          { linkConversion: options.linkConversion }
        );
        translationLogger.info('SEO描述翻译完成');
      }

      const contentFields = resource.contentFields || {};
      const dynamicTranslationFields = {};

      switch ((resource.resourceType || '').toUpperCase()) {
        case 'PRODUCT_OPTION':
        case 'PRODUCT_OPTION_VALUE':
          if (contentFields.name) {
            const normalizedName = normalizeOptionValue(contentFields.name);
            if (normalizedName) {
              dynamicTranslationFields.name = await translateField(normalizedName, 'name');
              dynamicTranslationFields.name = await postProcessTranslation(
                dynamicTranslationFields.name,
                targetLang,
                normalizedName,
                { linkConversion: options.linkConversion }
              );
            } else {
              logger.warn('[PRODUCT_OPTION] 跳过空name值', {
                originalName: contentFields.name,
                type: typeof contentFields.name,
                resourceType: resource?.resourceType
              });
            }
          }
          if (Array.isArray(contentFields.values) && contentFields.values.length > 0) {
            dynamicTranslationFields.values = [];
            for (const value of contentFields.values) {
              const normalizedValue = normalizeOptionValue(value);

              if (!normalizedValue) {
                logger.warn('[PRODUCT_OPTION] 跳过空值', {
                  originalValue: value,
                  type: typeof value,
                  resourceType: resource?.resourceType
                });
                continue;
              }

              const translatedValue = await translateField(normalizedValue, 'value');
              dynamicTranslationFields.values.push(
                await postProcessTranslation(
                  translatedValue,
                  targetLang,
                  normalizedValue,
                  { linkConversion: options.linkConversion }
                )
              );
            }
          }
          break;

        case 'PRODUCT_METAFIELD':
          if (typeof contentFields.value === 'string' && contentFields.value.trim()) {
            const translatedValue = await translateField(contentFields.value, 'value');
            dynamicTranslationFields.value = await postProcessTranslation(
              translatedValue,
              targetLang,
              contentFields.value,
              { linkConversion: options.linkConversion }
            );
          }
          break;

        default:
          break;
      }

      if (Object.keys(dynamicTranslationFields).length > 0) {
        translated.translationFields = {
          ...(translated.translationFields || {}),
          ...dynamicTranslationFields
        };
      }

      const totalFields = Object.values(translated).filter(v => v !== null).length;
      const processedFields = Object.keys(translated).filter(key => translated[key] !== null);

      translationLogger.info('翻译完成统计', {
        totalFields,
        processedFields: processedFields.join(', ')
      });

      return {
        skipped: false,
        translations: translated
      };
    } catch (error) {
      translationLogger.error('资源翻译失败', {
        resourceId: resource.id,
        error: error.message
      });
      throw error;
    }
  };

  const scheduleContext = {
    priority: options.priority,
    retryCount: options.retryCount ?? 0,
    deadlineMs: options.deadlineMs,
    metadata: {
      resourceType: resource.resourceType,
      resourceId: resource.id,
      fieldCount: Object.keys(resource).length
    }
  };

  const result = await schedule(resourceTranslationTask, scheduleContext);

  const validationResult = await validate(result, translationContext);
  if (!validationResult.success) {
    translationLogger.warn('资源翻译结果验证失败', {
      resourceId: resource.id,
      resourceType: resource.resourceType,
      validationErrors: validationResult.errors,
      validationWarnings: validationResult.warnings
    });

    if (validationResult.errors && validationResult.errors.length > 0) {
      throw new Error(`资源翻译验证失败: ${validationResult.errors.join(', ')}`);
    }
  }

  return result;
}
