export const COVERAGE_CONFIG = {
  defaultDenominatorPolicy: 'effective',
  qualityThreshold: 0.7,
  qualityThresholdRange: {
    min: 0.5,
    max: 0.9
  },
  includesSynced: false,
  enableSyncedView: true,
  enableNormalizedComparison: false,
  cacheTTL: {
    small: 60,
    medium: 300,
    large: 900
  },
  eventBatchIntervalMs: 5 * 60 * 1000,
  maxResourceKeysPerPage: 100,
  alertThresholds: {
    staleRatio: 0.1,
    coverageDayOverDayDrop: 0.05,
    calcP95Ms: 500
  },
  nightlyJob: {
    cron: '0 3 * * *',
    sampleRatio: 0.1,
    maxDiscrepancy: 0.01,
    maxDurationMs: 5 * 60 * 1000,
    tasks: [
      'sample-digest-audit',
      'compare-cache-vs-realtime',
      'cleanup-stale-events',
      'generate-coverage-daily-report'
    ]
  },
  skipReasonsExcludedFromDenominator: new Set(['USER_EXCLUDED', 'TRANSLATION_LOCKED'])
};

export default COVERAGE_CONFIG;
