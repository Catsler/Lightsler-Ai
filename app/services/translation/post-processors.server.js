import { logger } from '../../utils/logger.server.js';
import { convertLinksForLocale } from '../link-converter.server.js';

const BASE_PROCESSORS = [normalizeLineEndings, trimResult, ensureFallback];

function normalizeLineEndings(text = '') {
  return text.replace(/\r\n?/g, '\n');
}

function trimResult(text = '') {
  return text.trim();
}

function ensureFallback(text, context = {}) {
  if (text && text.trim()) {
    return text;
  }
  const original = typeof context.originalText === 'string' ? context.originalText : '';
  return original.trim() ? original : text;
}

function shouldApplyLinkConversion(context = {}) {
  const config = context.linkConversion;
  if (!config) return false;
  if (config.enabled === false) return false;
  if (!config.marketConfig) return false;
  const locale = config.locale || context.targetLang;
  return Boolean(locale);
}

function createLinkConversionProcessor(context) {
  const { linkConversion = {}, targetLang } = context;
  const locale = linkConversion.locale || targetLang;
  const marketConfig = linkConversion.marketConfig;
  const options = linkConversion.options || {};
  return async (input) => {
    try {
      return convertLinksForLocale(input, locale, marketConfig, options);
    } catch (error) {
      logger.warn('[PostProcess] 链接转换处理失败', {
        error: error.message,
        locale,
        hasConfig: Boolean(marketConfig)
      });
      return input;
    }
  };
}

function buildPipeline(context = {}) {
  const pipeline = [...BASE_PROCESSORS];

  if (!context.skipLinkConversion && shouldApplyLinkConversion(context)) {
    pipeline.push(createLinkConversionProcessor(context));
  }

  if (Array.isArray(context.extraProcessors)) {
    context.extraProcessors
      .filter(fn => typeof fn === 'function')
      .forEach(fn => pipeline.push(fn));
  }

  return pipeline;
}

export async function applyPostProcessors(text, context = {}) {
  if (text == null) {
    return text;
  }
  if (typeof text !== 'string') {
    return text;
  }

  let current = text;

  // 统一恢复 HTML 占位符（如果需要）
  if (context.tagMap?.size && current.includes('__PROTECTED_')) {
    const { restoreHtmlTags } = await import('./chunking.server.js');
    current = restoreHtmlTags(current, context.tagMap);
  }

  const pipeline = buildPipeline(context);

  for (const processor of pipeline) {
    try {
      const output = await processor(current, context);
      if (typeof output === 'string') {
        current = output;
      } else if (output != null) {
        current = String(output);
      }
    } catch (error) {
      logger.warn('[PostProcess] 处理器执行失败', {
        processor: processor.name || 'anonymous',
        error: error.message
      });
    }
  }

  return current;
}
