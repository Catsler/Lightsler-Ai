import { json } from "@remix-run/node";
import { localeCookie } from "../cookies.server";
import { I18N_CONFIG } from "../config/i18n.config";

export const action = async ({ request }) => {
  const formData = await request.formData();
  const locale = formData.get("locale")?.toString?.();

  const safeLocale = I18N_CONFIG.supportedLanguages.includes(locale || "")
    ? locale
    : I18N_CONFIG.defaultLanguage;

  return json(
    { success: true, locale: safeLocale },
    {
      headers: {
        "Set-Cookie": await localeCookie.serialize(safeLocale),
      },
    }
  );
};
