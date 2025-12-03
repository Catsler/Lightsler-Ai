#!/usr/bin/env node

/**
 * CLI dashboard summarising theme translation metrics from ApiMetrics.
 *
 * Example:
 *   node scripts/performance/performance-dashboard.mjs
 */

import process from 'node:process';
import { prisma } from '../../app/db.server.js';

const HOURS_24 = 24;
const HOURS_7D = 24 * 7;

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values = [], p = 0.95) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[index];
}

function formatMs(ms) {
  return `${ms.toFixed(2)} ms`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(2)} ${units[idx]}`;
}

function extractMeta(metric) {
  return metric?.metadata && typeof metric.metadata === 'object' ? metric.metadata : {};
}

function aggregate(records = []) {
  if (!records.length) {
    return {
      count: 0,
      avgDuration: 0,
      p95Duration: 0,
      avgMemory: 0,
      avgFields: 0,
      avgBatches: 0,
      avgFieldsPerBatch: 0,
      skipRatio: 0
    };
  }

  const durations = records.map((record) => extractMeta(record).durationMs || 0);
  const memory = records.map((record) => extractMeta(record).memoryDelta || 0);
  const fields = records.map((record) => extractMeta(record).fieldCount || 0);
  const batches = records.map((record) => extractMeta(record).batchCount || 0);
  const skipped = records.filter((record) => extractMeta(record).skipped);

  const avgDuration = average(durations);
  const p95Duration = percentile(durations, 0.95);
  const avgMemory = average(memory);
  const avgFields = average(fields);
  const avgBatches = average(batches);
  const avgFieldsPerBatch = avgBatches ? avgFields / avgBatches : 0;
  const skipRatio = (skipped.length / records.length) * 100;

  return {
    count: records.length,
    avgDuration,
    p95Duration,
    avgMemory,
    avgFields,
    avgBatches,
    avgFieldsPerBatch,
    skipRatio
  };
}

function formatTrend(current, baseline) {
  if (!baseline) return '↔︎';
  const diff = current - baseline;
  const pct = baseline ? (diff / baseline) * 100 : 0;
  if (Math.abs(pct) < 1) return '↔︎';
  return diff > 0 ? `↑ ${pct.toFixed(1)}%` : `↓ ${Math.abs(pct).toFixed(1)}%`;
}

async function main() {
  const since7d = new Date(Date.now() - HOURS_7D * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - HOURS_24 * 60 * 60 * 1000);

  const metrics7d = await prisma.apiMetrics.findMany({
    where: {
      operation: 'theme-translation-batch',
      timestamp: { gte: since7d }
    },
    orderBy: { timestamp: 'desc' }
  });

  if (!metrics7d.length) {
    console.log('No theme-translation-batch metrics found.');
    return;
  }

  const metrics24h = metrics7d.filter((metric) => metric.timestamp >= since24h);
  const agg7d = aggregate(metrics7d);
  const agg24h = aggregate(metrics24h);

  const rows = [
    {
      Metric: 'Samples',
      '24h': agg24h.count,
      '7d': agg7d.count,
      Trend: formatTrend(agg24h.count, agg7d.count / 7)
    },
    {
      Metric: 'Avg Duration',
      '24h': formatMs(agg24h.avgDuration),
      '7d': formatMs(agg7d.avgDuration),
      Trend: formatTrend(agg24h.avgDuration, agg7d.avgDuration)
    },
    {
      Metric: 'P95 Duration',
      '24h': formatMs(agg24h.p95Duration),
      '7d': formatMs(agg7d.p95Duration),
      Trend: formatTrend(agg24h.p95Duration, agg7d.p95Duration)
    },
    {
      Metric: 'Avg Memory Δ',
      '24h': formatBytes(agg24h.avgMemory),
      '7d': formatBytes(agg7d.avgMemory),
      Trend: formatTrend(agg24h.avgMemory, agg7d.avgMemory)
    },
    {
      Metric: 'Avg Field Count',
      '24h': agg24h.avgFields.toFixed(2),
      '7d': agg7d.avgFields.toFixed(2),
      Trend: formatTrend(agg24h.avgFields, agg7d.avgFields)
    },
    {
      Metric: 'Avg Batch Count',
      '24h': agg24h.avgBatches.toFixed(2),
      '7d': agg7d.avgBatches.toFixed(2),
      Trend: formatTrend(agg24h.avgBatches, agg7d.avgBatches)
    },
    {
      Metric: 'Avg Fields / Batch',
      '24h': agg24h.avgFieldsPerBatch.toFixed(2),
      '7d': agg7d.avgFieldsPerBatch.toFixed(2),
      Trend: formatTrend(agg24h.avgFieldsPerBatch, agg7d.avgFieldsPerBatch)
    },
    {
      Metric: 'Skip Ratio',
      '24h': `${agg24h.skipRatio.toFixed(2)}%`,
      '7d': `${agg7d.skipRatio.toFixed(2)}%`,
      Trend: formatTrend(agg24h.skipRatio, agg7d.skipRatio)
    }
  ];

  console.log('\nTheme Translation Dashboard');
  console.log(`24h window >= ${since24h.toISOString()}`);
  console.log(`7d window >= ${since7d.toISOString()}`);
  console.table(rows);

  const recentWarnings = metrics24h
    .filter((metric) => {
      const meta = extractMeta(metric);
      return meta.durationMs >= 5000 || meta.fieldCount / Math.max(meta.batchCount || 1, 1) < 2;
    })
    .slice(0, 5)
    .map((metric) => {
      const meta = extractMeta(metric);
      return {
        timestamp: metric.timestamp.toISOString(),
        durationMs: Math.round(meta.durationMs || 0),
        fields: meta.fieldCount || 0,
        batches: meta.batchCount || 0,
        fieldsPerBatch: meta.batchCount ? (meta.fieldCount || 0) / meta.batchCount : 0,
        shopId: meta.shopId || '',
        resourceId: meta.resourceId || '',
        skipReason: meta.skipReason || ''
      };
    });

  if (recentWarnings.length) {
    console.log('\nRecent warnings (duration >= 5s or fields/batch < 2)');
    console.table(recentWarnings);
  } else {
    console.log('\nNo warning records in last 24h.');
  }
}

main()
  .catch((error) => {
    console.error('[Dashboard] Failed to load metrics', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof prisma?.$disconnect === 'function') {
      await prisma.$disconnect();
    }
  });
