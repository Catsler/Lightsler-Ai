import { describe, it, expect, beforeEach, vi } from 'vitest';

const memoryLogs: any[] = [];
const persistentLogs: any[] = [];
let mockEvaluation: any = { isValid: true, events: [], records: [] };

vi.mock('../../app/utils/logger.server.js', () => {
  const noop = () => {};
  const loggers = {
    info: vi.fn(noop),
    warn: vi.fn(noop),
    error: vi.fn(noop),
    debug: vi.fn(noop)
  };

  return {
    logger: loggers,
    billingLogger: loggers,
    validationLogger: loggers,
    apiLogger: loggers,
    logShortTextTranslation: vi.fn(),
    logTranslationQuality: vi.fn(),
    logEnglishRemnants: vi.fn(),
    logTranslationStart: vi.fn(),
    logTranslationSuccess: vi.fn(),
    logTranslationFailure: vi.fn(),
    createTranslationLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logTranslationSuccess: vi.fn(),
      logTranslationFailure: vi.fn()
    }),
    memoryLogReader: {
      getRecent: vi.fn(({ limit = memoryLogs.length }) => memoryLogs.slice(0, limit))
    },
    persistentLogReader: vi.fn(async () => persistentLogs.slice()),
    forceFlushPersistentLogs: vi.fn(),
    persistenceConfig: { enabled: false }
  };
});

const collectedErrors: any[] = [];

vi.mock('../../app/services/error-collector.server.js', () => ({
  collectError: vi.fn(async (entry) => {
    collectedErrors.push(entry);
  }),
  ERROR_TYPES: {
    VALIDATION: 'VALIDATION'
  }
}));

vi.mock('../../app/services/translation/validators.server.js', () => ({
  evaluateTranslationQuality: vi.fn(() => mockEvaluation),
  evaluateCompleteness: vi.fn(() => ({ isComplete: true, events: [] }))
}));

vi.mock('../../app/services/theme-translation.server.js', () => ({
  translateThemeResource: vi.fn(async () => ({ skipped: false })),
  translateThemeJsonData: vi.fn(async () => ({}))
}));

const { validateTranslation, getTranslationStats } = await import('../../app/services/translation/core.server.js');

describe('translation core helpers', () => {
  beforeEach(() => {
    mockEvaluation = { isValid: true, events: [], records: [] };
    collectedErrors.length = 0;
    memoryLogs.length = 0;
    persistentLogs.length = 0;
  });

  describe('validateTranslation', () => {
    it('returns true when evaluation passes without records', async () => {
      mockEvaluation = { isValid: true, events: [], records: [] };

      const result = await validateTranslation('Hello', '你好', 'zh-CN');

      expect(result).toBe(true);
      expect(collectedErrors).toHaveLength(0);
    });

    it('records validation errors when evaluation fails', async () => {
      mockEvaluation = {
        isValid: false,
        events: [],
        records: [
          {
            category: 'QUALITY',
            code: 'TOO_SHORT',
            message: 'translation too short',
            severity: 2,
            retryable: false,
            context: { originalLength: 20 }
          }
        ]
      };

      const result = await validateTranslation('A long sentence', '短', 'zh-CN');

      expect(result).toBe(false);
      expect(collectedErrors).toHaveLength(1);
      expect(collectedErrors[0]).toMatchObject({
        errorCategory: 'QUALITY',
        errorCode: 'TOO_SHORT',
        operation: 'validateTranslation'
      });
    });
  });

  describe('getTranslationStats', () => {
    it('aggregates recent logs from memory store', () => {
      const now = Date.now();
      memoryLogs.push(
        {
          id: '1',
          timestamp: new Date(now - 1000).toISOString(),
          level: 'info',
          category: 'TRANSLATION',
          message: '翻译完成',
          data: { success: true, durationMs: 120 }
        },
        {
          id: '2',
          timestamp: new Date(now).toISOString(),
          level: 'error',
          category: 'TRANSLATION',
          message: '翻译失败',
          data: { error: 'boom' }
        }
      );

      const stats = getTranslationStats();

      expect(stats.totalTranslations).toBe(1);
      expect(stats.successfulTranslations).toBe(1);
      expect(stats.failedTranslations).toBe(1);
      expect(stats.averageDuration).toBe(120);
      expect(stats.recentErrors).toHaveLength(1);
    });
  });
});
