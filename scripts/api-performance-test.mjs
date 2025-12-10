#!/usr/bin/env node
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import process from 'process';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const target = args.url || 'http://localhost:3000/api/translate';
const iterations = Number(args.iterations || 100);
const concurrency = Number(args.concurrency || 5);
const output = args.output || 'docs/performance/api-performance-baseline.json';
const textPayload = args.text || 'Hello world';
const method = args.method || 'POST';
const timeoutMs = Number(args.timeoutMs || 30000);

function loadCookieString() {
  if (args.cookie) return args.cookie;
  if (args['cookie-file']) {
    const cookiePath = path.resolve(process.cwd(), args['cookie-file']);
    if (!fs.existsSync(cookiePath)) {
      throw new Error(`Cookie 文件不存在: ${cookiePath}`);
    }
    const content = fs.readFileSync(cookiePath, 'utf8');
    try {
      const parsed = JSON.parse(content);
      return parsed.cookieHeader || parsed.cookie || '';
    } catch (err) {
      return content.trim();
    }
  }
  return '';
}

function loadExtraHeaders() {
  if (!args.headers) return {};
  try {
    return JSON.parse(args.headers);
  } catch (err) {
    throw new Error('headers 参数不是合法的 JSON 字符串');
  }
}

function percentile(sorted, p) {
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

async function measureEndpoint(url, { iterations, concurrency, body, headers, method, timeoutMs }) {
  const samples = [];
  let success = 0;
  let failures = 0;
  let authFailures = 0;
  let lastError = null;

  const testStartTime = performance.now();

  const runOne = async () => {
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) authFailures += 1;
        throw new Error(`HTTP ${res.status}`);
      }
      await res.text();
      success += 1;
    } catch (err) {
      lastError = err;
      failures += 1;
    } finally {
      clearTimeout(timer);
      samples.push(performance.now() - start);
    }
  };

  let nextIndex = 0;
  const active = new Set();

  const scheduleNext = () => {
    while (nextIndex < iterations && active.size < concurrency) {
      nextIndex += 1;
      const promise = runOne().finally(() => {
        active.delete(promise);
        scheduleNext();
      });
      active.add(promise);
    }
  };

  scheduleNext();
  while (active.size > 0) {
    await Promise.race([...active]);
  }

  const testEndTime = performance.now();

  samples.sort((a, b) => a - b);
  const totalResponseTimeMs = samples.reduce((a, b) => a + b, 0);
  const mean = totalResponseTimeMs / samples.length || 0;
  const p50 = percentile(samples, 50);
  const p90 = percentile(samples, 90);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  const actualTestDurationMs = testEndTime - testStartTime;
  const throughput = samples.length / (actualTestDurationMs / 1000 || 1);
  const min = samples[0] ?? 0;
  const max = samples[samples.length - 1] ?? 0;

  // 边界检查：所有请求失败时发出警告
  if (success === 0 && samples.length > 0) {
    console.warn('⚠️ 警告: 所有请求均失败，延迟统计仅反映失败时间（如超时）！');
  }

  return {
    count: samples.length,
    success,
    failures,
    authFailures,
    latency: { min, max, p50, p90, p95, p99, mean },
    actualTestDurationMs,
    totalResponseTimeMs,
    p50,
    p90,
    p95,
    p99,
    mean,
    throughput,
    lastError: lastError ? String(lastError.message || lastError) : undefined
  };
}

(async () => {
  const cookieHeader = loadCookieString();
  const extraHeaders = loadExtraHeaders();
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const startedAt = new Date();

  console.log(
    `Running API perf: ${target} method=${method} iterations=${iterations} concurrency=${concurrency} timeoutMs=${timeoutMs}`
  );
  if (cookieHeader) {
    console.log('Cookie 已注入，长度:', cookieHeader.length);
  }
  if (Object.keys(extraHeaders).length > 0) {
    console.log('附加请求头 keys:', Object.keys(extraHeaders).join(', '));
  }

  const metrics = await measureEndpoint(target, {
    iterations,
    concurrency,
    body: { text: textPayload, targetLanguage: 'zh-CN' },
    headers,
    method,
    timeoutMs
  });

  const result = {
    target,
    iterations,
    concurrency,
    text: textPayload,
    method,
    timeoutMs,
    cookieProvided: Boolean(cookieHeader),
    headerKeys: Object.keys(headers),
    timestamp: startedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    metrics
  };

  const outPath = path.resolve(process.cwd(), output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Result:', result);
})();
