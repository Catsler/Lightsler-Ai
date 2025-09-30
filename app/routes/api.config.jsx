import { getConfigInfo } from "../utils/config.server.js";
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 配置信息API处理函数
 */
async function handleGetConfig({ session }) {
  const configInfo = getConfigInfo();

  // 添加一些运行时信息
  const runtimeInfo = {
    version: "1.0.0",
    buildTime: new Date().toISOString(),
    shop: session.shop,
  };

  return {
    config: configInfo,
    runtime: runtimeInfo,
    supportedLanguages: [
      { code: 'zh-CN', name: '简体中文' },
      { code: 'zh-TW', name: '繁体中文' },
      { code: 'en', name: 'English' },
      { code: 'ja', name: '日本語' },
      { code: 'ko', name: '한국어' },
      { code: 'fr', name: 'Français' },
      { code: 'de', name: 'Deutsch' },
      { code: 'es', name: 'Español' },
      { code: 'it', name: 'Italiano' },
      { code: 'pt', name: 'Português' },
      { code: 'ru', name: 'Русский' },
      { code: 'ar', name: 'العربية' },
    ]
  };
}

export const loader = createApiRoute(handleGetConfig, {
  requireAuth: true,
  operationName: '获取配置'
});