import { json } from "@remix-run/node";
import { createApiRoute } from "../utils/base-route.server.js";
import { localeCookie } from "../cookies.server";
import { I18N_CONFIG } from "../config/i18n.config";

// 简易限流（内存）：每 IP 每分钟 30 次
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitStore = new Map(); // key -> { count, resetAt }

function getClientKey(request) {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for') || headers.get('cf-connecting-ip');
  return (forwarded || 'unknown').split(',')[0].trim();
}

function checkRateLimit(request) {
  const key = getClientKey(request);
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  return { allowed: true };
}

async function handleSetLocale({ request }) {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const limit = checkRateLimit(request);
  if (!limit.allowed) {
    return json(
      { success: false, error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter ?? 60) }
      }
    );
  }

  try {
    const formData = await request.formData();
    const locale = formData.get("locale")?.toString?.();

    const safeLocale = I18N_CONFIG.supportedLanguages.includes(locale || "")
      ? locale
      : I18N_CONFIG.defaultLanguage;

    const headers = new Headers();
    headers.append("Set-Cookie", await localeCookie.serialize(safeLocale));

    // TODO: rate limit 防刷（若有全局中间件可复用，否则标记技术债）
    return new Response(JSON.stringify({ success: true, locale: safeLocale }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("set-locale error:", error);
    return json({ success: false, error: "internal error" }, { status: 500 });
  }
}

export const action = createApiRoute(handleSetLocale, {
  requireAuth: false,
  operationName: "set-locale",
});
