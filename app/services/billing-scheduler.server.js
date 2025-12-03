import { prisma } from '../db.server.js';
import { subscriptionManager } from './subscription-manager.server.js';
import shopify from '../shopify.server.js';
import { logger } from '../utils/logger.server.js';

function createAdminForShop(shop) {
  if (!shop?.accessToken || !shop?.domain) {
    logger.warn('[BillingScheduler] Missing shop credentials', {
      shopId: shop?.id,
      hasToken: !!shop?.accessToken,
      hasDomain: !!shop?.domain
    });
    return null;
  }
  try {
    const session = {
      id: `offline_${shop.domain}`,
      shop: shop.domain,
      state: 'offline',
      isOnline: false,
      accessToken: shop.accessToken,
      scope: process.env.SCOPES || '',
    };

    const client = new shopify.api.clients.Graphql({ session });

    return {
      graphql: async (query, options = {}) => {
        const result = await client.request(query, { variables: options.variables });
        const body = result?.body || result;
        return {
          json: async () => ({ data: body?.data, errors: body?.errors })
        };
      }
    };
  } catch (error) {
    logger.error('[BillingScheduler] Failed to create admin client', {
      shop: shop?.domain,
      error: error?.message || error
    });
    return null;
  }
}

export class BillingScheduler {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs ?? 5 * 60 * 1000; // 默认5分钟
    this.lockTtlSeconds = options.lockTtlSeconds ?? 600; // 10分钟
    this.enabled = options.enabled ?? true;
    this.timer = null;
    this.lockRefreshTimer = null;
    this.isRunning = false;
    this.lockKey = 'billing-scheduler';
  }

  async start() {
    if (this.isRunning || !this.enabled) return false;

    const acquired = await this.acquireLock();
    if (!acquired) {
      logger.info('[BillingScheduler] lock not acquired, skip start');
      return false;
    }

    this.isRunning = true;
    await this.scanAndExecuteSafe();
    this.timer = setInterval(() => this.scanAndExecuteSafe(), this.intervalMs);
    this.timer.unref?.();

    this.lockRefreshTimer = setInterval(() => this.refreshLock(), 240000);
    this.lockRefreshTimer.unref?.();

    logger.info(`[BillingScheduler] started, interval ${this.intervalMs}ms`);
    return true;
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.lockRefreshTimer) {
      clearInterval(this.lockRefreshTimer);
      this.lockRefreshTimer = null;
    }
    await this.releaseLock();
    this.isRunning = false;
    logger.info('[BillingScheduler] stopped');
  }

  async acquireLock() {
    try {
      const existing = await prisma.serviceLock.findUnique({
        where: { service: this.lockKey }
      });

      if (existing && existing.instanceId !== process.pid.toString()) {
        const ageMs = Date.now() - new Date(existing.acquiredAt).getTime();
        if (ageMs < this.lockTtlSeconds * 1000) {
          logger.info('[BillingScheduler] lock held by another instance', {
            instanceId: existing.instanceId,
            ageMs
          });
          return false;
        }
        logger.warn('[BillingScheduler] stale lock detected, force acquiring', {
          instanceId: existing.instanceId,
          ageMs
        });
      }

      await prisma.serviceLock.upsert({
        where: { service: this.lockKey },
        update: { instanceId: process.pid.toString(), acquiredAt: new Date() },
        create: { service: this.lockKey, instanceId: process.pid.toString() }
      });
      return true;
    } catch (error) {
      logger.debug('[BillingScheduler] lock acquire failed', { error: error?.message || error });
      return false;
    }
  }

  async refreshLock() {
    try {
      await prisma.serviceLock.update({
        where: { service: this.lockKey },
        data: { acquiredAt: new Date() }
      });
    } catch (error) {
      logger.warn('[BillingScheduler] lock refresh failed', { error: error?.message || error });
    }
  }

  async releaseLock() {
    try {
      await prisma.serviceLock.delete({ where: { service: this.lockKey } });
    } catch (error) {
      // ignore
    }
  }

  async scanAndExecuteSafe() {
    try {
      await this.scanAndExecutePendingPlanChanges();
    } catch (error) {
      logger.error('[BillingScheduler] scan failed', { error: error?.message || error });
    }
  }

  async scanAndExecutePendingPlanChanges() {
    const now = new Date();
    const pendingShops = await prisma.shop.findMany({
      where: {
        gracePeriodEndsAt: { lte: now },
        pendingPlanId: { not: null }
      },
      include: { pendingPlan: true }
    });

    if (!pendingShops.length) {
      logger.debug('[BillingScheduler] no pending plan changes');
      return;
    }

    logger.info(`[BillingScheduler] found ${pendingShops.length} pending plan changes`);

    for (const shop of pendingShops) {
      try {
        const admin = createAdminForShop(shop);
        if (!admin) {
          logger.warn('[BillingScheduler] skip shop due to missing admin', { shop: shop.domain });
          continue;
        }

        const result = await subscriptionManager.executePendingPlanChange({
          admin,
          shopId: shop.id
        });

        logger.info('[BillingScheduler] executed pending plan change', {
          shopId: shop.id,
          planId: result.planId,
          executed: result.executed
        });
      } catch (error) {
        logger.error('[BillingScheduler] execute failed', {
          shopId: shop.id,
          error: error?.message || error
        });
      }
    }
  }
}
