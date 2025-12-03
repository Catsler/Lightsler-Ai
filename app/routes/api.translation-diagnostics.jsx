import { authenticate } from "../shopify.server";
import { runTranslationDiagnostics } from "../services/translation.server.js";
import { createApiRoute } from "../utils/base-route.server.js";

async function handleTranslationDiagnostics({ request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const includeFallbacks = url.searchParams.get('includeFallbacks') !== 'false';
  const timeoutMsParam = url.searchParams.get('timeoutMs');
  let timeoutMs = undefined;

  if (timeoutMsParam) {
    const parsed = Number(timeoutMsParam);
    if (!Number.isNaN(parsed) && parsed > 0) {
      timeoutMs = Math.max(1000, Math.min(parsed, 60000));
    }
  }

  const diagnostics = await runTranslationDiagnostics({
    includeFallbacks,
    timeoutMs
  });

  return {
    shopId: session.shop,
    diagnostics,
    queriedAt: new Date().toISOString()
  };
}

export const loader = createApiRoute(handleTranslationDiagnostics, {
  requireAuth: true,
  operationName: 'translationDiagnostics'
});
