/**
 * GPT翻译API Facade（兼容层）
 * 将主要实现委托给 translation/core.server.js，保留原有导出接口
 */

export {
  translationLogger,
  isBrandWord,
  postProcessTranslation,
  translateText,
  validateTranslation,
  runTranslationDiagnostics,
  getTranslationOrchestratorStatus
} from './translation/core.server.js';

export {
  validateTranslationConfig,
  getTranslationServiceStatus
} from './translation/config-check.server.js';

export {
  getTranslationStats,
  getTranslationLogs,
  getPlaceholderErrorStats
} from './translation/logs.server.js';

export { translateResource } from './translation/resource-translator.server.js';

// 策略化调度的兼容导出
export { translateTextWithFallbackOrchestrated as translateTextWithFallback } from './translation/strategy-orchestrator.server.js';
export { translateTextEnhancedStrategy as translateTextEnhanced } from './translation/enhanced-strategy.server.js';

// Import translateThemeResource from dedicated theme service
export { translateThemeResource } from './theme-translation.server.js';
