#!/usr/bin/env node

/**
 * 简易 Web Vitals 采集脚本样例，可部署为监控端点或定时任务。
 * 真实环境应结合队列/数据库，本脚本仅示例数据格式。
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , outputDir = 'logs/performance/rum'] = process.argv;
const OUT_DIR = path.resolve(outputDir);

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const samplePayload = {
  timestamp: new Date().toISOString(),
  store: 'fynony',
  metrics: {
    navigation: {
      loadEventEnd: performance.timing?.loadEventEnd ?? null,
      domContentLoadedEventEnd: performance.timing?.domContentLoadedEventEnd ?? null
    },
    paint: {
      firstPaint: performance.getEntriesByName('first-paint')?.[0]?.startTime ?? null,
      firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')?.[0]?.startTime ?? null
    },
    vitals: {
      LCP: null,
      FID: null,
      CLS: null,
      INP: null,
      TTFB: performance.timing ? performance.timing.responseStart - performance.timing.requestStart : null
    },
    resources: {
      count: performance.getEntriesByType('resource').length,
      maxDuration: Math.max(0, ...performance.getEntriesByType('resource').map((r) => r.responseEnd ?? 0))
    }
  },
  environment: {
    device: 'desktop',
    connection: '4g',
  },
};

const filePath = path.join(OUT_DIR, `${Date.now()}-sample.json`);
fs.writeFileSync(filePath, JSON.stringify(samplePayload, null, 2));

console.log(`✅ 已写入示例 RUM 数据：${filePath}`);
