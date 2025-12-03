import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = {
  apiMetrics: {
    createMany: vi.fn(),
    create: vi.fn()
  },
  serviceLock: {
    deleteMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

const mockFs = {
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve())
};

const mockGetApiMetrics = vi.fn();

vi.mock('../../app/db.server.js', () => ({ prisma: mockPrisma }));
vi.mock('../../app/utils/logger.server.js', () => ({ logger: mockLogger }));
vi.mock('../../app/services/api-monitor.server.js', () => ({ getApiMetrics: mockGetApiMetrics }));
vi.mock('node:fs/promises', () => ({ default: mockFs, ...mockFs }));

const metricsModule = await import('../../app/services/metrics-persistence.server.js');
const { MetricsPersistence, collectMetric } = metricsModule;

describe('MetricsPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPrisma.serviceLock.create.mockResolvedValue({});
    mockPrisma.serviceLock.update.mockResolvedValue({});
    mockPrisma.serviceLock.delete.mockResolvedValue({});
    mockPrisma.serviceLock.deleteMany.mockResolvedValue({});
    mockPrisma.serviceLock.findUnique.mockResolvedValue(null);
    mockPrisma.apiMetrics.createMany.mockResolvedValue({});
    mockPrisma.apiMetrics.create.mockResolvedValue({});
    mockGetApiMetrics.mockReturnValue([
      {
        operation: 'api.test',
        totals: { total: 2, success: 1, failure: 1, successRate: 0.5, failureRate: 0.5 },
        windows: { '5m': { p95Duration: 123 } }
      }
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires lock and writes metrics on start', async () => {
    const service = new MetricsPersistence({ intervalMs: 1000 });
    const started = await service.start();

    expect(started).toBe(true);
    expect(mockPrisma.serviceLock.create).toHaveBeenCalled();
    expect(mockPrisma.apiMetrics.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true
    });

    await service.stop();
    expect(mockPrisma.serviceLock.delete).toHaveBeenCalled();
  });

  it('skips start when lock held by another instance', async () => {
    mockPrisma.serviceLock.create.mockRejectedValueOnce({ code: 'P2002' });
    mockPrisma.serviceLock.findUnique.mockResolvedValue({ service: 'metrics-persistence', instanceId: 'other' });

    const service = new MetricsPersistence();
    const started = await service.start();

    expect(started).toBe(false);
    expect(mockPrisma.apiMetrics.createMany).not.toHaveBeenCalled();
  });

  it('flushes pending records on demand', async () => {
    const service = new MetricsPersistence();
    service.pendingRecords = [
      { operation: 'api.test', timestamp: new Date(), success: 1, failure: 0, successRate: 1, failureRate: 0, p95: 10 }
    ];

    const result = await service.flush();
    expect(result.success).toBe(true);
    expect(mockPrisma.apiMetrics.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true
    });
    expect(service.pendingRecords.length).toBe(0);
  });

  it('dumps to file after exceeding retries', async () => {
    const service = new MetricsPersistence({ maxRetries: 1 });
    mockPrisma.apiMetrics.createMany.mockRejectedValueOnce(new Error('db down'));

    await service.persistSafe();

    expect(mockFs.mkdir).toHaveBeenCalled();
    expect(mockFs.writeFile).toHaveBeenCalled();
  });

  it('collectMetric写入metadata样本', async () => {
    const metadata = { durationMs: 120, fieldCount: 45 };
    const result = await collectMetric('theme-translation-batch', metadata, { success: true });

    expect(result.success).toBe(true);
    expect(mockPrisma.apiMetrics.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'theme-translation-batch',
        metadata
      })
    });
  });

  it('collectMetric失败时返回错误', async () => {
    mockPrisma.apiMetrics.create.mockRejectedValueOnce(new Error('write fail'));
    const result = await collectMetric('theme-translation-batch', { durationMs: 10 }, { success: false });

    expect(result.success).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
