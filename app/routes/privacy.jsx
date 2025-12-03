import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { getEnvWithDevOverride } from "../utils/env.server.js";

const EFFECTIVE_DATE = "2024-12-01";

export const loader = async () => {
  const supportEmail = getEnvWithDevOverride("SUPPORT_EMAIL", "lampesmercy@gmail.com");
  const gptApiUrl = getEnvWithDevOverride("GPT_API_URL", "https://us.vveai.com/");
  const repoUrl = getEnvWithDevOverride("REPO_URL", "");
  let gptApiHost = gptApiUrl;
  try {
    gptApiHost = new URL(gptApiUrl).hostname;
  } catch (_) {
    // keep raw string
  }

  return json({ supportEmail, gptApiHost, repoUrl, effectiveDate: EFFECTIVE_DATE });
};

export default function PrivacyPage() {
  const { supportEmail, gptApiHost, repoUrl, effectiveDate } = useLoaderData();
  const { t } = useTranslation("privacy");

  const renderList = (items) =>
    Array.isArray(items)
      ? items.map((item, idx) => <li key={idx}>{item}</li>)
      : null;

  return (
    <main style={{ maxWidth: "880px", margin: "0 auto", padding: "32px 24px", lineHeight: 1.6 }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0 }}>{t('privacy:page.title')}</h1>
        <p style={{ margin: "4px 0" }}>{t('privacy:effectiveDate', { date: effectiveDate })}</p>
        <p style={{ margin: "4px 0", color: "#616161" }}>{t('privacy:page.status')}</p>
      </header>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:intro.title')}</h2>
        <p>{t('privacy:intro.content')}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:collection.title')}</h2>
        <h3>{t('privacy:collection.types.title')}</h3>
        <ul>{renderList(t('privacy:collection.types.items', { returnObjects: true }))}</ul>

        <h3>{t('privacy:collection.method.title')}</h3>
        <ul>{renderList(t('privacy:collection.method.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:usage.title')}</h2>
        <ul>{renderList(t('privacy:usage.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:sharing.title')}</h2>
        <p>{t('privacy:sharing.content')}</p>
        <ul>{renderList(t('privacy:sharing.scenarios', { returnObjects: true, gptApiHost }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:thirdPartyServices.title')}</h2>
        <ul>{renderList(t('privacy:thirdPartyServices.items', { returnObjects: true, gptApiHost }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:security.title')}</h2>
        <ul>{renderList(t('privacy:security.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:retention.title')}</h2>
        <p>{t('privacy:retention.content')}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:rights.title')}</h2>
        <ul>{renderList(t('privacy:rights.items', { returnObjects: true }))}</ul>
        <p>{t('privacy:rights.exercise', { supportEmail })}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:children.title')}</h2>
        <p>{t('privacy:children.content')}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:changes.title')}</h2>
        <p>{t('privacy:changes.content')}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('privacy:contact.title')}</h2>
        <p>{t('privacy:contact.content')}</p>
        <p>
          <a href={`mailto:${supportEmail}`}>
            {t('privacy:contact.email', { supportEmail })}
          </a>
        </p>
      </section>

      <footer style={{ fontSize: "14px", color: "#616161" }}>
        <p>{t('privacy:disclaimer')}</p>
        <p>{t('privacy:effectiveDate', { date: effectiveDate })}</p>
        {repoUrl ? (
          <p>
            <a
              href={`${repoUrl}/commits/main/app/routes/privacy.jsx`}
              target="_blank"
              rel="noreferrer"
            >
              Commit history
            </a>
          </p>
        ) : null}
      </footer>
    </main>
  );
}
