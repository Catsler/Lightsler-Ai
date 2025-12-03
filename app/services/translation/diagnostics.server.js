/**
 * Translation diagnostics service for API connectivity checks.
 */
import { logger } from '../../utils/logger.server.js';
import { config } from '../../utils/config.server.js';

/**
 * Quick API connectivity check (real call to chat/completions)
 *  - Uses minimal payload to reduce cost and避免误报
 *  - Distinguishes network/timeout vs 参数/鉴权/服务端错误
 * @returns {Promise<{success: boolean, endpoint: string, model: string, diagnostics: object, error?: string}>}
 */
export async function quickApiConnectivityCheck() {
  // 防止用户在 GPT_API_URL 已包含 /v1 时重复拼接
  const base = config.translation.apiUrl.replace(/\/+$/, '');
  const endpoint = base.endsWith('/v1')
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
  const model = config.translation.model || 'gpt-5-mini';
  const payload = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 16,
    temperature: 0
  };

  const timeoutMs = Math.min(config.translation.timeout ?? 30000, 15000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

  const diagnostics = {
    summary: null,
    endpoints: [],
    recommendations: []
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.translation.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const bodyText = await response.text();
    clearTimeout(timeout);

    diagnostics.endpoints.push({
      url: endpoint,
      status: response.status,
      ok: response.ok,
      summary: response.ok ? 'OK' : bodyText?.slice(0, 400)
    });

    if (response.ok) {
      diagnostics.summary = 'OK';
      return { success: true, endpoint, model, diagnostics };
    }

    // 4xx：可达但参数/鉴权/模型问题
    if (response.status >= 400 && response.status < 500) {
      diagnostics.summary = `请求被拒绝或参数错误 (HTTP ${response.status})`;
      diagnostics.recommendations = [
        '检查 GPT_API_KEY 是否正确且与域绑定',
        '检查模型名是否存在 (如 gpt-5-mini / 4o-mini)',
        '检查请求体 JSON 格式是否符合 chat/completions'
      ];
      return {
        success: false,
        endpoint,
        model,
        diagnostics,
        error: diagnostics.summary
      };
    }

    // 5xx：服务端错误
    diagnostics.summary = `服务端错误 (HTTP ${response.status})`;
    diagnostics.recommendations = ['稍后重试，如持续失败联系服务提供方'];
    return {
      success: false,
      endpoint,
      model,
      diagnostics,
      error: diagnostics.summary
    };
  } catch (error) {
    clearTimeout(timeout);
    diagnostics.summary = `网络/超时错误: ${error.message}`;
    diagnostics.recommendations = [
      '检查网络连通性或代理设置',
      '确认 GPT_API_URL 可访问，未被防火墙/证书拦截'
    ];

    return {
      success: false,
      endpoint,
      model,
      diagnostics,
      error: diagnostics.summary
    };
  }
}

/**
 * Run translation diagnostics.
 * @returns {Promise<{diagnostics: Array}>}
 */
export async function runTranslationDiagnostics() {
  const result = await quickApiConnectivityCheck();
  logger.info('[Diagnostics] Translation diagnostics executed', result);
  return { diagnostics: [result] };
}

export default {
  quickApiConnectivityCheck,
  runTranslationDiagnostics,
};
