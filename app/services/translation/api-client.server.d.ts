export interface TranslationRequest {
  text: string;
  targetLang: string;
  systemPrompt: string;
  strategy?: string;
  extras?: Record<string, any>;
  context?: Record<string, any>;
}

export interface TranslationResult {
  success: boolean;
  text: string;
  error?: string;
  isOriginal?: boolean;
  language?: string;
  tokenLimit?: number;
  meta?: Record<string, any>;
}

export interface TranslationAPIClientOptions {
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  useExponentialBackoff?: boolean;
  cache?: ReturnType<typeof createInMemoryCache> | null;
  cacheTTL?: number;
  deduplicate?: ReturnType<typeof createRequestDeduplicator> | null;
  fallbacks?: Array<{
    name: string;
    prepare: (ctx: any) => Partial<TranslationRequest>;
  }>;
}

export function createInMemoryCache(options?: {
  ttlSeconds?: number;
  cleanupIntervalSeconds?: number;
  maxEntries?: number;
}): {
  get: (key: string) => any;
  set: (key: string, value: any, ttl?: number) => void;
  delete: (key: string) => boolean;
  clear: () => void;
  cleanup: () => void;
  stats: () => { size: number; hits: number; misses: number; hitRate: number };
};

export function createRequestDeduplicator(options?: { maxInFlight?: number }): {
  run: (key: string, factory: () => Promise<any>) => Promise<any>;
  size: number;
};

export function createTranslationAPIClient(
  options?: TranslationAPIClientOptions
): {
  execute: (request: TranslationRequest) => Promise<TranslationResult>;
};
