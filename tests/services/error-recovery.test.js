import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = {
  errorLog: {
    findMany: vi.fn(),
    update: vi.fn()
  }
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

const mockTracker = {
  start: vi.fn(),
  end: vi.fn(() => 5)
};

vi.mock('../../app/db.server.js', () => ({ prisma: mockPrisma }));
vi.mock('../../app/utils/logger.server.js', () => ({ logger: mockLogger }));
vi.mock('../../app/services/performance-monitor.server.js', () => ({
  performanceMonitor: {
    createTracker: vi.fn(() => mockTracker)
  }
}));
vi.mock('../../app/services/error-collector.server.js', () => ({
  collectError: vi.fn()
}));

const { ErrorRecoveryManager, RECOVERY_STRATEGIES } = await import('../../app/services/error-recovery.server.js');

describe('ErrorRecoveryManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails validation when strategy set becomes empty', () => {
    const manager = new ErrorRecoveryManager({ strategies: [RECOVERY_STRATEGIES.RETRY] });
    manager.enabledStrategies.clear();
    expect(manager.validateConfig()).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledWith('错误恢复服务未启用任何策略');
  });

  it('start returns false when disabled', () => {
    const manager = new ErrorRecoveryManager({ enabled: false });
    expect(manager.start()).toBe(false);
    expect(manager.isRunning).toBe(false);
  });

  it('start triggers periodic checks when enabled', async () => {
    vi.useFakeTimers();
    const manager = new ErrorRecoveryManager({
      strategies: [RECOVERY_STRATEGIES.RETRY],
      checkInterval: 100,
      enabled: true
    });
    const checkSpy = vi.spyOn(manager, 'checkAndRecover').mockResolvedValue();

    const started = manager.start();
    expect(started).toBe(true);
    expect(checkSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(checkSpy).toHaveBeenCalledTimes(2);

    manager.stop();
    expect(manager.isRunning).toBe(false);
  });

  it('skips attemptRecovery when strategy not enabled', async () => {
    const manager = new ErrorRecoveryManager({ strategies: [RECOVERY_STRATEGIES.RETRY] });
    const execSpy = vi.spyOn(manager, 'executeRecoveryStrategy');

    await manager.attemptRecovery({ id: 'err-1', errorCode: 'API_LIMIT' });

    expect(execSpy).not.toHaveBeenCalled();
  });

  it('marks error recovered when strategy succeeds', async () => {
    const manager = new ErrorRecoveryManager({
      strategies: [RECOVERY_STRATEGIES.EXPONENTIAL_BACKOFF]
    });
    const execSpy = vi.spyOn(manager, 'executeRecoveryStrategy').mockResolvedValue({
      success: true,
      strategy: RECOVERY_STRATEGIES.EXPONENTIAL_BACKOFF,
      attempts: 1
    });
    const markSpy = vi.spyOn(manager, 'markErrorRecovered').mockResolvedValue();

    await manager.attemptRecovery({ id: 'err-success', errorCode: 'API_LIMIT' });

    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'err-success' }),
      expect.objectContaining({ success: true })
    );
  });

  it('handles recovery failure path', async () => {
    const manager = new ErrorRecoveryManager({
      strategies: [RECOVERY_STRATEGIES.EXPONENTIAL_BACKOFF]
    });
    vi.spyOn(manager, 'executeRecoveryStrategy').mockResolvedValue({
      success: false,
      reason: 'testing'
    });
    const failureSpy = vi.spyOn(manager, 'handleRecoveryFailure').mockResolvedValue();

    await manager.attemptRecovery({ id: 'err-failure', errorCode: 'API_LIMIT' });

    expect(failureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'err-failure' }),
      expect.objectContaining({ reason: 'testing' })
    );
  });

  it('aggregates recovery stats', () => {
    const manager = new ErrorRecoveryManager({
      strategies: [RECOVERY_STRATEGIES.RETRY]
    });
    manager.recoveryHistory = [
      { strategy: 'A', result: true, duration: 10, timestamp: new Date() },
      { strategy: 'A', result: false, duration: 20, timestamp: new Date() },
      { strategy: 'B', result: true, duration: 30, timestamp: new Date() }
    ];

    const stats = manager.getRecoveryStats();
    expect(stats.total).toBe(3);
    expect(stats.successful).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.byStrategy.A.success).toBe(1);
    expect(stats.byStrategy.A.failed).toBe(1);
    expect(stats.averageDuration).toBeGreaterThan(0);
  });
});
