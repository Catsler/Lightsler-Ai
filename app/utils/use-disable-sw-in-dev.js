import { useEffect } from "react";

export function useDisableSWInDev() {
  // 必须无条件调用 useEffect，遵守 React Hooks 规则
  // Hook 必须在所有条件判断之前调用，保持调用顺序一致
  useEffect(() => {
    // SSR 安全检查 - 移到 effect 内部
    if (typeof window === 'undefined') {
      return;
    }

    // 防御性检查：环境验证
    if (!("serviceWorker" in navigator) || !import.meta?.env?.DEV) {
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

