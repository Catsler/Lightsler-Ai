import fs from 'node:fs/promises';
import path from 'node:path';

import { prisma } from '../db.server.js';
import { logger } from '../utils/logger.server.js';
import { getApiMetrics } from './api-monitor.server.js';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

const ensureNumber = (value, fallback = 0) => {
  if (Number.isFinite(value)) {
    return Number(value);
  }
  return fallback;
};

export class MetricsPersistence {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs ?? 60 * 60 * 1000; // 默认1小时
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5 * 60 * 1000;
    this.instanceId = options.instanceId ?? process.env.INSTANCE_ID ?? `instance-${process.pid}`;
    this.serviceName = options.serviceName ?? 'metrics-persistence';
    this.maxRetries = Math.max(1, options.maxRetries ?? 3);
    this.pendingRecords = [];
    this.retryCount = 0;
    this.timer = null;
    this.lockRefreshTimer = null;
    this.isRunning = false;
    this.lockHeld = false;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('[MetricsPersistence] 已在运行');
      return false;
    }

    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      logger.info('[MetricsPersistence] 未获取锁，跳过启动');
      return false;
    }

    this.isRunning = true;
    await this.persistSafe();

    this.timer = setInterval(() => {
      this.persistSafe();
    }, this.intervalMs).unref?.();

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

    if (this.isRunning) {
      await this.flush();
      await this.releaseLock();
    }

    this.isRunning = false;
  }

  async flush() {
    if (!this.pendingRecords.length) {
      return { success: true, count: 0 };
    }

    try {
      await prisma.apiMetrics.createMany({
        data: this.pendingRecords,
        skipDuplicates: true
      });
      const count = this.pendingRecords.length;
      this.pendingRecords = [];
      this.retryCount = 0;
      return { success: true, count };
    } catch (error) {
      logger.error('[MetricsPersistence] Flush 失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async persistSafe() {
    try {
      await this.persist();
      this.retryCount = 0;
    } catch (error) {
      this.retryCount += 1;
      logger.error('[MetricsPersistence] 写入失败', {
        error: error.message,
        retryCount: this.retryCount
      });

      if (this.retryCount >= this.maxRetries) {
        await this.dumpPendingRecords();
        this.retryCount = 0;
      }
    }
  }

  async persist() {
    const snapshot = getApiMetrics() || [];
    const metrics = Array.isArray(snapshot) ? snapshot : [snapshot].filter(Boolean);
    if (!metrics.length) {
      logger.debug('[MetricsPersistence] 没有可写入的指标');
      return;
    }

    const records = [];
    const now = new Date();

    for (const metric of metrics) {
      if (!metric || !metric.operation) continue;
      const totals = metric.totals || {};
      const windows = metric.windows || {};
      const window5m = windows['5m'] || windows['15m'] || windows['1m'] || {};

      if (!Number.isFinite(totals.total) || totals.total === 0) {
        continue;
      }

      records.push({
        operation: metric.operation,
        timestamp: now,
        success: ensureNumber(totals.success),
        failure: ensureNumber(totals.failure),
        successRate: ensureNumber(totals.successRate, 0),
        failureRate: ensureNumber(totals.failureRate, 0),
        p95: ensureNumber(window5m.p95Duration, 0),
        instanceId: this.instanceId
      });
    }

    if (!records.length && !this.pendingRecords.length) {
      logger.debug('[MetricsPersistence] 指标为空，跳过');
      return;
    }

    const payload = this.pendingRecords.length ? [...this.pendingRecords, ...records] : records;

    try {
      await prisma.apiMetrics.createMany({
        data: payload,
        skipDuplicates: true
      });

      if (this.pendingRecords.length) {
        logger.info('[MetricsPersistence] 已写入挂起记录', { count: payload.length });
      }

      this.pendingRecords = [];
    } catch (error) {
      this.pendingRecords = payload;
      throw error;
    }
  }

  async acquireLock() {
    const cutoff = new Date(Date.now() - this.lockTimeoutMs);
    try {
      await prisma.serviceLock.deleteMany({
        where: {
          service: this.serviceName,
          acquiredAt: { lt: cutoff }
        }
      });
    } catch (error) {
      logger.warn('[MetricsPersistence] 清理锁失败', { error: error.message });
    }

    try {
      await prisma.serviceLock.create({
        data: {
          service: this.serviceName,
          instanceId: this.instanceId
        }
      });
      this.lockHeld = true;
      this.ensureLockRefresh();
      return true;
    } catch (error) {
      if (error.code === 'P2002') {
        const existing = await prisma.serviceLock.findUnique({
          where: { service: this.serviceName }
        });
        if (existing?.instanceId === this.instanceId) {
          await prisma.serviceLock.update({
            where: { service: this.serviceName },
            data: { acquiredAt: new Date(), instanceId: this.instanceId }
          });
          this.lockHeld = true;
          this.ensureLockRefresh();
          return true;
        }
        return false;
      }
      logger.error('[MetricsPersistence] 获取锁失败', { error: error.message });
      return false;
    }
  }

  ensureLockRefresh() {
    if (this.lockRefreshTimer) return;
    const refreshInterval = Math.max(10_000, Math.floor(this.lockTimeoutMs / 2));
    this.lockRefreshTimer = setInterval(async () => {
      if (!this.lockHeld) return;
      try {
        await prisma.serviceLock.update({
          where: { service: this.serviceName },
          data: { acquiredAt: new Date(), instanceId: this.instanceId }
        });
      } catch (error) {
        logger.warn('[MetricsPersistence] 刷新锁失败', { error: error.message });
      }
    }, refreshInterval).unref?.();
  }

  async releaseLock() {
    if (!this.lockHeld) return;
    try {
      await prisma.serviceLock.delete({ where: { service: this.serviceName } });
    } catch (error) {
      logger.warn('[MetricsPersistence] 释放锁失败', { error: error.message });
    } finally {
      this.lockHeld = false;
    }
  }

  async dumpPendingRecords() {
    if (!this.pendingRecords.length) {
      return;
    }

    try {
      await fs.mkdir(LOG_DIR, { recursive: true });
      const filePath = path.join(LOG_DIR, `metrics_dump_${Date.now()}.jsonl`);
      const payload = this.pendingRecords.map((record) => JSON.stringify(record)).join('\n');
      await fs.writeFile(filePath, payload, 'utf8');
      logger.error('[MetricsPersistence] 持久化失败，已转储到文件', {
        count: this.pendingRecords.length,
        filePath
      });
      this.pendingRecords = [];
    } catch (error) {
      logger.error('[MetricsPersistence] dump 文件失败', { error: error.message });
    }
  }
}

export async function collectMetric(operation, metadata = {}, options = {}) {
  if (!operation) {
    return { success: false, error: 'operation required' };
  }

  const successFlag = options.success ?? true;
  const successCount = Number.isFinite(options.success)
    ? ensureNumber(options.success)
    : successFlag
      ? 1
      : 0;
  const failureCount = Number.isFinite(options.failure)
    ? ensureNumber(options.failure)
    : successFlag
      ? 0
      : 1;

  const payload = {
    operation,
    timestamp: options.timestamp ?? new Date(),
    success: successCount,
    failure: failureCount,
    successRate: Number.isFinite(options.successRate) ? ensureNumber(options.successRate) : successFlag ? 1 : 0,
    failureRate: Number.isFinite(options.failureRate) ? ensureNumber(options.failureRate) : successFlag ? 0 : 1,
    p95: ensureNumber(options.p95 ?? metadata?.durationMs ?? metadata?.duration ?? 0, 0),
    instanceId: options.instanceId ?? process.env.INSTANCE_ID ?? `instance-${process.pid}`,
    metadata: metadata && typeof metadata === 'object' ? metadata : {}
  };

  try {
    await prisma.apiMetrics.create({ data: payload });
    return { success: true };
  } catch (error) {
    logger.warn('[MetricsPersistence] collectMetric失败', {
      operation,
      error: error?.message || error
    });
    return { success: false, error: error?.message || String(error) };
  }
}

export const metricsPersistence = new MetricsPersistence();
