import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInMemoryCache, createRequestDeduplicator } from '../../app/services/translation/api-client.server.js';

describe('createInMemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires entries after ttl and tracks hit/miss stats', () => {
    const cache = createInMemoryCache({ ttlSeconds: 1, cleanupIntervalSeconds: 0 });
    cache.set('foo', 'bar');

    expect(cache.get('foo')).toBe('bar');

    vi.advanceTimersByTime(1100);
    expect(cache.get('foo')).toBeNull();

    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeLessThan(1);
  });

  it('evicts oldest entries when exceeding maxEntries', () => {
    const cache = createInMemoryCache({ ttlSeconds: 100, cleanupIntervalSeconds: 0, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('createInMemoryCache', () => {
  it('stores and expires entries', async () => {
    const cache = createInMemoryCache({ ttlSeconds: 1, cleanupIntervalSeconds: 0, maxEntries: 2 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    await new Promise(r => setTimeout(r, 1100));
    expect(cache.get('a')).toBeNull();
  });

  it('evicts oldest when exceeding maxEntries', () => {
    const cache = createInMemoryCache({ maxEntries: 2, cleanupIntervalSeconds: 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // should evict 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('createRequestDeduplicator', () => {
  it('deduplicates concurrent calls', async () => {
    const dedupe = createRequestDeduplicator({ maxInFlight: 2 });
    let calls = 0;
    const factory = async () => {
      calls += 1;
      await new Promise(r => setTimeout(r, 10));
      return 'ok';
    };
    const results = await Promise.all([
      dedupe.run('k', factory),
      dedupe.run('k', factory),
      dedupe.run('k', factory)
    ]);
    expect(results).toEqual(['ok', 'ok', 'ok']);
    expect(calls).toBe(1);
  });
});

describe('createRequestDeduplicator', () => {
  it('reuses the same promise for duplicate keys', async () => {
    const dedupe = createRequestDeduplicator();
    const factory = vi.fn(async () => 'ok');

    const [result1, result2] = await Promise.all([
      dedupe.run('job', factory),
      dedupe.run('job', factory)
    ]);

    expect(result1).toBe('ok');
    expect(result2).toBe('ok');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('limits max in-flight requests by evicting oldest entries', async () => {
    const dedupe = createRequestDeduplicator({ maxInFlight: 2 });
    const resolvers = [];
    const promises = [];

    const createPending = (label) => () => new Promise((resolve) => {
      resolvers.push(() => resolve(label));
    });

    promises.push(dedupe.run('k1', createPending('k1')));
    promises.push(dedupe.run('k2', createPending('k2')));
    promises.push(dedupe.run('k3', createPending('k3')));

    // 等待 factory 异步执行并收集到 resolver
    await Promise.resolve();

    expect(dedupe.size()).toBeLessThanOrEqual(2);

    resolvers.forEach((resolve) => resolve());
    await Promise.all(promises);
  });
});
