import { redirect } from '@remix-run/node';
import { authenticate } from '../shopify.server.js';
import { subscriptionManager } from '../services/subscription-manager.server.js';
import { billingLogger as logger } from '../utils/logger.server.js';

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  try {
    await subscriptionManager.syncSubscriptionFromShopify({
      admin,
      shopId: session.shop,
    });
  } catch (error) {
    logger.warn('[Billing] Activation sync failed, falling back to local status', {
      shopId: session.shop,
      error: error?.message || error,
    });
  }

  return redirect('/app/billing');
}

