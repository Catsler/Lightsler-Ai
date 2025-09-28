const MAX_HISTORY = 200;
const HISTORY_WINDOW = 50;
const MAX_STRATEGY_HISTORY = 500;

class RollingWindow {
  constructor(name, windowMs, { maxEntries = 2000 } = {}) {
    this.name = name;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
    this.entries = [];
  }

  add(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    this.prune();
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
    const total = entries.length;
    const base = {
      name: this.name,
      windowMs: this.windowMs,
      sampleSize: total,
      successRate: 0,
      failureRate: 0,
      cachedRate: 0,
      averageDuration: 0,
      p50Duration: 0,
      p90Duration: 0,
      p95Duration: 0,
      p99Duration: 0,
      averageRetries: 0,
      strategies: {}
    };

    if (total === 0) {
      return base;
    }

    let successCount = 0;
    let cachedCount = 0;
    let retrySum = 0;
    const durations = [];
    const strategyMap = new Map();

    for (const entry of entries) {
      if (entry.success) successCount += 1;
      if (entry.cached) cachedCount += 1;
      retrySum += entry.retries ?? 0;
      if (Number.isFinite(entry.duration)) {
        durations.push(entry.duration);
      }

      const strategyKey = entry.strategy || 'unknown';
      if (!strategyMap.has(strategyKey)) {
        strategyMap.set(strategyKey, {
          total: 0,
          success: 0,
          failure: 0,
          cached: 0,
          durations: []
        });
      }
      const strat = strategyMap.get(strategyKey);
      strat.total += 1;
      if (entry.success) strat.success += 1;
      else strat.failure += 1;
      if (entry.cached) strat.cached += 1;
      if (Number.isFinite(entry.duration)) {
        strat.durations.push(entry.duration);
      }
    }

    const quantiles = calculateQuantiles(durations);
    const averageDuration = calculateAverage(durations);

    base.successRate = successCount / total;
    base.failureRate = 1 - base.successRate;
    base.cachedRate = cachedCount / total;
    base.averageDuration = Math.round(averageDuration || 0);
    base.averageRetries = total ? retrySum / total : 0;
    base.p50Duration = Math.round(quantiles.p50 || 0);
    base.p90Duration = Math.round(quantiles.p90 || 0);
    base.p95Duration = Math.round(quantiles.p95 || 0);
    base.p99Duration = Math.round(quantiles.p99 || 0);

    const strategies = {};
    for (const [strategy, stats] of strategyMap.entries()) {
      const strategyQuantiles = calculateQuantiles(stats.durations);
      strategies[strategy] = {
        total: stats.total,
        successRate: stats.total ? stats.success / stats.total : 0,
        cachedRate: stats.total ? stats.cached / stats.total : 0,
        averageDuration: Math.round(calculateAverage(stats.durations) || 0),
        p95Duration: Math.round(strategyQuantiles.p95 || 0)
      };
    }
    base.strategies = strategies;

    return base;
  }
}

const callHistory = [];
const totals = {
  total: 0,
  success: 0,
  failure: 0,
  cached: 0
};

const strategyStats = new Map();
const rollingWindows = [
  new RollingWindow('1m', 60 * 1000),
  new RollingWindow('5m', 5 * 60 * 1000),
  new RollingWindow('15m', 15 * 60 * 1000)
];

function updateStrategyStats(strategy, success, duration, cached) {
  if (!strategyStats.has(strategy)) {
    strategyStats.set(strategy, {
      total: 0,
      success: 0,
      failure: 0,
      cached: 0,
      durations: []
    });
  }

  const stats = strategyStats.get(strategy);
  stats.total += 1;
  if (success) stats.success += 1;
  else stats.failure += 1;
  if (cached) stats.cached += 1;
  if (Number.isFinite(duration)) {
    stats.durations.push(duration);
    if (stats.durations.length > MAX_STRATEGY_HISTORY) {
      stats.durations.splice(0, stats.durations.length - MAX_STRATEGY_HISTORY);
    }
  }
}

export function recordTranslationCall({ success, strategy, targetLang, duration, cached, retries }) {
  const timestamp = Date.now();
  const entry = {
    timestamp,
    success: Boolean(success),
    strategy: strategy || 'unknown',
    targetLang,
    duration: Number.isFinite(duration) ? duration : null,
    cached: Boolean(cached),
    retries: Number.isFinite(retries) ? retries : 0
  };

  callHistory.push(entry);
  if (callHistory.length > MAX_HISTORY) {
    callHistory.shift();
  }

  totals.total += 1;
  if (entry.success) totals.success += 1;
  else totals.failure += 1;
  if (entry.cached) totals.cached += 1;

  updateStrategyStats(entry.strategy, entry.success, entry.duration, entry.cached);
  for (const window of rollingWindows) {
    window.add(entry);
  }
}

function calculateAverage(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function pickQuantile(sortedValues, quantile) {
  if (!sortedValues.length) return 0;
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

export function getTranslationMetrics() {
  const recent = callHistory.slice(-HISTORY_WINDOW);
  const durations = recent.filter(entry => Number.isFinite(entry.duration)).map(entry => entry.duration);
  const retries = recent.map(entry => entry.retries);
  const recentQuantiles = calculateQuantiles(durations);

  const strategies = {};
  for (const [strategy, stats] of strategyStats.entries()) {
    const averageDuration = calculateAverage(stats.durations);
    const quantiles = calculateQuantiles(stats.durations);
    strategies[strategy] = {
      total: stats.total,
      successRate: stats.total ? stats.success / stats.total : 0,
      cachedRate: stats.total ? stats.cached / stats.total : 0,
      averageDuration: Math.round(averageDuration || 0),
      p50Duration: Math.round(quantiles.p50 || 0),
      p95Duration: Math.round(quantiles.p95 || 0),
      p99Duration: Math.round(quantiles.p99 || 0)
    };
  }

  const windows = {};
  for (const window of rollingWindows) {
    const stats = window.getStats();
    windows[window.name] = stats;
  }

  return {
    totals: {
      total: totals.total,
      success: totals.success,
      failure: totals.failure,
      cached: totals.cached,
      successRate: totals.total > 0 ? totals.success / totals.total : 0,
      cachedRate: totals.total > 0 ? totals.cached / totals.total : 0
    },
    recent: {
      windowSize: recent.length,
      averageDuration: Math.round(calculateAverage(durations) || 0),
      p50Duration: Math.round(recentQuantiles.p50 || 0),
      p90Duration: Math.round(recentQuantiles.p90 || 0),
      p95Duration: Math.round(recentQuantiles.p95 || 0),
      p99Duration: Math.round(recentQuantiles.p99 || 0),
      averageRetries: calculateAverage(retries) || 0
    },
    strategies,
    windows
  };
}
