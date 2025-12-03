import { RemixBrowser } from "@remix-run/react";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { initI18n } from "./i18n.shared";

function getInitialLocale() {
  const langAttr = document.documentElement.lang;
  if (langAttr) return langAttr;
  return "en";
}

async function hydrate() {
  const initialLocale = getInitialLocale();
  try {
    await initI18n(initialLocale);
  } catch (e) {
    console.warn('[i18n] client init failed', e?.message || e);
  }

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <RemixBrowser />
      </StrictMode>
    );
  });
}

hydrate();
