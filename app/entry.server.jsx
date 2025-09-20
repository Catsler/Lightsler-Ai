import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { captureError } from "./utils/error-handler.server.js";

// 初始化配置
import { initializeConfig } from "./utils/config.server.js";

// 应用启动时初始化配置
try {
  initializeConfig();
} catch (error) {
  console.warn('配置初始化警告:', error.message);
}

// 全局未捕获异常与未处理拒绝的错误收集（仅注册一次）
let __GLOBAL_ERROR_HOOKS_REGISTERED__ = global.__GLOBAL_ERROR_HOOKS_REGISTERED__ || false;
if (!__GLOBAL_ERROR_HOOKS_REGISTERED__) {
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
