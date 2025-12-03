export const I18N_CONFIG = {
  cookieName: "lng",
  cookieMaxAge: 365 * 24 * 60 * 60, // 1 year seconds
  defaultLanguage: "en",
  supportedLanguages: ["en", "zh-CN"],
  fallbackLanguage: "en",
  defaultNamespace: "common",
  fallbackNamespace: "common",
} as const;
