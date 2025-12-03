/**
 * ThemeDataValidator
 * ------------------
 * 负责评估 Shopify 主题文件在当前抓取策略下是否出现内容截断，
 * 并根据阈值判断是否需要启用 Asset API / Admin API 降级方案。
 *
 * 使用方式：
 * ```js
 * const validator = new ThemeDataValidator(async (themeId, ctx) => {
 *   // 返回文件数组
 *   return [
 *     {
 *       path: 'sections/main-product.liquid',
 *       size: 10240,            // 字节数，可选
 *       content: '<!-- ... -->',// 可选
 *       truncated: false,       // 可选
 *       contentLength: 10240    // 可选
 *     }
 *   ];
 * });
 *
 * const report = await validator.run('gid://shopify/Theme/123456789');
 * ```
 */

/**
 * @typedef {Object} ThemeFile
 * @property {string} path              文件路径
 * @property {number} [size]            主题文件的原始大小（字节）
 * @property {string} [content]         当前抓取到的内容
 * @property {boolean} [truncated]      明确标记内容是否被截断
 * @property {number} [contentLength]   抓取内容的字节数
 * @property {number} [downloadBytes]   实际下载的字节数
 */

export class ThemeDataValidator {
  /**
   * @param {(themeId: string, context?: Record<string, unknown>) => Promise<ThemeFile[]>} fetcher
   * @param {Object} [options]
   * @param {number} [options.truncationWarningThreshold=5] 触发降级建议的截断率阈值（百分比）
   * @param {number} [options.minDeltaBytes=512]            判定截断时，大小差异需要达到的最小字节数
   */
  constructor(fetcher, options = {}) {
    if (typeof fetcher !== 'function') {
      throw new TypeError('ThemeDataValidator 需要提供 fetcher 函数');
    }

    const {
      truncationWarningThreshold = 5,
      minDeltaBytes = 512
    } = options;

    this.fetcher = fetcher;
    this.options = { truncationWarningThreshold, minDeltaBytes };
  }

  /**
   * 执行验证。
   * @param {string} themeId Shopify Theme GID 或唯一标识
   * @param {Record<string, unknown>} [context] 传递给 fetcher 的上下文
   * @returns {Promise<{
   *   themeId: string,
   *   totalFiles: number,
   *   truncatedCount: number,
   *   truncationRate: number,
   *   requiresFallback: boolean,
   *   truncatedFiles: ThemeFile[],
   *   fetchedAt: string
   * }>}
   */
  async run(themeId, context = {}) {
    const files = await this.fetcher(themeId, context);
    if (!Array.isArray(files)) {
      throw new TypeError('fetcher 必须返回 ThemeFile 数组');
    }

    const truncatedFiles = [];

    for (const file of files) {
      if (this.#isTruncated(file)) {
        truncatedFiles.push(file);
      }
    }

    const totalFiles = files.length;
    const truncatedCount = truncatedFiles.length;
    const truncationRate = totalFiles === 0
      ? 0
      : Number(((truncatedCount / totalFiles) * 100).toFixed(2));

    return {
      themeId,
      totalFiles,
      truncatedCount,
      truncationRate,
      requiresFallback: truncationRate > this.options.truncationWarningThreshold,
      truncatedFiles,
      fetchedAt: new Date().toISOString()
    };
  }

  /**
   * 判断文件是否被截断。
   * 兼容多种数据来源：明确的 `truncated` 标记、字节数差异、缺失 content 等。
   * @param {ThemeFile} file
   * @returns {boolean}
   */
  #isTruncated(file) {
    if (!file || typeof file !== 'object') {
      return false;
    }

    if (file.truncated === true) {
      return true;
    }

    const originalSize = typeof file.size === 'number' ? file.size : null;
    const downloaded =
      typeof file.downloadBytes === 'number'
        ? file.downloadBytes
        : typeof file.contentLength === 'number'
          ? file.contentLength
          : typeof file.content === 'string'
            ? Buffer.byteLength(file.content, 'utf8')
            : null;

    if (originalSize === null || downloaded === null) {
      return false;
    }

    const delta = originalSize - downloaded;
    return delta > this.options.minDeltaBytes;
  }
}

export default ThemeDataValidator;
