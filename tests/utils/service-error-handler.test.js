import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const captureErrorMock = vi.fn(async () => {});
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

vi.mock('../../app/utils/error-handler.server.js', () => ({
  captureError: captureErrorMock
}));

vi.mock('../../app/utils/logger.server.js', () => ({
  logger: loggerMock,
  info: loggerMock.info,
  warn: loggerMock.warn,
  error: loggerMock.error,
  debug: loggerMock.debug
}));

const { createServiceErrorHandler } = await import('../../app/utils/service-error-handler.server.js');

beforeEach(() => {
  captureErrorMock.mockClear();
  Object.values(loggerMock).forEach((fn) => fn.mockClear?.());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createServiceErrorHandler', () => {
  it('passes through successful execution', async () => {
    const handle = createServiceErrorHandler('TEST_SERVICE');
    const wrapped = handle(async (value) => `ok-${value}`);

    const result = await wrapped('demo');

    expect(result).toBe('ok-demo');
    expect(captureErrorMock).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('captures and rethrows errors by default', async () => {
    const handle = createServiceErrorHandler('TEST_SERVICE');
    const failure = new Error('boom');
    const wrapped = handle(async () => {
      throw failure;
    });

    await expect(wrapped()).rejects.toThrow('boom');

    expect(captureErrorMock).toHaveBeenCalledWith(failure, expect.objectContaining({
      service: 'TEST_SERVICE'
    }));
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('returns fallback value when throwErrors is false', async () => {
    const handle = createServiceErrorHandler('TEST_SERVICE', {
      throwErrors: false,
      getFallbackValue: () => 'fallback'
    });

    const wrapped = handle(async () => {
      throw new Error('should not escape');
    });

    const result = await wrapped();

    expect(result).toBe('fallback');
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('TEST_SERVICE'), expect.any(Object));
  });

  it('notifies alert manager when severity is high', async () => {
    const alertManager = { notify: vi.fn(async () => {}) };
    const handle = createServiceErrorHandler('TEST_SERVICE', {
      alertManager,
      throwErrors: false
    });

    const error = new Error('critical failure');
    error.severity = 'HIGH';

    const wrapped = handle(async () => {
      throw error;
    });

    await wrapped();

    expect(alertManager.notify).toHaveBeenCalledWith(expect.objectContaining({
      service: 'TEST_SERVICE',
      message: 'critical failure'
    }));
  });

  it('preserves original this binding', async () => {
    const handle = createServiceErrorHandler('TEST_SERVICE');
    const obj = {
      value: 42,
      method: handle(async function () {
        return this.value;
      })
    };

    await expect(obj.method()).resolves.toBe(42);
  });
});
