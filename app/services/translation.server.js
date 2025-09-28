/**
 * GPT翻译API Facade（兼容层）
 * 将主要实现委托给 translation/core.server.js，保留原有导出接口
 */

export {
  translationLogger,
  isBrandWord,
  translateUrlHandle,
  translateTextWithFallback,
  postProcessTranslation,
  translateText,
  translateTextEnhanced,
  validateTranslation,
  validateTranslationConfig,
  getTranslationServiceStatus,
  getTranslationStats,
  getTranslationLogs,
  getTranslationOrchestratorStatus,
  translateResource
} from './translation/core.server.js';

// Import translateThemeResource from dedicated theme service
export { translateThemeResource } from './theme-translation.server.js';
