import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { resolveLocale } from "../i18n.server";
import polarisTranslationsEn from "@shopify/polaris/locales/en.json";
import polarisTranslationsZh from "@shopify/polaris/locales/zh-CN.json";
// Chat disabled by default to avoid blocking UI; re-enable by restoring ChatWidget usage and env flags.

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // 获取当前语言
  const locale = await resolveLocale(request);

  // 根据语言选择 Polaris 翻译
  const polarisTranslations = locale === 'zh-CN'
    ? polarisTranslationsZh
    : polarisTranslationsEn;

  // Chat is disabled by default to avoid third-party blocking issues.
  const chatConfig = { enabled: false };

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    polarisTranslations,
    locale,
    chatConfig
  };
};

export default function App() {
  const { apiKey, polarisTranslations, locale, chatConfig } = useLoaderData();
  const { t } = useTranslation();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey} i18n={polarisTranslations}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px" }}>
        <LanguageSwitcher />
      </div>
      <NavMenu>
        <Link to="/app" rel="home">
          {t('navigation.home')}
        </Link>
        <Link to="/app/billing">{t('navigation.billing')}</Link>
        <Link to="/app/language-domains">{t('navigation.languageDomains')}</Link>
        <Link to="/app/errors">{t('navigation.errors')}</Link>
      </NavMenu>
      {/* Chat disabled; re-enable by restoring ChatWidget and setting CHAT_ENABLED=true with CRISP_WEBSITE_ID */}
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
