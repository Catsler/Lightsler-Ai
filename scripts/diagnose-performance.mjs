#!/usr/bin/env node

// Performance snapshot script for Lightsler-ai Admin integration.
// Connects to a running Chrome DevTools endpoint and prints key metrics,
// optionally persisting them as a baseline for future comparisons.

import fs from 'fs';
import path from 'path';
import process from 'process';
import url from 'url';
import CDP from 'chrome-remote-interface';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9222;
const BASELINE_PATH = path.resolve(__dirname, '../docs/performance/performance-baseline.json');

async function fetchJson(endpoint) {
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function parseArgs(argv) {
  const result = {
    wsEndpoint: process.env.CHROME_WS_ENDPOINT || null,
    pageUrlPattern: process.env.CHROME_PAGE_URL || null,
    baseline: false,
    compare: false,
    output: 'text',
    reload: false,
    waitAfterReload: 3000,
    clearCache: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline') {
      result.baseline = true;
      continue;
    }

    if (arg === '--compare') {
      result.compare = true;
      continue;
    }

    if (arg.startsWith('--wsEndpoint=')) {
      result.wsEndpoint = arg.split('=')[1];
    } else if (arg.startsWith('--pageUrl=')) {
      result.pageUrlPattern = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1];
    } else if (arg === '--reload') {
      result.reload = true;
      continue;
    } else if (arg.startsWith('--wait=')) {
      result.waitAfterReload = Number(arg.split('=')[1]);
    } else if (arg === '--clear-cache') {
      result.clearCache = true;
      continue;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.warn(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function printHelp() {
  console.log(`Usage: node scripts/diagnose-performance.mjs [options]\n\n` +
    `Options:\n` +
    `  --wsEndpoint=WS_URL     Connect to an existing DevTools WebSocket (default auto-detect)\n` +
    `  --pageUrl=PATTERN       Select page target whose URL includes PATTERN\n` +
    `  --baseline              Persist current snapshot as baseline JSON\n` +
    `  --compare               Compare snapshot against stored baseline\n` +
    `  --reload                Force hard reload before collecting metrics (cold start)\n` +
    `  --wait=MS               Wait time after reload in ms (default 3000)\n` +
    `  --clear-cache           Clear browser cache/cookies when reloading (requires --reload)\n` +
    `  --output=text|json      Output format (default text)\n` +
    `  --help                  Show this message\n`);
}

async function resolveEndpoints(options) {
  if (!options.wsEndpoint) {
    const version = await fetchJson(`http://${DEFAULT_HOST}:${DEFAULT_PORT}/json/version`);
    options.wsEndpoint = version.webSocketDebuggerUrl;
  }

  const pages = await fetchJson(`http://${DEFAULT_HOST}:${DEFAULT_PORT}/json`);
  let pageTarget = pages.find((p) => p.type === 'page');

  if (options.pageUrlPattern) {
    pageTarget = pages.find((p) => p.type === 'page' && p.url.includes(options.pageUrlPattern)) || pageTarget;
  }

  if (!pageTarget) {
    throw new Error('No page targets available on the debugging endpoint.');
  }

  return { browserWs: options.wsEndpoint, pageWs: pageTarget.webSocketDebuggerUrl, pageUrl: pageTarget.url };
}

async function collectMetrics(pageWs, { reload, waitAfterReload, clearCache }) {
  const client = await CDP({ target: pageWs });
  const { Performance, Runtime, Network, Page } = client;

  try {
    await Promise.allSettled([
      Performance.enable(),
      Network.enable({ maxTotalBufferSize: 0, maxResourceBufferSize: 0, maxPostDataSize: 0 }),
      Page.enable()
    ]);

    if (reload || clearCache) {
      if (clearCache) {
        await Promise.allSettled([
          Network.clearBrowserCache(),
          Network.clearBrowserCookies(),
        ]);
      }

      const loadPromise = new Promise((resolve) => {
        Page.loadEventFired(() => {
          setTimeout(resolve, Math.max(waitAfterReload, 0));
        });
      });

      await Page.reload({ ignoreCache: true });
      await loadPromise;
    }

    const perfMetrics = await Performance.getMetrics();
    const metricMap = Object.fromEntries(perfMetrics.metrics.map((m) => [m.name, m.value]));

    const { result: navResult } = await Runtime.evaluate({
      expression: `(() => {
        const navEntry = performance.getEntriesByType('navigation')[0];
        const paints = performance.getEntriesByType('paint');
        const fcp = paints.find(p => p.name === 'first-contentful-paint');
        const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
        const lcp = lcpEntries.length ? (lcpEntries[lcpEntries.length - 1].renderTime || lcpEntries[lcpEntries.length - 1].loadTime) : null;
        const cls = performance.getEntriesByType('layout-shift')
          .filter(entry => !entry.hadRecentInput)
          .reduce((sum, entry) => sum + entry.value, 0);
        const longTasks = performance.getEntriesByType('longtask') || [];
        const totalBlockingTime = longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);
        const lastLongTaskEnd = longTasks.reduce((max, task) => Math.max(max, task.startTime + task.duration), 0);
        const domInteractive = navEntry ? navEntry.domInteractive : (performance.timing.domInteractive - performance.timing.navigationStart);
        const timeToInteractive = Math.max(domInteractive, lastLongTaskEnd || 0);
        const timeToFirstByte = navEntry ? navEntry.responseStart : (performance.timing.responseStart - performance.timing.navigationStart);
        const resources = performance.getEntriesByType('resource');
        const summary = resources.reduce((acc, resource) => {
          const type = resource.initiatorType || 'other';
          acc.count += 1;
          acc.totalDuration += resource.duration;
          acc.byType[type] = acc.byType[type] || { count: 0, duration: 0 };
          acc.byType[type].count += 1;
          acc.byType[type].duration += resource.duration;
          return acc;
        }, { count: 0, totalDuration: 0, byType: {} });

        const topResources = resources
          .slice()
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 10)
          .map(r => ({ name: r.name, type: r.initiatorType || 'other', duration: Number(r.duration.toFixed(2)) }));

        return {
          url: location.href,
          navigationStart: navEntry ? navEntry.startTime : performance.timing.navigationStart,
          domContentLoaded: navEntry ? navEntry.domContentLoadedEventEnd : performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
          loadEventEnd: navEntry ? navEntry.loadEventEnd : performance.timing.loadEventEnd - performance.timing.navigationStart,
          firstContentfulPaint: fcp ? fcp.startTime : null,
          largestContentfulPaint: lcp,
          cumulativeLayoutShift: cls,
          timeToFirstByte,
          domInteractive,
          timeToInteractive,
          totalBlockingTime,
          longTaskCount: longTasks.length,
          maxLongTaskDuration: longTasks.reduce((max, task) => Math.max(max, task.duration), 0),
          resourceSummary: summary,
          topResources
        };
      })()`,
      returnByValue: true
    });

    const { result: domStats } = await Runtime.evaluate({
      expression: `(() => ({
        nodes: document.getElementsByTagName('*').length,
        imagesWithoutAlt: Array.from(document.images).filter(img => !(img.getAttribute('alt') || '').trim()).length,
        eventListeners: (() => {
          if (!window.getEventListeners) return null;
          const aggregate = {};
          for (const el of document.querySelectorAll('*')) {
            const listeners = getEventListeners(el);
            Object.keys(listeners || {}).forEach(type => {
              aggregate[type] = (aggregate[type] || 0) + listeners[type].length;
            });
          }
          return aggregate;
        })()
      }))()`,
      returnByValue: true
    });

    return {
      metrics: metricMap,
      navigation: navResult.value,
      dom: domStats.value
    };
  } finally {
    await client.close();
  }
}

function formatNumber(value, fraction = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return Number(value).toFixed(fraction);
}

function toTextReport(snapshot, baseline) {
  const lines = [];
  lines.push('=== Performance Snapshot ===');
  lines.push(`URL: ${snapshot.navigation.url || 'unknown'}`);
  lines.push('');
  lines.push('- Core Timings (ms)');
  lines.push(`  • DOMContentLoaded: ${formatNumber(snapshot.navigation.domContentLoaded)}`);
  lines.push(`  • LoadEventEnd:     ${formatNumber(snapshot.navigation.loadEventEnd)}`);
  lines.push(`  • FirstContentfulPaint: ${formatNumber(snapshot.navigation.firstContentfulPaint)}`);
  lines.push(`  • LargestContentfulPaint: ${formatNumber(snapshot.navigation.largestContentfulPaint)}`);
  lines.push(`  • CumulativeLayoutShift: ${formatNumber(snapshot.navigation.cumulativeLayoutShift, 3)}`);
  lines.push('');
  lines.push('- Interactivity & Server Response (ms)');
  lines.push(`  • TimeToFirstByte: ${formatNumber(snapshot.navigation.timeToFirstByte)}`);
  lines.push(`  • DOMInteractive:  ${formatNumber(snapshot.navigation.domInteractive)}`);
  lines.push(`  • TimeToInteractive: ${formatNumber(snapshot.navigation.timeToInteractive)}`);
  lines.push(`  • TotalBlockingTime: ${formatNumber(snapshot.navigation.totalBlockingTime)}`);
  lines.push(`  • LongTasks: count=${snapshot.navigation.longTaskCount}, max=${formatNumber(snapshot.navigation.maxLongTaskDuration)}`);
  lines.push('');
  lines.push('- DOM & JS Footprint');
  lines.push(`  • Document nodes: ${snapshot.dom.nodes}`);
  if (snapshot.dom.imagesWithoutAlt !== null) {
    lines.push(`  • Images missing alt: ${snapshot.dom.imagesWithoutAlt}`);
  }
  lines.push(`  • JS Heap Used (MB): ${formatNumber(snapshot.metrics.JSHeapUsedSize / (1024 * 1024))}`);
  lines.push('');
  lines.push('- Resource Summary');
  lines.push(`  • Total requests captured: ${snapshot.navigation.resourceSummary.count}`);
  lines.push(`  • Total duration (ms): ${formatNumber(snapshot.navigation.resourceSummary.totalDuration)}`);
  Object.entries(snapshot.navigation.resourceSummary.byType).forEach(([type, info]) => {
    lines.push(`    - ${type}: count=${info.count}, duration=${formatNumber(info.duration)}`);
  });
  lines.push('');
  lines.push('- Top 10 Longest Resources');
  snapshot.navigation.topResources.forEach((res) => {
    lines.push(`    - ${res.type.padEnd(8)} ${formatNumber(res.duration)} ms :: ${res.name}`);
  });

  if (baseline) {
    lines.push('');
    lines.push('=== Baseline Comparison ===');
    const delta = (label, current, base) => {
      if (current === null || base === null || base === undefined) return 'n/a';
      const diff = current - base;
      const sign = diff > 0 ? '+' : '';
      return `${sign}${diff.toFixed(2)} ms`;
    };
    lines.push(`  • FCP Δ: ${delta(snapshot.navigation.firstContentfulPaint, baseline.navigation.firstContentfulPaint)}`);
    lines.push(`  • LCP Δ: ${delta(snapshot.navigation.largestContentfulPaint, baseline.navigation.largestContentfulPaint)}`);
    lines.push(`  • DCL Δ: ${delta(snapshot.navigation.domContentLoaded, baseline.navigation.domContentLoaded)}`);
    lines.push(`  • Requests Δ: ${(snapshot.navigation.resourceSummary.count - baseline.navigation.resourceSummary.count)}`);
  }

  return lines.join('\n');
}

function persistBaseline(snapshot) {
  const dir = path.dirname(BASELINE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ capturedAt: new Date().toISOString(), ...snapshot }, null, 2));
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to parse baseline file: ${error.message}`);
    return null;
  }
}

(async function main() {
  const options = parseArgs(process.argv);
  let endpoints;

  try {
    endpoints = await resolveEndpoints(options);
  } catch (error) {
    console.error(`Failed to resolve debugging targets: ${error.message}`);
    process.exit(1);
  }

  let snapshot;
  try {
    snapshot = await collectMetrics(endpoints.pageWs, {
      reload: options.reload || options.baseline,
      waitAfterReload: options.waitAfterReload,
      clearCache: options.clearCache,
    });
  } catch (error) {
    console.error(`Failed to collect metrics: ${error.message}`);
    process.exit(1);
  }

  if (options.baseline) {
    persistBaseline(snapshot);
    console.log(`Baseline written to ${BASELINE_PATH}`);
  }

  const baseline = options.compare ? readBaseline() : null;

  if (options.output === 'json') {
    const output = { capturedAt: new Date().toISOString(), ...snapshot };
    if (baseline) {
      output.baselineCapturedAt = baseline.capturedAt || null;
    }
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(toTextReport(snapshot, baseline));
  }
})();
