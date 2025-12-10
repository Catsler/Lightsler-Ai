import { recordTranslationCall } from './metrics.server.js';

/**
 * 执行翻译请求并记录调用指标。
 * @param {Object} params
 * @param {Object} params.client - Translation API client，需暴露 execute({ text, targetLang, systemPrompt, context, strategy, fallbacks })
 * @param {string} params.text
 * @param {string} params.targetLang
 * @param {string} params.systemPrompt
 * @param {string} params.strategy
 * @param {Object} [params.context]
 * @param {Array} [params.fallbacks]
 * @returns {Promise<Object>} 执行结果（success/text/meta/...）
 */
export async function executeTranslationRequest({
  client,
  text,
  targetLang,
  systemPrompt,
  strategy,
  context = {},
  fallbacks = []
}) {
  const response = await client.execute({
    text,
    targetLang,
    systemPrompt,
    context,
    strategy,
    fallbacks
  });

  recordTranslationCall({
    success: response.success,
    strategy: response.meta?.strategy ?? strategy,
    targetLang,
    duration: response.meta?.duration ?? 0,
    cached: response.meta?.cached ?? false,
    retries: response.meta?.retries ?? 0
  });

  return response;
}
