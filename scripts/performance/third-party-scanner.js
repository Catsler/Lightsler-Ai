#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [, , reportPath] = process.argv;

if (!reportPath) {
  console.error('用法: node scripts/performance/third-party-scanner.js <lighthouse-report.json>');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const thirdParty = report.audits?.['third-party-summary'];

if (!thirdParty) {
  console.error('报告中缺少 third-party-summary 审计，可能需要启用 Lighthouse 的相应插件。');
  process.exit(1);
}

const entries = thirdParty.details?.items ?? [];

const CATEGORIES = {
  analytics: ['google-analytics.com', 'googletagmanager.com'],
  advertising: ['doubleclick.net', 'adservice.google.com'],
  social: ['facebook.net', 'twitter.com'],
  monitoring: ['sentry.io', 'datadog'],
};

function categorize(entity) {
  return Object.entries(CATEGORIES).find(([, domains]) =>
    domains.some((domain) => entity.includes(domain))
  )?.[0] ?? 'other';
}

function impactLabel(time) {
  if (time > 500) return 'high';
  if (time > 200) return 'medium';
  if (time > 0) return 'low';
  return 'none';
}

const summary = {};
const diagnostics = [];

for (const item of entries) {
  const category = categorize(item.entity);
  const bucket = summary[category] ?? {
    scripts: [],
    totalSize: 0,
    blockingTime: 0,
  };

  bucket.scripts.push({
    entity: item.entity,
    transferSize: item.transferSize ?? 0,
    blockingTime: item.blockingTime ?? 0,
  });
  bucket.totalSize += item.transferSize ?? 0;
  bucket.blockingTime += item.blockingTime ?? 0;

  summary[category] = bucket;
}

for (const [category, data] of Object.entries(summary)) {
  const scripts = data.scripts;
  const highImpactScripts = scripts.filter((s) => s.blockingTime > 500);
  const totalBlocking = data.blockingTime;
  const impact = impactLabel(totalBlocking);

  if (highImpactScripts.length > 0) {
    diagnostics.push({
      category,
      issue: '高阻塞时间脚本',
      priority: 'P0',
      details: highImpactScripts.map((s) => `${s.entity} (${s.blockingTime}ms)`),
      suggestion: '考虑异步加载或移除',
    });
  }

  if (category === 'analytics') {
    const analyticsScripts = scripts.length;
    if (analyticsScripts > 2) {
      diagnostics.push({
        category,
        issue: '分析脚本过多',
        priority: 'P1',
        details: scripts.map((s) => s.entity),
        suggestion: '整合为单一分析工具',
      });
    }
  }

  if (category === 'advertising' && impact !== 'none') {
    diagnostics.push({
      category,
      issue: '广告脚本影响性能',
      priority: impact === 'high' ? 'P0' : 'P1',
      details: scripts.map((s) => s.entity),
      suggestion: '移除或懒加载广告脚本',
    });
  }
}

console.log(`# 第三方资源分类 (${path.basename(reportPath)})`);
console.log('');
for (const [category, data] of Object.entries(summary)) {
  console.log(`## ${category}`);
  console.log(`- 脚本列表: ${data.scripts.map((s) => s.entity).join(', ')}`);
  console.log(`- 总体积: ${(data.totalSize / 1024).toFixed(1)} KB`);
  console.log(`- 阻塞时间: ${data.blockingTime} ms`);
  console.log(`- 影响评估: ${impactLabel(data.blockingTime)}`);
  console.log('');
}

if (diagnostics.length) {
  console.log('## 诊断建议');
  diagnostics.forEach((diag) => {
    console.log(`- [${diag.priority}] ${diag.category}: ${diag.issue}`);
    console.log(`  详情: ${diag.details.join(', ')}`);
    console.log(`  建议: ${diag.suggestion}`);
  });
} else {
  console.log('无明显第三方性能风险。');
}
