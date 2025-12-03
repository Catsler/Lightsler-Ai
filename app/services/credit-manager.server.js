import { prisma } from '../db.server.js';
import { billingLogger } from '../utils/logger.server.js';
import { creditCalculator } from './credit-calculator.server.js';
import {
  InsufficientCreditsError,
  MissingSubscriptionError,
  BillingConfigurationError
} from '../utils/billing-errors.server.js';
import { PRICING_CONFIG } from '../utils/pricing-config.js';

const DEFAULT_PLAN_NAME = process.env.DEFAULT_PLAN || 'free';
const RESERVATION_TTL_MS = Number(process.env.BILLING_RESERVATION_TTL_MS || 5 * 60 * 1000);
const COST_PER_CREDIT = PRICING_CONFIG.COST_PER_CREDIT;

function getTopUpAvailable(shop) {
  if (!shop) return 0;
  const expired = shop.topUpExpiresAt && shop.topUpExpiresAt < new Date();
  if (expired) return 0;
  return Math.max(0, shop.topUpCredits || 0);
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

class CreditManager {
  constructor({ prismaClient, calculator, log }) {
    this.prisma = prismaClient;
    this.calculator = calculator;
    this.logger = log;
    this.handlingReservations = new Set();
  }

  /**
   * 购买 Top-up（只处理额度与有效期，不含支付流程）。
   * @param {string} shopId
   * @param {number} credits 要增加的额度
   * @param {Date|null} expiresAt 可选，传 null 表示长期有效
   */
  async purchaseTopUp(shopId, credits, expiresAt = null) {
    if (!credits || credits <= 0) {
      throw new BillingConfigurationError('Top-up credits must be positive');
    }

    const result = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        topUpCredits: { increment: credits },
        topUpExpiresAt: expiresAt
      },
      select: { topUpCredits: true, topUpExpiresAt: true }
    });

    this.logger.info('[Billing] Top-up purchased', {
      shopId,
      credits,
      newBalance: result.topUpCredits,
      expiresAt: expiresAt || 'permanent'
    });

    return result;
  }

  async getActiveSubscription(tx, shopId) {
    const existing = await tx.shopSubscription.findUnique({
      where: { shopId },
      include: { plan: true }
    });

    if (existing) {
      return existing;
    }

    const defaultPlan = await tx.subscriptionPlan.findFirst({
      where: { name: DEFAULT_PLAN_NAME, isActive: true }
    });

    if (!defaultPlan) {
      throw new BillingConfigurationError('Default subscription plan is not configured');
    }

    const created = await tx.shopSubscription.create({
      data: {
        shopId,
        planId: defaultPlan.id,
        status: 'active',
        startDate: new Date()
      }
    });

    return { ...created, plan: defaultPlan };
  }

  async getMonthlyUsage(tx, shopId, { start, end }) {
    const usage = await tx.creditUsage.aggregate({
      where: {
        shopId,
        usageDate: {
          gte: start,
          lt: end
        },
        status: 'completed'
      },
      _sum: { creditsUsed: true }
    });

    const pending = await tx.creditReservation.aggregate({
      where: {
        shopId,
        status: 'pending'
      },
      _sum: { reservedCredits: true }
    });

    return {
      used: usage._sum.creditsUsed || 0,
      pending: pending._sum.reservedCredits || 0
    };
  }

  async reserveCredits(shopId, estimatedCredits, metadata = {}) {
    if (!estimatedCredits || estimatedCredits <= 0) {
      return null;
    }

    const reservationId = await this.prisma.$transaction(async (tx) => {
      // 获取订阅与计划
      const subscription = await this.getActiveSubscription(tx, shopId);
      if (!subscription) {
        throw new MissingSubscriptionError({ shopId });
      }

      // 获取当前 shop（用于 Top-up 判断）
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { topUpCredits: true, topUpExpiresAt: true }
      });

      const range = getMonthRange();
      const { used, pending } = await this.getMonthlyUsage(tx, shopId, range);
      const monthlyAvailable = subscription.plan.monthlyCredits - used - pending;
      const topUpAvailable = getTopUpAvailable(shop);
      const totalAvailable = Math.max(0, monthlyAvailable) + topUpAvailable;

      if (totalAvailable < estimatedCredits) {
        throw new InsufficientCreditsError({
          available: totalAvailable,
          required: estimatedCredits,
          planName: subscription.plan.name
        });
      }

      const reservation = await tx.creditReservation.create({
        data: {
          shopId,
          subscriptionId: subscription.id,
          reservedCredits: estimatedCredits,
          status: 'pending',
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS)
        }
      });

      if (metadata.debug) {
        this.logger.debug('[Billing] Reserved credits', {
          shopId,
          reserved: estimatedCredits,
          availableBefore: totalAvailable
        });
      }

      return reservation.id;
    });

    return reservationId;
  }

  async confirmUsage(reservationId, actualCredits, metadata = {}) {
    if (!reservationId) {
      return { used: actualCredits, released: 0 };
    }

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId }
      });

      if (!reservation) {
        this.logger.warn('[Billing] Reservation not found during confirm', { reservationId });
        return { used: actualCredits, released: 0 };
      }

      if (reservation.status !== 'pending') {
        return {
          used: reservation.actualCredits ?? actualCredits,
          released: Math.max(0, (reservation.reservedCredits || 0) - (reservation.actualCredits || actualCredits))
        };
      }

      const subscription = reservation.subscriptionId
        ? await tx.shopSubscription.findUnique({
            where: { id: reservation.subscriptionId },
            include: { plan: true }
          })
        : await this.getActiveSubscription(tx, reservation.shopId);

      const shop = await tx.shop.findUnique({
        where: { id: reservation.shopId },
        select: { topUpCredits: true, topUpExpiresAt: true }
      });

      // 计算扣减来源：先订阅额度，再 Top-up
      const { start, end } = getMonthRange();
      const { used } = await this.getMonthlyUsage(tx, reservation.shopId, { start, end });
      const monthlyRemaining = Math.max(0, (subscription?.plan?.monthlyCredits || 0) - used);
      const fromSubscription = Math.min(actualCredits, monthlyRemaining);
      const fromTopUp = Math.max(0, actualCredits - fromSubscription);

      // 更新 Top-up 余额（如有扣减）
      if (fromTopUp > 0 && shop) {
        const topUpAvailable = getTopUpAvailable(shop);
        const newTopUp = Math.max(0, topUpAvailable - fromTopUp);
        await tx.shop.update({
          where: { id: reservation.shopId },
          data: { topUpCredits: newTopUp }
        });
      }

      const usageRecord = await tx.creditUsage.create({
        data: {
          shopId: reservation.shopId,
          subscriptionId: subscription?.id,
          resourceId: metadata.resourceId,
          resourceType: metadata.resourceType,
          operation: metadata.operation,
          sourceCharCount: metadata.sourceCharCount || 0,
          creditsUsed: actualCredits,
          estimatedCredits: reservation.reservedCredits,
          actualCredits,
          creditsDiff: (reservation.reservedCredits || 0) - actualCredits,
          diffPercentage:
            reservation.reservedCredits && reservation.reservedCredits > 0
              ? (reservation.reservedCredits - actualCredits) / reservation.reservedCredits
              : 0,
          sourceLanguage: metadata.sourceLanguage,
          targetLanguage: metadata.targetLanguage,
          batchId: metadata.batchId,
          sessionId: metadata.sessionId,
          status: metadata.status || 'completed',
          metadata: {
            ...(metadata.metadata || metadata.details || {}),
            sources: {
              subscription: fromSubscription,
              topUp: fromTopUp
            }
          }
        }
      });

      await tx.creditReservation.update({
        where: { id: reservationId },
        data: {
          status: 'confirmed',
          actualCredits,
          releasedAt:
            reservation.reservedCredits > actualCredits ? new Date() : reservation.releasedAt
        }
      });

      // 费用与使用率监控
      const approximatedCost = actualCredits * COST_PER_CREDIT;
      if (approximatedCost > 1) {
        this.logger.error('[Billing] 单次翻译成本异常', {
          reservationId,
          approximatedCost: Number(approximatedCost.toFixed(2)),
          creditsUsed: actualCredits
        });
      } else if (approximatedCost > 0.5) {
        this.logger.warn('[Billing] 翻译成本偏高', {
          reservationId,
          approximatedCost: Number(approximatedCost.toFixed(2)),
          creditsUsed: actualCredits
        });
      }

      if (subscription?.plan?.monthlyCredits) {
        const { start, end } = getMonthRange();
        const { used } = await this.getMonthlyUsage(tx, reservation.shopId, { start, end });
        const usageRate = subscription.plan.monthlyCredits > 0
          ? used / subscription.plan.monthlyCredits
          : 0;

        if (usageRate >= 0.95) {
          this.logger.warn('[Billing] 月度额度使用率过高', {
            shopId: reservation.shopId,
            plan: subscription.plan.name,
            usageRate: Number((usageRate * 100).toFixed(1))
          });
        }
      }

      return {
        used: actualCredits,
        released: Math.max(0, (reservation.reservedCredits || 0) - actualCredits),
        usageId: usageRecord.id
      };
    });
  }

  async releaseReservation(reservationId) {
    if (!reservationId) return;

    await this.prisma.creditReservation.updateMany({
      where: { id: reservationId, status: 'pending' },
      data: { status: 'released', releasedAt: new Date() }
    });
  }

  async ensureReservationHandled(reservationId) {
    if (!reservationId) return;

    if (this.handlingReservations.has(reservationId)) {
      this.logger.debug('[Billing] Reservation already handled', { reservationId });
      return;
    }

    try {
      this.handlingReservations.add(reservationId);
      const reservation = await this.prisma.creditReservation.findUnique({ where: { id: reservationId } });

      if (reservation?.status === 'pending') {
        await this.releaseReservation(reservationId);
        const ageMinutes = (Date.now() - reservation.createdAt.getTime()) / 60000;
        if (ageMinutes > 10) {
          this.logger.warn('[Billing] Released pending reservation', {
            reservationId,
            shopId: reservation.shopId,
            reservedCredits: reservation.reservedCredits,
            ageMinutes: Math.round(ageMinutes)
          });
        } else {
          this.logger.debug('[Billing] Released stale reservation', { reservationId });
        }
      }
    } finally {
      this.handlingReservations.delete(reservationId);
    }
  }

  async getAvailableCredits(shopId) {
    const { start, end } = getMonthRange();
    const subscription = await this.prisma.shopSubscription.findUnique({
      where: { shopId },
      include: { plan: true }
    });

    if (!subscription) {
      throw new MissingSubscriptionError({ shopId });
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { topUpCredits: true, topUpExpiresAt: true }
    });

    const usage = await this.prisma.creditUsage.aggregate({
      where: {
        shopId,
        usageDate: {
          gte: start,
          lt: end
        },
        status: 'completed'
      },
      _sum: { creditsUsed: true }
    });

    const pending = await this.prisma.creditReservation.aggregate({
      where: {
        shopId,
        status: 'pending'
      },
      _sum: { reservedCredits: true }
    });

    const used = usage._sum.creditsUsed || 0;
    const pendingReserved = pending._sum.reservedCredits || 0;
    const monthlyAvailable = subscription.plan.monthlyCredits - used - pendingReserved;
    const topUpAvailable = getTopUpAvailable(shop);

    return {
      total: subscription.plan.monthlyCredits,
      used,
      pending: pendingReserved,
      topUp: topUpAvailable,
      available: Math.max(0, monthlyAvailable) + topUpAvailable
    };
  }

  async cleanupExpiredReservations() {
    const now = new Date();
    const expired = await this.prisma.creditReservation.findMany({
      where: {
        status: 'pending',
        expiresAt: { lt: now }
      }
    });

    if (!expired.length) {
      return;
    }

    const ids = expired.map((item) => item.id);
    await this.prisma.creditReservation.updateMany({
      where: { id: { in: ids } },
      data: { status: 'expired', releasedAt: new Date() }
    });

    const totalCredits = expired.reduce((sum, item) => sum + (item.reservedCredits || 0), 0);
    this.logger.warn('[Billing] Expired pending reservations released', {
      count: expired.length,
      totalCredits
    });
  }
}

export const creditManager = new CreditManager({
  prismaClient: prisma,
  calculator: creditCalculator,
  log: billingLogger
});

export { CreditManager };
