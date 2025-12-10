import { config } from '../../utils/config.server.js';
import { logger } from '../../utils/logger.server.js';
import { quickApiConnectivityCheck } from './diagnostics.server.js';

const HEALTHY_CACHE_TTL = 5 * 60 * 1000; // 5分钟
const UNHEALTHY_CACHE_TTL = 30 * 1000;   // 30秒，确保异常场景快速复查

let configValidationCache = {
  result: null,
  timestamp: 0
};

export async function validateTranslationConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && configValidationCache.result) {
    const ttl = configValidationCache.result.valid ? HEALTHY_CACHE_TTL : UNHEALTHY_CACHE_TTL;
    const cacheAge = now - configValidationCache.timestamp;
    if (cacheAge < ttl) {
      logger.debug('📦 [validateTranslationConfig] 使用缓存结果', {
        cacheAge: `${Math.floor(cacheAge / 1000)}秒`,
        ttl: `${Math.floor(ttl / 1000)}秒`,
        valid: configValidationCache.result.valid,
        apiConnectable: configValidationCache.result.apiConnectable
      });
      return configValidationCache.result;
    }
  } else if (forceRefresh) {
    logger.info('🔄 [validateTranslationConfig] 强制刷新验证', { forceRefresh });
  } else {
    logger.debug('🆕 [validateTranslationConfig] 首次验证（无缓存）');
  }

  const result = {
    valid: false,
    apiKeyConfigured: false,
    apiConnectable: false,
    supportedLanguages: [],
    error: null,
    warnings: [],
    diagnostics: null
  };

  try {
    if (!config.translation.apiKey) {
      result.error = 'GPT_API_KEY未配置';
      result.warnings.push('翻译功能将无法使用，所有翻译请求将返回原文');
      configValidationCache.result = result;
      configValidationCache.timestamp = now;
      return result;
    }
    result.apiKeyConfigured = true;

    if (!config.translation.apiUrl) {
      result.error = 'GPT_API_URL未配置';
      configValidationCache.result = result;
      configValidationCache.timestamp = now;
      return result;
    }

    if (!configValidationCache.result || configValidationCache.result.apiConnectable === false) {
      logger.debug('正在测试翻译API连通性...');
    }
    
    const testResult = await testTranslationAPI();
    if (testResult.success) {
      result.apiConnectable = true;
      result.valid = true;
      result.supportedLanguages = [
        'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es'
      ];
      result.diagnostics = testResult.diagnostics ?? null;
      if (!configValidationCache.result || !configValidationCache.result.apiConnectable) {
        logger.debug('✅ 翻译API配置验证通过');
      }
    } else {
      result.error = testResult.error;
      result.warnings.push('API连接失败，翻译功能可能不稳定');
      result.diagnostics = testResult.diagnostics ?? null;
      if (!configValidationCache.result || configValidationCache.result.apiConnectable !== false) {
        logger.debug('❌ 翻译API连接失败:', testResult.error);
      }
    }

  } catch (error) {
    result.error = `配置验证失败: ${error.message}`;
    logger.error('翻译配置验证错误:', error);
  }

  configValidationCache.result = result;
  configValidationCache.timestamp = now;

  return result;
}

export async function testTranslationAPI() {
  logger.info('🧪 [testTranslationAPI] 触发翻译服务连通性诊断', {
    apiUrl: config.translation.apiUrl,
    model: config.translation.model,
    timeout: config.translation.timeout ?? 30000,
    apiKeyConfigured: !!config.translation.apiKey
  });

  const result = await quickApiConnectivityCheck();

  if (result.success) {
    logger.info('✅ [testTranslationAPI] 翻译服务可用', {
      endpoint: result.endpoint,
      model: result.model
    });
    return {
      success: true,
      model: result.model,
      endpoint: result.endpoint,
      diagnostics: result.diagnostics
    };
  }

  const diagnostics = result.diagnostics;
  const primaryEndpoint = diagnostics?.endpoints?.[0];

  logger.error('❌ [testTranslationAPI] 连通性诊断失败', {
    summary: diagnostics?.summary,
    primaryStatus: primaryEndpoint?.status,
    primarySummary: primaryEndpoint?.summary,
    recommendations: diagnostics?.recommendations
  });

  return {
    success: false,
    error: result.error || diagnostics?.summary || '翻译服务诊断失败',
    diagnostics
  };
}

export async function getTranslationServiceStatus(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const configCheck = await validateTranslationConfig(forceRefresh);
  
  return {
    status: configCheck.valid ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    config: {
      apiKeyConfigured: configCheck.apiKeyConfigured,
      apiUrl: config.translation.apiUrl,
      model: config.translation.model,
      timeout: config.translation.timeout,
      maxRetries: config.translation.maxRetries,
      maxRequestsPerMinute: config.translation.maxRequestsPerMinute,
      minRequestIntervalMs: config.translation.minRequestIntervalMs
    },
    connectivity: {
      reachable: configCheck.apiConnectable,
      lastChecked: new Date().toISOString()
    },
    supportedLanguages: configCheck.supportedLanguages,
    errors: configCheck.error ? [configCheck.error] : [],
    warnings: configCheck.warnings,
    diagnostics: configCheck.diagnostics
  };
}
