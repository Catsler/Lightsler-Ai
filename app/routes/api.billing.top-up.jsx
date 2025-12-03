import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server.js';
import { creditManager } from '../services/credit-manager.server.js';
import { billingLogger as logger } from '../utils/logger.server.js';

export const action = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ success: false, message: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  try {
    const formData = await request.formData();
    const credits = Number.parseInt(formData.get('credits'), 10);

    if (!Number.isFinite(credits) || credits <= 0) {
      return json({ success: false, message: 'Invalid credit amount' }, { status: 400 });
    }

    await creditManager.purchaseTopUp(shopId, credits);
    return json({ success: true });
  } catch (error) {
    logger.error('[Billing] Top-up failed', { shopId, error: error.message });
    return json({ success: false, message: error.message }, { status: 500 });
  }
};
