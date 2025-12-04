import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { getEnvWithDevOverride } from "../utils/env.server.js";

export const loader = async () => {
  const supportEmail = getEnvWithDevOverride("SUPPORT_EMAIL", "lampesmercy@gmail.com");
  const crispWebsiteId = getEnvWithDevOverride("CRISP_WEBSITE_ID", "");
  const chatEnabled = getEnvWithDevOverride("CHAT_ENABLED", "false") === "true";

  return json({
    supportEmail,
    crispWebsiteId,
    chatEnabled: chatEnabled && crispWebsiteId
  });
};

export default function SupportPage() {
  const { supportEmail, crispWebsiteId, chatEnabled } = useLoaderData();
  const { t } = useTranslation("support");

  // Load Crisp Chat widget if enabled
  useEffect(() => {
    if (chatEnabled && crispWebsiteId && typeof window !== 'undefined') {
      window.$crisp = [];
      window.CRISP_WEBSITE_ID = crispWebsiteId;

      const script = document.createElement("script");
      script.src = "https://client.crisp.chat/l.js";
      script.async = true;
      document.getElementsByTagName("head")[0].appendChild(script);

      return () => {
        // Cleanup Crisp on unmount
        if (window.$crisp) {
          window.$crisp.push(["do", "chat:hide"]);
        }
      };
    }
  }, [chatEnabled, crispWebsiteId]);

  const renderFAQ = (items) =>
    Array.isArray(items)
      ? items.map((item, idx) => (
          <div key={idx} style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "0 0 8px 0", fontWeight: 600 }}>{item.question}</h4>
            <p style={{ margin: 0, color: "#616161" }}>{item.answer}</p>
          </div>
        ))
      : null;

  const renderSteps = (steps) =>
    Array.isArray(steps)
      ? steps.map((step, idx) => <li key={idx}>{step}</li>)
      : null;

  const renderResources = (items) =>
    Array.isArray(items)
      ? items.map((item, idx) => (
          <li key={idx}>
            <Link to={item.url} style={{ textDecoration: "underline", color: "#2563eb" }}>
              {item.label}
            </Link> - {item.description}
          </li>
        ))
      : null;

  const renderTroubleshooting = (items) =>
    Array.isArray(items)
      ? items.map((item, idx) => (
          <div key={idx} style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#d97706" }}>
              ⚠️ {item.issue}
            </h4>
            <p style={{ margin: 0, color: "#616161" }}>
              <strong>Solution:</strong> {item.solution}
            </p>
          </div>
        ))
      : null;

  return (
    <main style={{ maxWidth: "880px", margin: "0 auto", padding: "32px 24px", lineHeight: 1.6 }}>
      <header style={{ marginBottom: "32px", textAlign: "center" }}>
        <h1 style={{ margin: 0 }}>{t('support:page.title')}</h1>
        <p style={{ margin: "8px 0", color: "#616161" }}>{t('support:page.subtitle')}</p>
      </header>

      {/* Live Chat Support */}
      {chatEnabled && (
        <section style={{
          marginBottom: "32px",
          padding: "24px",
          backgroundColor: "#f0fdf4",
          borderRadius: "8px",
          border: "1px solid #86efac"
        }}>
          <h2 style={{ marginTop: 0 }}>{t('support:chat.title')}</h2>
          <p>{t('support:chat.description')}</p>
          <p style={{ fontSize: "14px", color: "#616161", fontStyle: "italic" }}>
            {t('support:chat.availability')}
          </p>
          <p style={{ fontSize: "14px", color: "#616161" }}>
            {t('support:chat.notice')}
          </p>
        </section>
      )}

      {/* Email Support */}
      <section style={{
        marginBottom: "32px",
        padding: "24px",
        backgroundColor: "#eff6ff",
        borderRadius: "8px",
        border: "1px solid #93c5fd"
      }}>
        <h2 style={{ marginTop: 0 }}>{t('support:email.title')}</h2>
        <p>{t('support:email.description')}</p>
        <p>
          <strong>{t('support:email.address')}</strong>{" "}
          <a
            href={`mailto:${supportEmail}`}
            style={{ textDecoration: "underline", color: "#2563eb" }}
          >
            {t('support:email.emailLink', { supportEmail })}
          </a>
        </p>
      </section>

      {/* Quick Start Guide */}
      <section style={{ marginBottom: "32px" }}>
        <h2>{t('support:quickStart.title')}</h2>
        <p>{t('support:quickStart.description')}</p>
        <ol style={{ paddingLeft: "20px" }}>
          {renderSteps(t('support:quickStart.steps', { returnObjects: true }))}
        </ol>
      </section>

      {/* FAQ */}
      <section style={{ marginBottom: "32px" }}>
        <h2>{t('support:faq.title')}</h2>
        {renderFAQ(t('support:faq.items', { returnObjects: true }))}
      </section>

      {/* Common Issues */}
      <section style={{ marginBottom: "32px" }}>
        <h2>{t('support:troubleshooting.title')}</h2>
        {renderTroubleshooting(t('support:troubleshooting.items', { returnObjects: true }))}
      </section>

      {/* Resources */}
      <section style={{ marginBottom: "32px" }}>
        <h2>{t('support:resources.title')}</h2>
        <ul>
          {renderResources(t('support:resources.items', { returnObjects: true }))}
        </ul>
      </section>

      {/* Feedback */}
      <section style={{
        marginBottom: "32px",
        padding: "24px",
        backgroundColor: "#fef3c7",
        borderRadius: "8px",
        border: "1px solid #fcd34d"
      }}>
        <h2 style={{ marginTop: 0 }}>{t('support:feedback.title')}</h2>
        <p>{t('support:feedback.description')}</p>
      </section>

      <footer style={{ textAlign: "center", fontSize: "14px", color: "#616161", marginTop: "48px" }}>
        <p>
          <Link to="/" style={{ textDecoration: "underline", color: "#2563eb" }}>
            ← Back to Dashboard
          </Link>
        </p>
      </footer>
    </main>
  );
}
