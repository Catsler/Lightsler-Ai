import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { localeCookie } from "./cookies.server";
import { i18nServer, resolveLocale } from "./i18n.server";
import { initI18n } from "./i18n.shared";
import { BillingScheduler } from "./services/billing-scheduler.server.js";
import { captureError } from "./utils/error-handler.server.js";
import { ErrorRecoveryManager, RECOVERY_STRATEGIES } from "./services/error-recovery.server.js";
import { metricsPersistence } from "./services/metrics-persistence.server.js";

// 初始化配置
import { initializeConfig } from "./utils/config.server.js";

// 应用启动时初始化配置
try {
  initializeConfig();
} catch (error) {
  console.warn('配置初始化警告:', error.message);
}

// 仅在服务器环境初始化错误恢复管理器
if (typeof window === 'undefined') {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const recoveryEnabled = process.env.ERROR_RECOVERY_ENABLED === 'true';
  const shouldStartRecovery = recoveryEnabled && !isTestEnv;
  const billingSchedulerEnabled = process.env.BILLING_SCHEDULER_ENABLED !== 'false';

  if (shouldStartRecovery && !global.__recoveryManager) {
    const recoveryManager = new ErrorRecoveryManager({
      strategies: [
        RECOVERY_STRATEGIES.EXPONENTIAL_BACKOFF,
        RECOVERY_STRATEGIES.FALLBACK
      ],
      checkInterval: 60000,
      enabled: true
    });

    if (recoveryManager.validateConfig()) {
      recoveryManager.start();
      global.__recoveryManager = recoveryManager;
      console.info('[Recovery] ErrorRecoveryManager started with minimal strategies');
    } else {
      console.warn('[Recovery] Configuration invalid, automatic recovery not started');
    }
  }

  const metricsEnabled = process.env.METRICS_PERSISTENCE_ENABLED === 'true';
  if (metricsEnabled && !isTestEnv && !global.__metricsPersistence) {
    metricsPersistence.start()
      .then((started) => {
        if (started) {
          global.__metricsPersistence = metricsPersistence;
          console.info('[Metrics] MetricsPersistence service started');
        }
      })
      .catch((error) => {
        console.error('[Metrics] Failed to start MetricsPersistence', error);
      });
  }

  if (billingSchedulerEnabled && !isTestEnv && !global.__billingScheduler) {
    const scheduler = new BillingScheduler({
      intervalMs: 5 * 60 * 1000,
      enabled: true,
    });

    scheduler.start()
      .then((started) => {
        if (started) {
          global.__billingScheduler = scheduler;
          console.info('[BillingScheduler] Service started');
        }
      })
      .catch((error) => {
        console.error('[BillingScheduler] Failed to start', error);
      });
  }
}

// 全局未捕获异常与未处理拒绝的错误收集（仅注册一次）
let __GLOBAL_ERROR_HOOKS_REGISTERED__ = global.__GLOBAL_ERROR_HOOKS_REGISTERED__ || false;
if (!__GLOBAL_ERROR_HOOKS_REGISTERED__) {
  const shutdownSignals = ['SIGINT', 'SIGTERM'];
  const shutdownHandler = async () => {
    try {
      await metricsPersistence.stop();
    } catch {}
  };

  shutdownSignals.forEach((signal) => {
    process.once(signal, () => {
      shutdownHandler().finally(() => process.exit(0));
    });
  });

  process.on('unhandledRejection', (reason) => {
    try {
      captureError(reason instanceof Error ? reason : new Error(String(reason)), {
        operation: 'unhandledRejection',
      });
    } catch {}
  });
  process.on('uncaughtException', (error) => {
    try {
      captureError(error, { operation: 'uncaughtException' });
    } catch {}
  });
  global.__GLOBAL_ERROR_HOOKS_REGISTERED__ = true;
}

export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext,
) {
  // preload locale for SSR (best-effort; do not block on errors)
  try {
    const locale = await resolveLocale(request);
    await Promise.all([initI18n(locale), i18nServer.getLocale(request)]);
    responseHeaders.append("Set-Cookie", await localeCookie.serialize(locale));
  } catch (e) {
    console.warn('[i18n] preload locale failed', e?.message || e);
  }

  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
