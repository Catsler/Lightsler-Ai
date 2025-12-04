import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { getEnvWithDevOverride } from "../utils/env.server.js";

const EFFECTIVE_DATE = "2024-12-01";

export const loader = async () => {
  const supportEmail = getEnvWithDevOverride("SUPPORT_EMAIL", "lampesmercy@gmail.com");
  const repoUrl = getEnvWithDevOverride("REPO_URL", "");

  return json({ supportEmail, repoUrl, effectiveDate: EFFECTIVE_DATE });
};

export default function TermsPage() {
  const { supportEmail, repoUrl, effectiveDate } = useLoaderData();
  const { t } = useTranslation("terms");

  const renderList = (items) =>
    Array.isArray(items)
      ? items.map((item, idx) => <li key={idx}>{item}</li>)
      : null;

  return (
    <main style={{ maxWidth: "880px", margin: "0 auto", padding: "32px 24px", lineHeight: 1.6 }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0 }}>{t('terms:page.title')}</h1>
        <p style={{ margin: "4px 0" }}>{t('terms:effectiveDate', { date: effectiveDate })}</p>
        <p style={{ margin: "4px 0", color: "#616161" }}>{t('terms:page.status')}</p>
      </header>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:intro.title')}</h2>
        <p>{t('terms:intro.content')}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:acceptance.title')}</h2>
        <p>{t('terms:acceptance.content')}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:account.title')}</h2>
        <ul>{renderList(t('terms:account.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:service.title')}</h2>
        <p>{t('terms:service.content')}</p>
        <ul>{renderList(t('terms:service.features', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:billing.title')}</h2>
        <ul>{renderList(t('terms:billing.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:data.title')}</h2>
        <ul>{renderList(t('terms:data.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:intellectual.title')}</h2>
        <ul>{renderList(t('terms:intellectual.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:limitations.title')}</h2>
        <ul>{renderList(t('terms:limitations.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:termination.title')}</h2>
        <ul>{renderList(t('terms:termination.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:modifications.title')}</h2>
        <p>{t('terms:modifications.content')}</p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:governing.title')}</h2>
        <ul>{renderList(t('terms:governing.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:miscellaneous.title')}</h2>
        <ul>{renderList(t('terms:miscellaneous.items', { returnObjects: true }))}</ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>{t('terms:contact.title')}</h2>
        <p>{t('terms:contact.content')}</p>
        <p>
          <a href={`mailto:${supportEmail}`}>
            {t('terms:contact.email', { supportEmail })}
          </a>
        </p>
      </section>

      <footer style={{ fontSize: "14px", color: "#616161" }}>
        <p>{t('terms:disclaimer')}</p>
        <p>{t('terms:effectiveDate', { date: effectiveDate })}</p>
        {repoUrl ? (
          <p>
            <a
              href={`${repoUrl}/commits/main/app/routes/terms.jsx`}
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
