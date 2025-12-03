import { RemixI18Next } from "remix-i18next/server";
import i18next from "i18next";
import Backend from "i18next-fs-backend";
import { resolve } from "node:path";
import { I18N_CONFIG } from "./config/i18n.config";
import { localeCookie } from "./cookies.server";

const localesDir = resolve("./app/locales");

const LOCALE_NORMALIZE_MAP: Record<string, string> = {
  "zh": "zh-CN",
  "zh-cn": "zh-CN",
  "zh_cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh_hans": "zh-CN",
  "zh-Hans": "zh-CN",
};

const normalizeLocale = (locale?: string | null) => {
  if (!locale) return locale;
  const lower = locale.toLowerCase();
  return LOCALE_NORMALIZE_MAP[lower] || locale;
};

export const i18nServer = new RemixI18Next({
  detection: {
    supportedLanguages: I18N_CONFIG.supportedLanguages,
    fallbackLanguage: I18N_CONFIG.defaultLanguage,
  },
  i18next,
  backend: Backend,
  backendOptions: {
    loadPath: `${localesDir}/{{lng}}/{{ns}}.json`,
  },
  fallbackLng: I18N_CONFIG.fallbackLanguage,
  supportedLanguages: I18N_CONFIG.supportedLanguages,
  defaultNS: I18N_CONFIG.defaultNamespace,
  fallbackNS: I18N_CONFIG.fallbackNamespace,
});

export async function resolveLocale(request: Request) {
  const url = new URL(request.url);

  // 1. 优先使用 Shopify 传递的 locale 参数（管理员语言）
  const shopifyLocale = normalizeLocale(url.searchParams.get("locale"));
  if (shopifyLocale && I18N_CONFIG.supportedLanguages.includes(shopifyLocale)) {
    return shopifyLocale;
  }

  // 2. 其次使用 lng 参数（用户手动切换）
  const urlLng = normalizeLocale(url.searchParams.get("lng"));
  if (urlLng && I18N_CONFIG.supportedLanguages.includes(urlLng)) {
    return urlLng;
  }

  // 3. 然后使用 Cookie（持久化的用户偏好）
  const cookieHeader = request.headers.get("Cookie");
  const cookieLng = normalizeLocale(await localeCookie.parse(cookieHeader));
  if (cookieLng && I18N_CONFIG.supportedLanguages.includes(cookieLng)) {
    return cookieLng;
  }

  // 4. 最后使用默认语言
  return I18N_CONFIG.defaultLanguage;
}
