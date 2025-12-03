import i18next from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import { I18N_CONFIG } from "./config/i18n.config";

export async function initI18nClient(initialLocale: string, initialNamespaces: string[]) {
  if (i18next.isInitialized) {
    await i18next.changeLanguage(initialLocale);
    return i18next;
  }

  await i18next
    .use(initReactI18next)
    .use(
      resourcesToBackend((lng: string, ns: string) =>
        import(`./locales/${lng}/${ns}.json`).then((m) => m.default)
      )
    )
    .init({
      lng: initialLocale,
      fallbackLng: I18N_CONFIG.fallbackLanguage,
      supportedLngs: I18N_CONFIG.supportedLanguages,
      ns: initialNamespaces,
      defaultNS: I18N_CONFIG.defaultNamespace,
      fallbackNS: I18N_CONFIG.fallbackNamespace,
      interpolation: { escapeValue: false },
      react: {
        useSuspense: false,
      },
    });

  return i18next;
}
