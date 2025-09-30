/**
 * Translation Hooks 管理器
 * 基于 KISS 原则，提供简单安全的 hooks 执行
 */

import { logger } from '../utils/logger.server.js';
import { config } from '../utils/config.server.js';

/**
 * 默认安全值
 */
const DEFAULT_VALUES = {
  shouldTranslate: true,
  validate: { success: true }
};

/**
 * 安全执行 Hook 函数
 * @param {Function} hookFn - Hook 函数
 * @param {any} defaultValue - 默认值
 * @param {Object} ctx - 上下文
 * @param {Object} options - 选项
 * @returns {Promise<any>} 执行结果
 */
async function safeExecuteHook(hookFn, defaultValue, ctx, options = {}) {
  const { timeout = 1000, logErrors = true } = options;

  // Hook 未定义时返回默认值
  if (!hookFn || typeof hookFn !== 'function') {
    return defaultValue;
  }

  try {
    // 设置超时保护
    const result = await Promise.race([
      Promise.resolve(hookFn(ctx)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Hook timeout')), timeout)
      )
    ]);

    return result ?? defaultValue;
  } catch (error) {
    if (logErrors) {
      logger.warn('Hook execution failed, using default value', {
        hookName: hookFn.name || 'anonymous',
        error: error.message,
        contextId: ctx.requestId
      });
    }
    return defaultValue;
  }
}

/**
 * Hooks 管理器类
 */
class HooksManager {
  constructor() {
    this.hooks = null;
    this.enabled = false;
    this.loadHooks();
  }

  /**
   * 加载 Hooks 配置
   */
  loadHooks() {
    try {
      // 检查是否启用 Hooks
      this.enabled = config.translationHooks?.enabled ?? false;

      if (!this.enabled) {
        logger.info('Translation hooks disabled');
        return;
      }

      // 这里可以后续扩展为动态加载插件
      // 目前使用默认的直通实现
      this.hooks = {
        shouldTranslate: null, // 默认直通
        schedule: null,        // 默认直通
        validate: null         // 默认直通
      };

      logger.info('Translation hooks loaded', {
        enabled: this.enabled,
        hooksCount: Object.keys(this.hooks || {}).length
      });
    } catch (error) {
      logger.error('Failed to load hooks, disabling', { error: error.message });
      this.enabled = false;
      this.hooks = null;
    }
  }

  /**
   * 检查是否应该翻译
   * @param {Object} ctx - 上下文
   * @returns {Promise<boolean>} 是否翻译
   */
  async shouldTranslate(ctx) {
    if (!this.enabled || !this.hooks) {
      return DEFAULT_VALUES.shouldTranslate;
    }

    return safeExecuteHook(
      this.hooks.shouldTranslate,
      DEFAULT_VALUES.shouldTranslate,
      ctx,
      { timeout: config.translationHooks?.timeoutMs || 1000 }
    );
  }

  /**
   * 调度翻译任务
   * @param {Function} task - 翻译任务
   * @param {Object} ctx - 上下文
   * @returns {Promise<any>} 任务结果
   */
  async schedule(task, ctx) {
    if (!this.enabled || !this.hooks || !this.hooks.schedule) {
      return task();
    }

    return safeExecuteHook(
      this.hooks.schedule,
      task,
      ctx,
      { timeout: config.translationHooks?.timeoutMs || 1000 }
    );
  }

  /**
   * 验证翻译结果
   * @param {any} result - 翻译结果
   * @param {Object} ctx - 上下文
   * @returns {Promise<Object>} 验证结果
   */
  async validate(result, ctx) {
    if (!this.enabled || !this.hooks) {
      return DEFAULT_VALUES.validate;
    }

    return safeExecuteHook(
      this.hooks.validate,
      DEFAULT_VALUES.validate,
      { result, ...ctx },
      { timeout: config.translationHooks?.timeoutMs || 1000 }
    );
  }

  /**
   * 重新加载 Hooks
   */
  reload() {
    this.loadHooks();
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    return {
      enabled: this.enabled,
      hooksLoaded: !!this.hooks,
      hookMethods: this.hooks ? Object.keys(this.hooks).filter(key =>
        this.hooks[key] !== null
      ) : []
    };
  }
}

// 创建单例实例
const hooksManager = new HooksManager();

// 导出实例和便利函数
export { hooksManager };

/**
 * 便利函数：检查是否应该翻译
 */
export const shouldTranslate = (ctx) => hooksManager.shouldTranslate(ctx);

/**
 * 便利函数：调度翻译任务
 */
export const schedule = (task, ctx) => hooksManager.schedule(task, ctx);

/**
 * 便利函数：验证翻译结果
 */
export const validate = (result, ctx) => hooksManager.validate(result, ctx);

/**
 * 便利函数：获取 Hooks 状态
 */
export const getHooksStatus = () => hooksManager.getStatus();

export default hooksManager;