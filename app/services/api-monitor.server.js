/**
 * API 可用性监控与告警模块
 * 依据 KISS 原则，提供轻量级的滚动窗口统计与阈值告警
 */

import { apiLogger } from '../utils/logger.server.js';
import { config } from '../utils/config.server.js';

const WINDOW_DEFINITIONS = [
  { name: '1m', windowMs: 60 * 1000 },
  { name: '5m', windowMs: 5 * 60 * 1000 },
  { name: '15m', windowMs: 15 * 60 * 1000 }
];

const defaultOptions = {
  enabled: Boolean(config.apiMonitoring?.enabled ?? true),
  operations: new Set(config.apiMonitoring?.operations ?? []),
  failureWarn: typeof config.apiMonitoring?.failureWarn === 'number' ? config.apiMonitoring.failureWarn : 0.001,
  failureError: typeof config.apiMonitoring?.failureError === 'number' ? config.apiMonitoring.failureError : 0.005,
  minSample: typeof config.apiMonitoring?.minSample === 'number' ? config.apiMonitoring.minSample : 20,
  p95WarnRatio: typeof config.apiMonitoring?.p95WarnRatio === 'number' ? config.apiMonitoring.p95WarnRatio : 1.05,
  p95ErrorRatio: typeof config.apiMonitoring?.p95ErrorRatio === 'number' ? config.apiMonitoring.p95ErrorRatio : 1.1
};

const monitorOptions = {
  enabled: defaultOptions.enabled,
  operations: new Set(defaultOptions.operations),
  failureWarn: defaultOptions.failureWarn,
  failureError: defaultOptions.failureError,
  minSample: defaultOptions.minSample,
  p95WarnRatio: defaultOptions.p95WarnRatio,
  p95ErrorRatio: defaultOptions.p95ErrorRatio
};

class RollingWindow {
  constructor(name, windowMs) {
    this.name = name;
    this.windowMs = windowMs;
    this.entries = [];
  }

  add(entry) {
    this.entries.push(entry);
    this.prune(entry.timestamp);
  }

  prune(now = Date.now()) {
    const cutoff = now - this.windowMs;
    let removeCount = 0;
    const { entries } = this;
    while (removeCount < entries.length && entries[removeCount].timestamp < cutoff) {
      removeCount += 1;
    }
    if (removeCount > 0) {
      entries.splice(0, removeCount);
    }
  }

  getStats(now = Date.now()) {
    this.prune(now);
    const { entries } = this;
    const sampleSize = entries.length;
    const base = {
      name: this.name,
      windowMs: this.windowMs,
      sampleSize,
      successRate: 0,
      failureRate: 0,
      averageDuration: 0,
      p50Duration: 0,
      p90Duration: 0,
      p95Duration: 0,
      p99Duration: 0,
      statusCounts: {}
    };

    if (sampleSize === 0) {
      return base;
    }

    let successCount = 0;
    const durations = [];
    const statusCounts = {};

    for (const entry of entries) {
      if (entry.success) successCount += 1;
      if (Number.isFinite(entry.duration)) {
        durations.push(entry.duration);
      }
      const statusKey = String(entry.statusCode ?? '0');
      statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
    }

    const quantiles = calculateQuantiles(durations);
    base.successRate = successCount / sampleSize;
    base.failureRate = 1 - base.successRate;
    base.averageDuration = Math.round(calculateAverage(durations) || 0);
    base.p50Duration = Math.round(quantiles.p50 || 0);
    base.p90Duration = Math.round(quantiles.p90 || 0);
    base.p95Duration = Math.round(quantiles.p95 || 0);
    base.p99Duration = Math.round(quantiles.p99 || 0);
    base.statusCounts = statusCounts;

    return base;
  }
}

class OperationMonitor {
  constructor(operation) {
    this.operation = operation;
    this.totals = { total: 0, success: 0, failure: 0 };
    this.windows = new Map(
      WINDOW_DEFINITIONS.map(({ name, windowMs }) => [name, new RollingWindow(name, windowMs)])
    );
    this.alertLevels = {
      failure: 'normal',
      latency: 'normal'
    };
    this.lastUpdatedAt = 0;
  }

  record(entry, evaluateAlerts) {
    this.totals.total += 1;
    if (entry.success) this.totals.success += 1;
    else this.totals.failure += 1;

    for (const window of this.windows.values()) {
      window.add(entry);
    }

    this.lastUpdatedAt = entry.timestamp;

    if (evaluateAlerts) {
      this.evaluateAlerts(entry.timestamp);
    }
  }

  evaluateAlerts(now) {
    const stats5m = this.getWindowStats('5m', now);
    const stats15m = this.getWindowStats('15m', now);

    this.updateFailureAlert(stats5m, now);
    this.updateLatencyAlert(stats5m, stats15m, now);
  }

  updateFailureAlert(stats, now) {
    const previousLevel = this.alertLevels.failure;
    let level = 'normal';

    if (stats.sampleSize >= monitorOptions.minSample) {
      if (stats.failureRate >= monitorOptions.failureError) {
        level = 'error';
      } else if (stats.failureRate >= monitorOptions.failureWarn) {
        level = 'warn';
      }
    }

    if (level !== previousLevel) {
      this.alertLevels.failure = level;
      logAlert('failure', level, this.operation, stats, now);
    }
  }

  updateLatencyAlert(stats5m, stats15m, now) {
    const previousLevel = this.alertLevels.latency;
    let level = 'normal';

    if (stats5m.sampleSize >= monitorOptions.minSample) {
      const baseline = stats15m && stats15m.p95Duration > 0 ? stats15m.p95Duration : stats5m.p95Duration;
      if (baseline > 0 && stats5m.p95Duration > baseline) {
        const ratio = stats5m.p95Duration / baseline;
        if (ratio >= monitorOptions.p95ErrorRatio) {
          level = 'error';
        } else if (ratio >= monitorOptions.p95WarnRatio) {
          level = 'warn';
        }
      }
    }

    if (level !== previousLevel) {
      this.alertLevels.latency = level;
      logAlert('latency', level, this.operation, stats5m, now, {
        baselineP95: stats15m.p95Duration,
        ratio: stats15m.p95Duration > 0
          ? Number((stats5m.p95Duration / stats15m.p95Duration).toFixed(3))
          : null
      });
    }
  }

  getWindowStats(name, now = Date.now()) {
    const window = this.windows.get(name);
    if (!window) {
      return {
        name,
        windowMs: 0,
        sampleSize: 0,
        successRate: 0,
        failureRate: 0,
        averageDuration: 0,
        p50Duration: 0,
        p90Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        statusCounts: {}
      };
    }
    return window.getStats(now);
  }

  getMetrics(now = Date.now()) {
    const totals = {
      ...this.totals,
      successRate: this.totals.total > 0 ? this.totals.success / this.totals.total : 0,
      failureRate: this.totals.total > 0 ? this.totals.failure / this.totals.total : 0
    };

    const windows = {};
    for (const [name, window] of this.windows.entries()) {
      windows[name] = window.getStats(now);
    }

    return {
      operation: this.operation,
      totals,
      windows,
      alerts: { ...this.alertLevels },
      lastUpdatedAt: this.lastUpdatedAt
    };
  }
}

const monitors = new Map();

function calculateAverage(values) {
  if (!values || values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function pickQuantile(sortedValues, quantile) {
  if (!sortedValues.length) {
    return 0;
  }
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * quantile) - 1));
  return sortedValues[index];
}

function calculateQuantiles(values) {
  if (!values || values.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: pickQuantile(sorted, 0.5),
    p90: pickQuantile(sorted, 0.9),
    p95: pickQuantile(sorted, 0.95),
    p99: pickQuantile(sorted, 0.99)
  };
}

function logAlert(type, level, operation, stats, timestamp, extra = {}) {
  const payload = {
    operation,
    alertType: type,
    level,
    windowMs: stats.windowMs,
    sampleSize: stats.sampleSize,
    failureRate: stats.failureRate,
    successRate: stats.successRate,
    p95Duration: stats.p95Duration,
    timestamp,
    statusCounts: stats.statusCounts,
    ...extra
  };

  if (level === 'normal') {
    apiLogger.info('API 指标恢复正常', {
      ...payload,
      metric: { api_monitor_recovered: 1 }
    });
    return;
  }

  if (level === 'warn') {
    apiLogger.warn('API 指标异常（警告）', {
      ...payload,
      metric: { api_monitor_warning: 1 }
    });
    return;
  }

  apiLogger.error('API 指标异常（严重）', {
    ...payload,
    metric: { api_monitor_critical: 1 }
  });
}

function getMonitor(operation) {
  if (!monitors.has(operation)) {
    monitors.set(operation, new OperationMonitor(operation));
  }
  return monitors.get(operation);
}

function shouldEvaluate(operation) {
  if (!monitorOptions.enabled) {
    return false;
  }
  if (monitorOptions.operations.size === 0) {
    return true;
  }
  return monitorOptions.operations.has(operation);
}

export function recordApiCall({
  operation,
  success,
  duration,
  statusCode,
  method,
  shopDomain,
  timestamp = Date.now()
}) {
  if (!monitorOptions.enabled || !operation) {
    return;
  }

  const entry = {
    timestamp,
    success: Boolean(success),
    duration: Number.isFinite(duration) ? Number(duration) : null,
    statusCode: statusCode ?? null,
    method,
    shopDomain
  };

  const monitor = getMonitor(operation);
  monitor.record(entry, shouldEvaluate(operation));
}

export function getApiMetrics({ operation } = {}) {
  const now = Date.now();
  if (operation) {
    const monitor = monitors.get(operation);
    return monitor ? monitor.getMetrics(now) : null;
  }

  return Array.from(monitors.values()).map((monitor) => monitor.getMetrics(now));
}

export function getApiAlertStates() {
  return Array.from(monitors.entries()).map(([operation, monitor]) => ({
    operation,
    alerts: { ...monitor.alertLevels },
    lastUpdatedAt: monitor.lastUpdatedAt
  }));
}

export function configureApiMonitor(overrides = {}) {
  if (overrides.enabled !== undefined) {
    monitorOptions.enabled = Boolean(overrides.enabled);
  }
  if (overrides.operations) {
    monitorOptions.operations = new Set(overrides.operations);
  } else if (overrides.operations === null) {
    monitorOptions.operations = new Set(defaultOptions.operations);
  }
  if (overrides.failureWarn !== undefined) {
    monitorOptions.failureWarn = Number(overrides.failureWarn);
  }
  if (overrides.failureError !== undefined) {
    monitorOptions.failureError = Number(overrides.failureError);
  }
  if (overrides.minSample !== undefined) {
    monitorOptions.minSample = Math.max(1, Number(overrides.minSample));
  }
  if (overrides.p95WarnRatio !== undefined) {
    monitorOptions.p95WarnRatio = Number(overrides.p95WarnRatio);
  }
  if (overrides.p95ErrorRatio !== undefined) {
    monitorOptions.p95ErrorRatio = Number(overrides.p95ErrorRatio);
  }
}

export function resetApiMonitor({ resetOptions = false } = {}) {
  monitors.clear();
  if (resetOptions) {
    monitorOptions.enabled = defaultOptions.enabled;
    monitorOptions.operations = new Set(defaultOptions.operations);
    monitorOptions.failureWarn = defaultOptions.failureWarn;
    monitorOptions.failureError = defaultOptions.failureError;
    monitorOptions.minSample = defaultOptions.minSample;
    monitorOptions.p95WarnRatio = defaultOptions.p95WarnRatio;
    monitorOptions.p95ErrorRatio = defaultOptions.p95ErrorRatio;
  }
}
