let teardownScheduled = false;

export function disableServiceWorkerInDev() {
  if (teardownScheduled) {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  if (!('serviceWorker' in navigator) || !import.meta?.env?.DEV) {
    return;
  }

  teardownScheduled = true;

  const schedule = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (cb) => Promise.resolve().then(cb);

  schedule(async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        try {
          await r.unregister();
        } catch {}
      }
    } catch {}

    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          try {
            await caches.delete(k);
          } catch {}
        }
      }
    } catch {}

    try {
      console.log('[dev] ServiceWorker disabled and caches cleared');
    } catch {}
  });
}

export function useDisableSWInDev() {
  disableServiceWorkerInDev();
}
