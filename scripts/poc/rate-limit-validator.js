/**
 * RateLimitValidator
 * ------------------
 * 负责模拟/评估 Shopify API 限流恢复能力。
 *
 * 使用方式：
 * ```js
 * const validator = new RateLimitValidator(async () => {
 *   // 发起一次请求，如果被限流需要抛出带 { code: 'THROTTLED', retryAfter } 的错误
 * });
 *
 * const report = await validator.run({ iterations: 100, concurrency: 5 });
 * ```
 */

/**
 * @typedef {Object} RateLimitSample
 * @property {boolean} throttled 是否触发限流
 * @property {number} [retryAfterMs] Shopify 返回的重试等待时间（毫秒）
 * @property {number} durationMs 单次请求耗时（毫秒）
 */

export class RateLimitValidator {
  /**
   * @param {() => Promise<RateLimitSample | void>} requestFactory
   *  - 当请求成功时可返回 `{ durationMs }`
   *  - 当触发限流时可抛出 `{ code: 'THROTTLED', retryAfter: number }`
   */
  constructor(requestFactory) {
    if (typeof requestFactory !== 'function') {
      throw new TypeError('RateLimitValidator 需要提供 requestFactory 函数');
    }
    this.requestFactory = requestFactory;
  }

  /**
   * 执行压测。
   * @param {Object} [options]
   * @param {number} [options.iterations=50]      请求总次数
   * @param {number} [options.concurrency=5]      并发度
   * @param {number} [options.recoveryWindowMs=30000] 目标恢复时间阈值
   * @returns {Promise<{
   *   total: number,
   *   throttled: number,
   *   throttleRate: number,
   *   avgRetryAfterMs: number | null,
   *   maxRetryAfterMs: number | null,
   *   avgDurationMs: number,
   *   samples: RateLimitSample[],
   *   meetsRecoveryTarget: boolean
   * }>}
   */
  async run(options = {}) {
    const {
      iterations = 50,
      concurrency = 5,
      recoveryWindowMs = 30000
    } = options;

    const samples = [];
    let active = 0;
    let scheduled = 0;

    const runOne = async () => {
      if (scheduled >= iterations) {
        return;
      }
      const current = scheduled++;
      active++;

      const started = performance.now();
      try {
        const result = await this.#executeRequest();
        const durationMs = result?.durationMs ?? performance.now() - started;
        samples.push({
          throttled: false,
          durationMs
        });
      } catch (error) {
        const durationMs = performance.now() - started;
        if (error && error.code === 'THROTTLED') {
          samples.push({
            throttled: true,
            retryAfterMs: this.#extractRetryAfter(error),
            durationMs
          });
        } else {
          samples.push({
            throttled: false,
            durationMs,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } finally {
        active--;
        if (scheduled < iterations) {
          await runOne();
        }
      }
    };

    const workers = [];
    const workerCount = Math.min(concurrency, iterations);
    for (let idx = 0; idx < workerCount; idx += 1) {
      workers.push(runOne());
    }

    await Promise.all(workers);
    while (active > 0) {
      // 等待所有任务结束
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return this.#summarise(samples, recoveryWindowMs);
  }

  async #executeRequest() {
    const result = await this.requestFactory();
    if (result && typeof result === 'object' && 'durationMs' in result) {
      return result;
    }
    return { durationMs: 0 };
  }

  #extractRetryAfter(error) {
    if (!error) {
      return null;
    }

    if (typeof error.retryAfter === 'number') {
      return error.retryAfter;
    }
    if (typeof error.retryAfterMs === 'number') {
      return error.retryAfterMs;
    }
    if (typeof error.response?.headers?.get === 'function') {
      const header = error.response.headers.get('Retry-After');
      if (header) {
        const parsed = Number(header) * 1000;
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  #summarise(samples, recoveryWindowMs) {
    const total = samples.length;
    const throttledSamples = samples.filter(sample => sample.throttled);

    const throttled = throttledSamples.length;
    const retryAfterValues = throttledSamples
      .map(sample => sample.retryAfterMs)
      .filter(value => typeof value === 'number');

    const avgRetryAfterMs = retryAfterValues.length
      ? Math.round(retryAfterValues.reduce((sum, value) => sum + value, 0) / retryAfterValues.length)
      : null;

    const maxRetryAfterMs = retryAfterValues.length
      ? Math.max(...retryAfterValues)
      : null;

    const avgDurationMs = total
      ? Math.round(samples.reduce((sum, sample) => sum + sample.durationMs, 0) / total)
      : 0;

    const meetsRecoveryTarget =
      maxRetryAfterMs === null ? true : maxRetryAfterMs <= recoveryWindowMs;

    return {
      total,
      throttled,
      throttleRate: total === 0 ? 0 : Number(((throttled / total) * 100).toFixed(2)),
      avgRetryAfterMs,
      maxRetryAfterMs,
      avgDurationMs,
      samples,
      meetsRecoveryTarget
    };
  }
}

export default RateLimitValidator;
