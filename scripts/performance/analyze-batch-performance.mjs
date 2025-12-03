#!/usr/bin/env node

/**
 * Analyze theme translation metrics stored in ApiMetrics.metadata.
 *
 * Usage examples:
 *   node scripts/performance/analyze-batch-performance.mjs --hours 24
 *   node scripts/performance/analyze-batch-performance.mjs --days 7 --shop my-shop-id
 */

import process from 'node:process';
import { prisma } from '../../app/db.server.js';

const DEFAULT_HOURS = 24;
const DEFAULT_LIMIT = 1000;

function parseArgs(rawArgs) {
  const args = {
    hours: DEFAULT_HOURS,
    limit: DEFAULT_LIMIT,
    shop: null,
    resource: null,
    lang: null
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];
    const next = rawArgs[index + 1];
    switch (token) {
      case '--hours':
        args.hours = Number(next);
        index += 1;
        break;
      case '--days':
        args.hours = Number(next) * 24;
        index += 1;
        break;
      case '--limit':
        args.limit = Number(next);
        index += 1;
        break;
      case '--shop':
        args.shop = next;
        index += 1;
        break;
      case '--resource':
        args.resource = next;
        index += 1;
        break;
      case '--lang':
      case '--language':
        args.lang = next;
        index += 1;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  if (!Number.isFinite(args.hours) || args.hours <= 0) {
    args.hours = DEFAULT_HOURS;
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    args.limit = DEFAULT_LIMIT;
  }

  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/performance/analyze-batch-performance.mjs [options]

Options:
  --hours <number>     Lookback window in hours (default: ${DEFAULT_HOURS})
  --days <number>      Lookback window in days (overrides --hours)
  --limit <number>     Maximum rows to fetch (default: ${DEFAULT_LIMIT})
  --shop <shopId>      Filter by shopId stored in metadata.shopId
  --resource <id>      Filter by resourceId
  --lang <code>        Filter by language (metadata.language)
  --help               Show this help message
`);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

function formatDuration(ms) {
  return `${ms.toFixed(2)} ms`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function extractMeta(metric) {
  return metric?.metadata && typeof metric.metadata === 'object' ? metric.metadata : {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - args.hours * 60 * 60 * 1000);

  console.log(
    `[Metrics] Querying theme-translation-batch records for last ${args.hours}h (limit ${args.limit})`
  );

  const rawMetrics = await prisma.apiMetrics.findMany({
    where: {
      operation: 'theme-translation-batch',
      timestamp: { gte: since }
    },
    orderBy: { timestamp: 'desc' },
    take: args.limit
  });

  const filtered = rawMetrics.filter((metric) => {
    const meta = extractMeta(metric);
    if (args.shop && meta.shopId !== args.shop) return false;
    if (args.resource && meta.resourceId !== args.resource) return false;
    if (args.lang && meta.language !== args.lang) return false;
    return true;
  });

  if (!filtered.length) {
    console.log('No records found for given filters.');
    return;
  }

  const durations = filtered.map((metric) => extractMeta(metric).durationMs || 0);
  const memoryDeltas = filtered.map((metric) => extractMeta(metric).memoryDelta || 0);
  const fieldCounts = filtered.map((metric) => extractMeta(metric).fieldCount || 0);
  const batchCounts = filtered.map((metric) => extractMeta(metric).batchCount || 0);
  const skipFlags = filtered.filter((metric) => extractMeta(metric).skipped);

  const avgDuration = average(durations);
  const p95Duration = percentile(durations, 0.95);
  const avgMemory = average(memoryDeltas);
  const avgFields = average(fieldCounts);
  const avgBatches = average(batchCounts);
  const avgFieldsPerBatch = avgBatches ? avgFields / avgBatches : 0;

  console.log('\nSummary');
  console.table([
    { Metric: 'Samples', Value: filtered.length },
    { Metric: 'Average Duration', Value: formatDuration(avgDuration) },
    { Metric: 'P95 Duration', Value: formatDuration(p95Duration) },
    { Metric: 'Average Memory Δ', Value: formatBytes(avgMemory) },
    { Metric: 'Average Field Count', Value: avgFields.toFixed(2) },
    { Metric: 'Average Batch Count', Value: avgBatches.toFixed(2) },
    { Metric: 'Avg Fields / Batch', Value: avgFieldsPerBatch.toFixed(2) },
    { Metric: 'Skip Ratio', Value: `${((skipFlags.length / filtered.length) * 100).toFixed(2)}%` }
  ]);

  const slowest = [...filtered]
    .sort((a, b) => (extractMeta(b).durationMs || 0) - (extractMeta(a).durationMs || 0))
    .slice(0, 5)
    .map((metric) => ({
      timestamp: metric.timestamp.toISOString(),
      shopId: extractMeta(metric).shopId || '-',
      resourceId: extractMeta(metric).resourceId || '-',
      durationMs: Math.round(extractMeta(metric).durationMs || 0),
      fields: extractMeta(metric).fieldCount || 0,
      batches: extractMeta(metric).batchCount || 0,
      skipped: Boolean(extractMeta(metric).skipped),
      skipReason: extractMeta(metric).skipReason || ''
    }));

  console.log('\nTop 5 Slowest');
  console.table(slowest);
}

main()
  .catch((error) => {
    console.error('[Metrics] Failed to analyze batch performance', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof prisma?.$disconnect === 'function') {
      await prisma.$disconnect();
    }
  });
