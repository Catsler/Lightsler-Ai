import { createCookie } from "@remix-run/node";
import { I18N_CONFIG } from "./config/i18n.config";

export const localeCookie = createCookie(I18N_CONFIG.cookieName, {
  maxAge: I18N_CONFIG.cookieMaxAge,
  sameSite: "lax",
  path: "/",
});
