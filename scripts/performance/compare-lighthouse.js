#!/usr/bin/env node

/**
 * 对比两份 Lighthouse JSON 报告，输出 Markdown 格式差异摘要。
 */

import fs from 'node:fs';

const [,, reportAPath, reportBPath] = process.argv;

if (!reportAPath || !reportBPath) {
  console.error('用法: node scripts/performance/compare-lighthouse.js <reportA.json> <reportB.json>');
  process.exit(1);
}

const reportA = JSON.parse(fs.readFileSync(reportAPath, 'utf-8'));
const reportB = JSON.parse(fs.readFileSync(reportBPath, 'utf-8'));

function toSummary(report) {
  const categories = report.categories || {};
  const metrics = report.audits || {};
  return {
    score: categories.performance?.score ? categories.performance.score * 100 : null,
    lcp: metrics['largest-contentful-paint']?.numericValue ?? null,
    fcp: metrics['first-contentful-paint']?.numericValue ?? null,
    tbt: metrics['total-blocking-time']?.numericValue ?? null,
    cls: metrics['cumulative-layout-shift']?.numericValue ?? null,
  };
}

const summaryA = toSummary(reportA);
const summaryB = toSummary(reportB);

function formatMs(value) {
  return value != null ? `${(value / 1000).toFixed(2)}s` : 'NA';
}

const lines = [
  '# Lighthouse 报告对比',
  '',
  '| 指标 | 报告 A | 报告 B | 差值 |',
  '|------|--------|--------|------|',
  `| Score | ${summaryA.score ?? 'NA'} | ${summaryB.score ?? 'NA'} | ${(summaryB.score ?? 0) - (summaryA.score ?? 0)} |`,
  `| LCP | ${formatMs(summaryA.lcp)} | ${formatMs(summaryB.lcp)} | ${(summaryB.lcp ?? 0) - (summaryA.lcp ?? 0)} ms |`,
  `| FCP | ${formatMs(summaryA.fcp)} | ${formatMs(summaryB.fcp)} | ${(summaryB.fcp ?? 0) - (summaryA.fcp ?? 0)} ms |`,
  `| TBT | ${summaryA.tbt ?? 'NA'} ms | ${summaryB.tbt ?? 'NA'} ms | ${(summaryB.tbt ?? 0) - (summaryA.tbt ?? 0)} ms |`,
  `| CLS | ${summaryA.cls ?? 'NA'} | ${summaryB.cls ?? 'NA'} | ${(summaryB.cls ?? 0) - (summaryA.cls ?? 0)} |`,
  '',
  '> 报告 A: ' + reportAPath,
  '> 报告 B: ' + reportBPath,
];

console.log(lines.join('\n'));
