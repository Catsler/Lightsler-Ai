#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

if (process.argv.length < 4) {
  console.error('Usage: node scripts/compare-baselines.js <before.json> <after.json>');
  process.exit(1);
}

const [beforePath, afterPath] = process.argv.slice(2);

function loadSnapshot(filePath) {
  const raw = fs.readFileSync(path.resolve(filePath), 'utf-8');
  return JSON.parse(raw);
}

function formatMs(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${value.toFixed(0)}ms`;
}

function formatDelta(before, after) {
  if (before === null || before === undefined || after === null || after === undefined) {
    return 'n/a';
  }
  const diff = after - before;
  const percent = before === 0 ? 0 : ((diff / before) * 100);
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(0)}ms (${sign}${percent.toFixed(1)}%)`;
}

const before = loadSnapshot(beforePath);
const after = loadSnapshot(afterPath);

const metrics = [
  { key: 'firstContentfulPaint', label: 'FCP' },
  { key: 'largestContentfulPaint', label: 'LCP' },
  { key: 'timeToFirstByte', label: 'TTFB' },
  { key: 'timeToInteractive', label: 'TTI' },
  { key: 'totalBlockingTime', label: 'TBT' },
  { key: 'domContentLoaded', label: 'DCL' },
  { key: 'loadEventEnd', label: 'Load' },
];

console.log('=== Performance Comparison ===');
console.log(`Before URL: ${before.navigation.url}`);
console.log(`After  URL: ${after.navigation.url}`);
console.log('');

for (const { key, label } of metrics) {
  const beforeVal = before.navigation[key];
  const afterVal = after.navigation[key];
  console.log(`${label.padEnd(6)} ${formatMs(beforeVal)} -> ${formatMs(afterVal)}   Δ ${formatDelta(beforeVal, afterVal)}`);
}

console.log('\n=== Resource Summary ===');
const beforeResources = before.navigation.resourceSummary;
const afterResources = after.navigation.resourceSummary;
console.log(`Total requests: ${beforeResources.count} -> ${afterResources.count}   Δ ${(afterResources.count - beforeResources.count)}`);

const allTypes = new Set([
  ...Object.keys(beforeResources.byType || {}),
  ...Object.keys(afterResources.byType || {}),
]);

for (const type of Array.from(allTypes).sort()) {
  const beforeInfo = beforeResources.byType?.[type] || { count: 0, duration: 0 };
  const afterInfo = afterResources.byType?.[type] || { count: 0, duration: 0 };
  const diffCount = afterInfo.count - beforeInfo.count;
  const diffDuration = afterInfo.duration - beforeInfo.duration;
  const signCount = diffCount > 0 ? '+' : '';
  const signDuration = diffDuration > 0 ? '+' : '';
  console.log(`  • ${type.padEnd(12)} ${beforeInfo.count} -> ${afterInfo.count} (${signCount}${diffCount}) | duration ${beforeInfo.duration.toFixed(0)} -> ${afterInfo.duration.toFixed(0)} (${signDuration}${diffDuration.toFixed(0)})`);
}

console.log('\nTop 5 longest resources AFTER:');
(after.navigation.topResources || []).slice(0, 5).forEach((res) => {
  console.log(`  - ${res.type.padEnd(10)} ${res.duration.toFixed(1)}ms ${res.name}`);
});
