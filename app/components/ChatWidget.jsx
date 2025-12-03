import { useEffect, useState } from 'react';
import { Icon } from '@shopify/polaris';
import { ChatIcon } from '@shopify/polaris-icons';
import { useTranslation } from 'react-i18next';

/**
 * Generic Crisp chat loader for embedded app pages.
 * - Lazy loads script once per session
 * - Sets user identity (with optional token for verification)
 * - Sets session language for localized greetings
 * - Renders a custom floating launcher button
 */
export function ChatWidget({ enabled, websiteId, user, locale }) {
  const [loaded, setLoaded] = useState(false);
  const { t } = useTranslation();
  const sessionLanguage = (locale || 'en').toLowerCase();

  // Hide default Crisp launcher nodes (non-aggressive)
  useEffect(() => {
    if (!enabled) return undefined;

    const hideDefault = () => {
      const selectors = [
        '.crisp-client [data-id="chat-closed"]',
        '.crisp-client [data-chat-status]',
        '.crisp-client .cc-kv',
        '.crisp-client .cc-sh-badge',
        '.crisp-client .cc-no-badge',
        '.crisp-client .cc-1xry'
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
        });
      });
    };

    hideDefault();
    // Observe only crisp client subtree
    const observer = new MutationObserver((mutations) => {
      let shouldHide = false;
      for (const m of mutations) {
        if (m.target && m.target.closest && m.target.closest('.crisp-client')) {
          shouldHide = true;
          break;
        }
      }
      if (shouldHide) {
        setTimeout(hideDefault, 50);
      }
    });

    // Wait for crisp client to appear, then observe
    const interval = setInterval(() => {
      const client = document.querySelector('.crisp-client');
      if (client) {
        clearInterval(interval);
        observer.observe(client, { childList: true, subtree: true });
      }
    }, 100);

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [enabled]);

  // Load Crisp script once
  useEffect(() => {
    if (!enabled || !websiteId || typeof window === 'undefined') return;
    if (window.$crisp) return;

    // Clean any stale crisp script
    document
      .querySelectorAll('script[src*="crisp.chat"]')
      .forEach((s) => s.remove());

    window.$crisp = [];
    window.CRISP_WEBSITE_ID = websiteId;

    // Hide default launcher to use our custom one
    window.$crisp.push(['safe', true]);
    window.$crisp.push(["do", "chat:hide"]);
    window.$crisp.push(["on", "chat:closed", () => {
      window.$crisp.push(["do", "chat:hide"]);
    }]);
    window.$crisp.push(["on", "chat:opened", () => {
      // When opened, we might want to ensure it's visible? 
      // Crisp usually handles its own window visibility.
    }]);

    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      setTimeout(() => {
        if (window.$crisp && typeof window.$crisp.push === 'function') {
          try {
            window.$crisp.push(['do', 'chat:hide']);
            setLoaded(true);
            console.info('[ChatWidget] SDK initialized');
          } catch (error) {
            console.error('[ChatWidget] SDK not usable:', error);
            setLoaded(false);
          }
        } else {
          console.error('[ChatWidget] $crisp missing after load');
          setLoaded(false);
        }
      }, 100);
    };
    s.onerror = () => setLoaded(false);
    document.head.appendChild(s);
  }, [enabled, websiteId]);

  // Apply session settings when loaded / deps change
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.$crisp) return;

    // Set locale for chat UI/greetings
    if (sessionLanguage) {
      window.$crisp.push(['set', 'session:language', sessionLanguage]);
    }

    // Identify user (shop-level) with optional verification token
    if (user?.id) {
      const email = user.email || `${user.id}@example.com`;
      window.$crisp.push(['set', 'user:email', email]);
      window.$crisp.push(['set', 'user:nickname', user.nickname || user.id]);
      if (user.phone) {
        window.$crisp.push(['set', 'user:phone', user.phone]);
      }
    }

    if (user?.token) {
      window.$crisp.push(['set', 'user:verification', user.token]);
    }

    if (user?.segments?.length) {
      window.$crisp.push(['set', 'session:segments', user.segments]);
    }
  }, [enabled, sessionLanguage, user, loaded]);

  if (!enabled || !websiteId) return null;

  const launcherStyle = {
    position: 'fixed',
    right: '20px',
    bottom: '100px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    border: 'none',
    borderRadius: '24px',
    background: '#111827',
    color: '#fff',
    boxShadow: '0 10px 30px rgba(0,0,0,0.16)',
    cursor: 'pointer',
    zIndex: 10000,
    transition: 'transform 120ms ease, box-shadow 120ms ease, background 120ms ease'
  };

  // Show loading state while SDK initializes
  if (!loaded) {
    return (
      <div
        className="chat-widget-launcher"
        style={{ ...launcherStyle, opacity: 0.6, cursor: 'wait' }}
        aria-busy="true"
        aria-label={t('support.chatLoading', { defaultValue: 'Loading chat...' })}
      >
        <div className="chat-widget-icon">
          <Icon source={ChatIcon} tone="base" />
        </div>
        <span className="chat-widget-label">
          {t('support.chatLoading', { defaultValue: 'Loading...' })}
        </span>
      </div>
    );
  }

  return (
    <div
      className="chat-widget-launcher"
      style={launcherStyle}
      onClick={() => {
        if (!window.$crisp) {
          console.warn('[ChatWidget] Crisp SDK not loaded');
          return;
        }
        try {
          window.$crisp.push(['do', 'chat:show']);
          window.$crisp.push(['do', 'chat:open']);
        } catch (error) {
          console.error('[ChatWidget] Failed to open chat:', error);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t('support.chat', { defaultValue: 'Chat' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (!window.$crisp) {
            console.warn('[ChatWidget] Crisp SDK not loaded');
            return;
          }
          try {
            window.$crisp.push(['do', 'chat:show']);
            window.$crisp.push(['do', 'chat:open']);
          } catch (error) {
            console.error('[ChatWidget] Failed to open chat:', error);
          }
        }
      }}
    >
      <div className="chat-widget-icon">
        <Icon source={ChatIcon} tone="base" />
      </div>
      <span className="chat-widget-label">
        {t('support.chat', { defaultValue: 'Chat' })}
      </span>
    </div>
  );
}
