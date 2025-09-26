import React from "react";

export function useDisableSWInDev() {
  const useEffect = React && typeof React.useEffect === 'function' ? React.useEffect : null;

  if (!useEffect || typeof window === 'undefined') {
    return;
  }

  useEffect(() => {
    // 防御性检查：SSR 安全 + 环境验证
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !import.meta?.env?.DEV) {
      return;
    }

    // 仅在开发环境下执行清理逻辑
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          try {
            await r.unregister();
          } catch {}
        }
      } catch {}

      try {
        const keys = await caches.keys();
        for (const k of keys) {
          try {
            await caches.delete(k);
          } catch {}
        }
      } catch {}

      // 提示：仅开发环境输出
      try {
        console.log("[dev] ServiceWorker disabled and caches cleared");
      } catch {}
    })();
  }, []);
}

