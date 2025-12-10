import { json } from '@remix-run/node';
import { createApiRoute } from '../utils/base-route.server.js';
import { creditManager } from '../services/credit-manager.server.js';
import { billingLogger as logger } from '../utils/logger.server.js';

// 简易幂等缓存（内存，短 TTL，防重复扣款）
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 分钟
const idempotencyCache = new Map(); // key -> { shopId, response, expiresAt, pending }

function getIdempotencyKey(request, formData) {
  return (
    request.headers.get('x-idempotency-key') ||
    formData?.get?.('idempotencyKey') ||
    null
  );
}

function getCachedIdempotent(key, shopId) {
  if (!key) return null;
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    idempotencyCache.delete(key);
    return null;
  }
  if (entry.shopId !== shopId) return null;
  return entry;
}

async function handleTopUp({ request, session }) {
  if (request.method !== 'POST') {
    return json({ success: false, message: 'Method not allowed' }, { status: 405 });
  }

  const shopId = session?.shop;

  try {
    const formData = await request.formData();
    const credits = Number.parseInt(formData.get('credits'), 10);

    if (!Number.isFinite(credits) || credits <= 0) {
      return json({ success: false, message: 'Invalid credit amount' }, { status: 400 });
    }

    const idemKey = getIdempotencyKey(request, formData);
    const existing = getCachedIdempotent(idemKey, shopId);
    if (existing) {
      if (existing.pending) {
        return json({ success: false, message: 'Idempotent request in progress' }, { status: 409 });
      }
      return json(existing.response);
    }

    if (idemKey) {
      idempotencyCache.set(idemKey, {
        shopId,
        pending: true,
        response: null,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS
      });
    }

    await creditManager.purchaseTopUp(shopId, credits);

    const responseBody = { success: true };
    if (idemKey) {
      idempotencyCache.set(idemKey, {
        shopId,
        pending: false,
        response: responseBody,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS
      });
    }

    return json(responseBody);
  } catch (error) {
    if (request?.headers && request.headers.get('x-idempotency-key')) {
      idempotencyCache.delete(request.headers.get('x-idempotency-key'));
    }
    logger.error('[Billing] Top-up failed', { shopId: shopId || 'unknown', error: error.message });
    return json({ success: false, message: error.message }, { status: 500 });
  }
}

export const action = createApiRoute(handleTopUp, {
  requireAuth: true,
  operationName: 'billing-top-up',
});
