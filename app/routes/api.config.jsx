import { authenticate } from "../shopify.server.js";
import { getConfigInfo } from "../utils/config.server.js";
import { successResponse, withErrorHandling } from "../utils/api-response.server.js";

/**
 * 配置信息API
 */
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { session } = await authenticate.admin(request);
    
    const configInfo = getConfigInfo();
    
    // 添加一些运行时信息
    const runtimeInfo = {
      version: "1.0.0",
      buildTime: new Date().toISOString(),
      shop: session.shop,
    };
    
    return successResponse({
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
    }, "配置信息获取成功");
    
  }, "获取配置", request.headers.get("shopify-shop-domain") || "");
};