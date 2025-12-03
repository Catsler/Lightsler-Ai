import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json" assert { type: "json" };
import zhCommon from "./locales/zh-CN/common.json" assert { type: "json" };
import enBilling from "./locales/en/billing.json" assert { type: "json" };
import zhBilling from "./locales/zh-CN/billing.json" assert { type: "json" };
import enErrorsPage from "./locales/en/errorsPage.json" assert { type: "json" };
import zhErrorsPage from "./locales/zh-CN/errorsPage.json" assert { type: "json" };
import enLanguages from "./locales/en/languages.json" assert { type: "json" };
import zhLanguages from "./locales/zh-CN/languages.json" assert { type: "json" };
import enMonitoring from "./locales/en/monitoring.json" assert { type: "json" };
import zhMonitoring from "./locales/zh-CN/monitoring.json" assert { type: "json" };
import enHome from "./locales/en/home.json" assert { type: "json" };
import zhHome from "./locales/zh-CN/home.json" assert { type: "json" };
import enPrivacy from "./locales/en/privacy.json" assert { type: "json" };
import zhPrivacy from "./locales/zh-CN/privacy.json" assert { type: "json" };

let initializing: Promise<typeof i18next> | null = null;

export async function initI18n(locale: string = "en") {
  if (i18next.isInitialized) {
    if (i18next.language !== locale) {
      await i18next.changeLanguage(locale);
    }
    return i18next;
  }

  if (initializing) return initializing;

  initializing = i18next
    .use(initReactI18next)
    .init({
  resources: {
    en: { common: enCommon, home: enHome, billing: enBilling, errorsPage: enErrorsPage, languages: enLanguages, monitoring: enMonitoring, privacy: enPrivacy },
    "zh-CN": { common: zhCommon, home: zhHome, billing: zhBilling, errorsPage: zhErrorsPage, languages: zhLanguages, monitoring: zhMonitoring, privacy: zhPrivacy },
  },
      lng: locale,
      fallbackLng: "en",
      supportedLngs: ["en", "zh-CN"],
      defaultNS: "common",
      fallbackNS: "common",
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    .then(() => i18next)
    .finally(() => {
      initializing = null;
    });

  return initializing;
}
