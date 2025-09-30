import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../app/utils/logger.server.js', {
  namedExports: {
    apiLogger: {
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    }
  }
});

const {
  recordApiCall,
  getApiMetrics,
  getApiAlertStates,
  configureApiMonitor,
  resetApiMonitor
} = await import('../../app/services/api-monitor.server.js');

test('recordApiCall aggregates per-operation metrics', () => {
  resetApiMonitor({ resetOptions: true });
  configureApiMonitor({ operations: ['api.translate'], minSample: 1, failureWarn: 1, failureError: 1 });

  const now = Date.now();

  recordApiCall({
    operation: 'api.translate',
    success: true,
    duration: 120,
    statusCode: 200,
    method: 'POST',
    timestamp: now
  });

  recordApiCall({
    operation: 'api.translate',
    success: false,
    duration: 480,
    statusCode: 500,
    method: 'POST',
    timestamp: now + 1000
  });

  const metrics = getApiMetrics({ operation: 'api.translate' });
  assert.ok(metrics);
  assert.equal(metrics.totals.total, 2);
  assert.equal(metrics.totals.success, 1);
  assert.equal(metrics.totals.failure, 1);
  assert.equal(metrics.totals.failureRate, 0.5);

  const window1m = metrics.windows['1m'];
  assert.equal(window1m.sampleSize, 2);
  assert.equal(window1m.statusCounts['200'], 1);
  assert.equal(window1m.statusCounts['500'], 1);
  assert.equal(window1m.p95Duration, 480);
});

test('alerts escalate when failure rate and latency breach thresholds', () => {
  resetApiMonitor({ resetOptions: true });
  configureApiMonitor({
    operations: ['api.translate'],
    minSample: 5,
    failureWarn: 0.2,
    failureError: 0.4,
    p95WarnRatio: 2,
    p95ErrorRatio: 5
  });

  const now = Date.now();

  // 生成 100 条低延迟成功请求，位于 6 分钟前，纳入 15 分钟窗口但排除 5 分钟窗口
  for (let i = 0; i < 100; i += 1) {
    recordApiCall({
      operation: 'api.translate',
      success: true,
      duration: 100,
      statusCode: 200,
      method: 'POST',
      timestamp: now - (6 * 60 * 1000) - i
    });
  }

  // 最近 5 分钟内的请求，制造高失败率与高延迟
  for (let i = 0; i < 5; i += 1) {
    recordApiCall({
      operation: 'api.translate',
      success: i === 0,
      duration: 2000,
      statusCode: i === 0 ? 200 : 503,
      method: 'POST',
      timestamp: now - (i * 1000)
    });
  }

  const alerts = getApiAlertStates().find((item) => item.operation === 'api.translate');
  assert.ok(alerts);
  assert.equal(alerts.alerts.failure, 'error');
  assert.equal(alerts.alerts.latency, 'error');
});
