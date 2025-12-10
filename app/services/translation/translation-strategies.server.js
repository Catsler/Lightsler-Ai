export function selectTranslationStrategy({ text, targetLang, options = {} }) {
  const normalized = typeof text === 'string' ? text : '';
  if (normalized && normalized.length > 1500 && options?.isHtml !== false) {
    return { key: 'long-html', reason: 'html_long_text' };
  }
  if (options?.strategy) {
    return { key: options.strategy, reason: 'forced' };
  }
  return { key: 'default', reason: 'default' };
}

export async function runTranslationStrategy(strategyKey, payload, runners) {
  const runner = runners?.[strategyKey] || runners?.default;

  if (!runner) {
    throw new Error(`No translation strategy available for key: ${strategyKey}`);
  }

  // 长文本策略失败时回退到默认策略（保持原有行为）
  if (strategyKey === 'long-html') {
    try {
      return await runner(payload);
    } catch (error) {
      payload?.logger?.warn?.('[TRANSLATION] 长文本HTML处理失败，降级到标准处理', {
        error: error.message,
        textLength: payload?.text?.length
      });
      return runners.default(payload);
    }
  }

  return runner(payload);
}
