import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../app/utils/logger.server.js', () => ({
  apiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

const {
  recordApiCall,
  getApiMetrics,
  getApiAlertStates,
  configureApiMonitor,
  resetApiMonitor
} = await import('../../app/services/api-monitor.server.js');

describe('api-monitor', () => {
  beforeEach(() => {
    resetApiMonitor({ resetOptions: true });
  });

  it('aggregates metrics per operation', () => {
    configureApiMonitor({ operations: ['api.translate'], minSample: 1, failureWarn: 1, failureError: 1 });

    const now = Date.now();
    recordApiCall({ operation: 'api.translate', success: true, duration: 120, statusCode: 200, method: 'POST', timestamp: now });
    recordApiCall({ operation: 'api.translate', success: false, duration: 480, statusCode: 500, method: 'POST', timestamp: now + 1000 });

    const metrics = getApiMetrics({ operation: 'api.translate' });
    expect(metrics).toBeTruthy();
    expect(metrics?.totals.total).toBe(2);
    expect(metrics?.totals.success).toBe(1);
    expect(metrics?.totals.failure).toBe(1);
    expect(metrics?.totals.failureRate).toBe(0.5);

    const window1m = metrics?.windows['1m'];
    expect(window1m?.sampleSize).toBe(2);
    expect(window1m?.statusCounts['200']).toBe(1);
    expect(window1m?.statusCounts['500']).toBe(1);
    expect(window1m?.p95Duration).toBe(480);
  });

  it('raises alerts when failure rate and latency exceed thresholds', () => {
    configureApiMonitor({
      operations: ['api.translate'],
      minSample: 5,
      failureWarn: 0.1,
      failureError: 0.2,
      p95WarnRatio: 1.5,
      p95ErrorRatio: 2
    });

    const now = Date.now();
    const samples = [
      { success: true, duration: 100, statusCode: 200 },
      { success: false, duration: 1200, statusCode: 500 },
      { success: false, duration: 1500, statusCode: 500 },
      { success: true, duration: 100, statusCode: 200 },
      { success: false, duration: 2000, statusCode: 500 }
    ];

    samples.forEach((sample, index) => {
      recordApiCall({
        operation: 'api.translate',
        method: 'POST',
        timestamp: now + index * 1000,
        ...sample
      });
    });

    const translateAlert = getApiAlertStates().find((item) => item.operation === 'api.translate');
    expect(translateAlert).toBeTruthy();
    expect(translateAlert?.alerts.failure).toBe('error');
  });
});
