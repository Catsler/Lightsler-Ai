import { translateLongTextStrategy } from './long-text-strategy.server.js';
import { translateTextWithFallbackOrchestrated } from './strategy-orchestrator.server.js';
import { translateTextEnhancedStrategy } from './enhanced-strategy.server.js';

const defaultRunners = {
  'long-html': async ({ text, targetLang, options }) =>
    translateLongTextStrategy(text, targetLang, options),
  enhanced: async ({ text, targetLang, options }) =>
    translateTextEnhancedStrategy(text, targetLang, options),
  default: async ({ text, targetLang, options }) =>
    translateTextWithFallbackOrchestrated(text, targetLang, options)
};

export async function runStrategy({ key, payload, logger, runners = defaultRunners }) {
  const runner = runners[key] || runners.default;
  if (!runner) throw new Error(`No runner for strategy ${key}`);

  if (key === 'long-html') {
    try {
      return await runner(payload);
    } catch (error) {
      logger?.warn?.('[TRANSLATION] 长文本HTML处理失败，降级到标准处理', {
        error: error.message,
        textLength: payload?.text?.length
      });
      return runners.default(payload);
    }
  }

  return runner(payload);
}
