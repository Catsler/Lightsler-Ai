/**
 * BrandProtectionPoC
 * ------------------
 * 用于评估品牌词保护策略的准确率。
 *
 * 输入：测试用例数组，每个用例包含原始文本、期望是否保护以及上下文信息。
 * 可结合真实规则引擎或简单的函数进行验证。
 */

/**
 * @typedef {Object} BrandProtectionTestCase
 * @property {string} input                待判断的文本
 * @property {boolean} expected            期望结果：true=应保护，false=应翻译
 * @property {Object} [context]
 * @property {string} [context.resourceType]
 * @property {string} [context.fieldPath]
 * @property {string} [context.fieldType]
 */

export class BrandProtectionPoC {
  /**
   * @param {(text: string, context?: Record<string, unknown>) => Promise<boolean> | boolean} shouldProtect
   * @param {Object} [options]
   * @param {boolean} [options.trace=false] 是否记录详细日志
   */
  constructor(shouldProtect, options = {}) {
    if (typeof shouldProtect !== 'function') {
      throw new TypeError('BrandProtectionPoC 需要提供 shouldProtect 函数');
    }
    this.shouldProtect = shouldProtect;
    this.options = {
      trace: Boolean(options.trace)
    };
  }

  /**
   * 执行评估。
   * @param {BrandProtectionTestCase[]} testCases
   * @returns {Promise<{
   *   total: number,
   *   correct: number,
   *   accuracy: number,
   *   falsePositives: BrandProtectionTestCase[],
   *   falseNegatives: BrandProtectionTestCase[],
   *   timestamp: string
   * }>}
   */
  async run(testCases) {
    if (!Array.isArray(testCases) || testCases.length === 0) {
      throw new Error('BrandProtectionPoC 需要至少一个测试用例');
    }

    const falsePositives = [];
    const falseNegatives = [];
    let correct = 0;

    for (const testCase of testCases) {
      const actual = await this.shouldProtect(testCase.input, testCase.context);
      const expected = Boolean(testCase.expected);

      if (actual === expected) {
        correct += 1;
      } else if (actual && !expected) {
        falsePositives.push({ ...testCase, actual });
      } else if (!actual && expected) {
        falseNegatives.push({ ...testCase, actual });
      }

      if (this.options.trace) {
        // eslint-disable-next-line no-console
        console.log(
          `[BrandProtectionPoC] ${actual === expected ? '✅' : '❌'} "${testCase.input}"`,
          { expected, actual, context: testCase.context }
        );
      }
    }

    const total = testCases.length;
    const accuracy = Number(((correct / total) * 100).toFixed(2));

    return {
      total,
      correct,
      accuracy,
      falsePositives,
      falseNegatives,
      timestamp: new Date().toISOString()
    };
  }
}

export default BrandProtectionPoC;
