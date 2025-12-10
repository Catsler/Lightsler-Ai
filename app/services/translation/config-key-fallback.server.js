import { buildConfigKeyPrompt } from './prompts.server.js';
import { executeTranslationRequest } from './core.server.js';
import { logger } from '../../utils/logger.server.js';

const CONFIG_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

export function isLikelyConfigKey(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  return CONFIG_KEY_PATTERN.test(trimmed);
}

function toReadableConfigKey(text) {
  return text
    .split('_')
    .filter(Boolean)
    .map(segment => segment.trim())
    .join(' ');
}

export async function translateConfigKeyWithFallback(originalText, targetLang) {
  const normalizedText = toReadableConfigKey(originalText);
  const startTime = Date.now();

  logger.info('配置键备用翻译策略触发', {
    originalText,
    normalizedText,
    targetLang
  });

  const fallbackPrompt = buildConfigKeyPrompt(targetLang);

  const result = await executeTranslationRequest({
    text: normalizedText,
    targetLang,
    systemPrompt: fallbackPrompt,
    strategy: 'config-key',
    context: {
      functionName: 'translateConfigKeyWithFallback',
      originalText,
      normalizedText
    }
  });

  if (!result.success) {
    return {
      success: false,
      text: originalText,
      error: result.error || '备用翻译调用失败',
      isOriginal: true,
      language: targetLang
    };
  }

  if (!result.text || result.text.trim() === '') {
    return {
      success: false,
      text: originalText,
      error: '备用翻译返回空文本',
      isOriginal: true,
      language: targetLang
    };
  }

  const processingTime = Date.now() - startTime;
  logger.info('配置键备用翻译完成', {
    originalText,
    normalizedText,
    translatedText: result.text,
    processingTime
  });

  return {
    ...result,
    isOriginal: false,
    language: targetLang,
    processingTime
  };
}
