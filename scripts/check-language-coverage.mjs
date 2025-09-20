#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { calculateLanguageCoverage } from '../app/services/language-coverage.server.js';

const [,, shopId, language] = process.argv;

if (!shopId || !language) {
  console.error('用法: node scripts/check-language-coverage.mjs <shopId> <language>');
  process.exit(1);
}

async function run() {
  const start = performance.now();
  const fresh = await calculateLanguageCoverage(shopId, language, { forceRefresh: true });
  const durationFresh = performance.now() - start;

  const cachedStart = performance.now();
  await calculateLanguageCoverage(shopId, language, { forceRefresh: false });
  const durationCached = performance.now() - cachedStart;

  const { counts, percentages } = fresh;
  const manualCoverage = counts.total > 0 ? Number(((counts.upToDate / counts.total) * 100).toFixed(2)) : 0;

  console.log(JSON.stringify({
    shopId,
    language,
    counts,
    percentages,
    manualCoverage,
    durations: {
      freshMs: Number(durationFresh.toFixed(2)),
      cachedMs: Number(durationCached.toFixed(2))
    }
  }, null, 2));

  if (Math.abs(manualCoverage - percentages.coverage) > 0.01) {
    console.error('⚠️ 覆盖率百分比与手动计算不一致，请检查逻辑');
    process.exitCode = 2;
  } else {
    console.log('✅ 覆盖率计算通过基本一致性检查');
  }
}

run().catch(error => {
  console.error('运行失败:', error);
  process.exit(1);
});
