import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CreditManager } from '../../app/services/credit-manager.server.js';
import { creditCalculator } from '../../app/services/credit-calculator.server.js';
import { InsufficientCreditsError } from '../../app/utils/billing-errors.server.js';

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

class FakePrisma {
  constructor() {
    this.reset();
  }

  reset() {
    this.plans = [
      { id: 'plan_default', name: 'free', isActive: true, monthlyCredits: 130 }
    ];
    this.shopSubscriptions = new Map();
    this.creditReservations = new Map();
    this.creditUsages = [];
    this._reservationCounter = 0;
    this._subscriptionCounter = 0;
  }

  clone(value) {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  get defaultPlan() {
    return this.plans[0];
  }

  async $transaction(callback) {
    return callback(this);
  }

  subscriptionPlan = {
    findFirst: async (params = {}) => {
      const { where } = params;
      const plan = this.plans.find((candidate) => {
        const nameMatch = !where?.name || candidate.name === where.name;
        const activeMatch = where?.isActive === undefined || candidate.isActive === where.isActive;
        return nameMatch && activeMatch;
      });
      return plan ? this.clone(plan) : null;
    }
  };

  shopSubscription = {
    findUnique: async ({ where }) => {
      const stored = this.shopSubscriptions.get(where.shopId);
      return stored ? this.clone(stored) : null;
    },
    create: async ({ data }) => {
      const created = { id: `sub_${++this._subscriptionCounter}`, ...data };
      this.shopSubscriptions.set(data.shopId, {
        ...created,
        plan: this.clone(this.defaultPlan)
      });
      return this.clone(created);
    }
  };

  creditUsage = {
    aggregate: async ({ where } = {}) => {
      const matches = this.creditUsages.filter((record) => {
        if (where?.shopId && record.shopId !== where.shopId) return false;
        if (where?.status && record.status !== where.status) return false;
        if (where?.usageDate?.gte && record.usageDate < where.usageDate.gte) return false;
        if (where?.usageDate?.lt && record.usageDate >= where.usageDate.lt) return false;
        return true;
      });
      const total = matches.reduce((sum, record) => sum + (record.creditsUsed || 0), 0);
      return { _sum: { creditsUsed: total } };
    },
    create: async ({ data }) => {
      const record = {
        id: `usage_${this.creditUsages.length + 1}`,
        usageDate: data.usageDate ?? new Date(),
        status: data.status ?? 'completed',
        ...data
      };
      this.creditUsages.push(record);
      return this.clone(record);
    }
  };

  creditReservation = {
    aggregate: async ({ where } = {}) => {
      const matches = Array.from(this.creditReservations.values()).filter((record) => {
        if (where?.shopId && record.shopId !== where.shopId) return false;
        if (where?.status && record.status !== where.status) return false;
        return true;
      });
      const total = matches.reduce((sum, record) => sum + (record.reservedCredits || 0), 0);
      return { _sum: { reservedCredits: total } };
    },
    create: async ({ data }) => {
      const record = {
        id: `res_${++this._reservationCounter}`,
        createdAt: new Date(),
        releasedAt: null,
        ...data
      };
      this.creditReservations.set(record.id, record);
      return this.clone(record);
    },
    findUnique: async ({ where }) => {
      const record = this.creditReservations.get(where.id);
      return record ? this.clone(record) : null;
    },
    update: async ({ where, data }) => {
      const existing = this.creditReservations.get(where.id);
      if (!existing) {
        return null;
      }
      const updated = { ...existing, ...data };
      this.creditReservations.set(where.id, updated);
      return this.clone(updated);
    },
    updateMany: async ({ where = {}, data = {} }) => {
      let count = 0;
      for (const [id, record] of this.creditReservations.entries()) {
        if (where.id) {
          if (typeof where.id === 'object' && Array.isArray(where.id.in)) {
            if (!where.id.in.includes(id)) continue;
          } else if (id !== where.id) {
            continue;
          }
        }
        if (where.status && record.status !== where.status) continue;
        const updated = { ...record, ...data };
        this.creditReservations.set(id, updated);
        count += 1;
      }
      return { count };
    },
    findMany: async ({ where = {} }) => {
      const results = [];
      for (const record of this.creditReservations.values()) {
        if (where.status && record.status !== where.status) continue;
        if (where.expiresAt?.lt && !(record.expiresAt < where.expiresAt.lt)) continue;
        results.push(this.clone(record));
      }
      return results;
    }
  };

  shop = {
    findUnique: async ({ where: { id } }) => {
      return this.clone({
        id,
        topUpCredits: 0,
        topUpExpiresAt: null
      });
    },
    update: async ({ where: { id }, data }) => {
      return this.clone({
        id,
        ...data
      });
    }
  };

  getReservation(id) {
    const record = this.creditReservations.get(id);
    return record ? this.clone(record) : null;
  }

  updateReservationForTest(id, updates) {
    const record = this.creditReservations.get(id);
    if (record) {
      Object.assign(record, updates);
    }
  }
}

function createManager() {
  const prisma = new FakePrisma();
  const manager = new CreditManager({
    prismaClient: prisma,
    calculator: creditCalculator,
    log: noopLogger
  });
  return { prisma, manager };
}

test('reserveCredits prevents oversubscription for concurrent requests', async () => {
  const { prisma, manager } = createManager();

  const reservationId = await manager.reserveCredits('shop-test', 60);
  assert.ok(reservationId, 'first reservation should succeed');

  await assert.rejects(
    manager.reserveCredits('shop-test', 80),
    (error) => error instanceof InsufficientCreditsError
  );

  const stored = prisma.getReservation(reservationId);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.reservedCredits, 60);
});

test('ensureReservationHandled releases pending reservations', async () => {
  const { prisma, manager } = createManager();

  const reservationId = await manager.reserveCredits('shop-test', 8);
  const before = prisma.getReservation(reservationId);
  assert.equal(before.status, 'pending');

  await manager.ensureReservationHandled(reservationId);

  const after = prisma.getReservation(reservationId);
  assert.equal(after.status, 'released');
  assert.ok(after.releasedAt instanceof Date, 'releasedAt should be set');
});

test('confirmUsage records actual usage and differences', async () => {
  const { prisma, manager } = createManager();

  const reservationId = await manager.reserveCredits('shop-test', 12);
  const confirmation = await manager.confirmUsage(reservationId, 9, {
    resourceId: 'res-1',
    resourceType: 'PRODUCT',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    batchId: 'batch-1',
    sessionId: 'session-1',
    sourceCharCount: 100,
    metadata: { fieldName: 'title' }
  });

  assert.equal(confirmation.used, 9);
  assert.equal(confirmation.released, 3);

  const reservation = prisma.getReservation(reservationId);
  assert.equal(reservation.status, 'confirmed');
  assert.equal(reservation.actualCredits, 9);

  assert.equal(prisma.creditUsages.length, 1);
  const usage = prisma.creditUsages[0];
  assert.equal(usage.creditsUsed, 9);
  assert.equal(usage.estimatedCredits, 12);
  assert.equal(usage.creditsDiff, 3);
  assert.ok(Math.abs(usage.diffPercentage - 0.25) < 1e-6);
});

test('cleanupExpiredReservations marks pending reservations as expired', async () => {
  const { prisma, manager } = createManager();

  const reservationId = await manager.reserveCredits('shop-test', 80);
  prisma.updateReservationForTest(reservationId, {
    expiresAt: new Date(Date.now() - 1000)
  });

  await manager.cleanupExpiredReservations();

  const reservation = prisma.getReservation(reservationId);
  assert.equal(reservation.status, 'expired');
  assert.ok(reservation.releasedAt instanceof Date);
});
