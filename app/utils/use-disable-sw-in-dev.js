import { useEffect } from "react";

export function useDisableSWInDev() {
  useEffect(() => {
    // 仅在浏览器且存在 SW API 时尝试
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 仅在开发环境下执行（Remix Vite: import.meta.env.DEV）
    try {
      if (import.meta?.env?.DEV) {
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
      }
    } catch {}
  }, []);
}

