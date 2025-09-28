/**
 * Translation Hooks Manager - 翻译钩子管理器
 * 基于KISS原则，提供可插拔的翻译架构
 */

import { logger } from '../utils/logger.server.js';
import { config } from '../utils/config.server.js';
import { hooksPluginLoader } from './hooks-plugins/plugin-loader.server.js';

/**
 * 默认Hooks实现 - 完全直通
 */
const DEFAULT_HOOKS = {
  hooksVersion: 1,

  shouldTranslate: (context) => {
    logger.debug('Default shouldTranslate hook', { context });
    return true;
  },

  schedule: async (task, context) => {
    logger.debug('Default schedule hook', { context });
    return await task();
  },

  validate: (result, context) => {
    logger.debug('Default validate hook', { result: result.success, context });
    return {
      success: true
    };
  }
};

/**
 * Hooks管理器类
 */
export class TranslationHooksManager {
  constructor() {
    this.hooks = DEFAULT_HOOKS;
    this.config = {
      enabled: config.translationHooks.enabled,
      enabledResourceTypes: config.translationHooks.enabledResourceTypes,
      timeoutMs: config.translationHooks.timeoutMs,
      rolloutPercentage: config.translationHooks.rolloutPercentage,
      monitoringEnabled: config.translationHooks.monitoringEnabled,
      enableShopIdFilter: config.translationHooks.enableShopIdFilter
    };
    
    logger.info('Translation Hooks Manager初始化', {
      enabled: this.config.enabled,
      rolloutPercentage: this.config.rolloutPercentage,
      enabledResourceTypes: this.config.enabledResourceTypes,
      enableShopIdFilter: this.config.enableShopIdFilter
    });
  }

  /**
   * 设置hooks配置
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
    logger.info('Translation hooks config updated', { config: this.config });
  }

  /**
   * 设置自定义hooks
   */
  setHooks(customHooks) {
    // 版本检查
    if (customHooks.hooksVersion !== 1) {
      logger.warn('Unsupported hooks version', { version: customHooks.hooksVersion });
      return false;
    }

    // 合并hooks，保留默认值
    this.hooks = {
      ...DEFAULT_HOOKS,
      ...customHooks,
      hooksVersion: 1
    };

    logger.info('Custom translation hooks registered', {
      hasCustomShouldTranslate: !!customHooks.shouldTranslate,
      hasCustomSchedule: !!customHooks.schedule,
      hasCustomValidate: !!customHooks.validate
    });

    return true;
  }

  /**
   * 使用插件设置hooks
   * @param {string} pluginName 插件名称
   * @returns {Promise<boolean>} 是否设置成功
   */
  async usePlugin(pluginName) {
    try {
      const success = await hooksPluginLoader.setActivePlugin(pluginName);

      if (success) {
        const plugin = hooksPluginLoader.getActivePlugin();
        this.setHooks(plugin);

        logger.info('Hooks插件应用成功', {
          pluginName,
          hooksVersion: plugin.hooksVersion
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('应用hooks插件失败', {
        pluginName,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 清除插件，恢复默认hooks
   */
  clearPlugin() {
    this.hooks = DEFAULT_HOOKS;
    hooksPluginLoader.setActivePlugin(null);
    logger.info('已清除hooks插件，恢复默认行为');
  }

  /**
   * 获取插件状态
   */
  getPluginStatus() {
    return {
      ...hooksPluginLoader.getStatus(),
      currentHooksVersion: this.hooks.hooksVersion,
      isUsingPlugin: this.hooks !== DEFAULT_HOOKS
    };
  }

  /**
   * 检查是否应该对指定上下文启用hooks
   */
  isHooksEnabled(context) {
    if (!this.config.enabled) {
      return false;
    }

    // 检查Shop ID过滤（白名单）
    if (this.config.enableShopIdFilter && this.config.enableShopIdFilter.length > 0) {
      if (!context.shopId || !this.config.enableShopIdFilter.includes(context.shopId)) {
        return false;
      }
    }

    // 检查资源类型过滤
    if (this.config.enabledResourceTypes && this.config.enabledResourceTypes.length > 0) {
      if (!context.resourceType || !this.config.enabledResourceTypes.includes(context.resourceType)) {
        return false;
      }
    }

    // 灰度发布：基于哈希的百分比控制
    if (this.config.rolloutPercentage < 100) {
      const rolloutKey = `${context.shopId || 'unknown'}_${context.resourceType || 'unknown'}`;
      const hash = this.calculateHash(rolloutKey);
      const percentage = hash % 100;
      
      if (percentage >= this.config.rolloutPercentage) {
        logger.debug('Hooks被灰度策略跳过', {
          rolloutKey,
          hashPercentage: percentage,
          rolloutPercentage: this.config.rolloutPercentage
        });
        return false;
      }
    }

    return true;
  }

  /**
   * 计算字符串的简单哈希值（用于灰度发布）
   */
  calculateHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash);
  }

  /**
   * 执行shouldTranslate hook
   */
  async shouldTranslate(context) {
    if (!this.isHooksEnabled(context)) {
      return true; // 禁用时默认翻译
    }

    const startTime = Date.now();
    try {
      const result = await this.executeWithTimeout(
        () => this.hooks.shouldTranslate(context),
        this.config.timeoutMs,
        'shouldTranslate'
      );

      const duration = Date.now() - startTime;
      this.recordHookMetrics('shouldTranslate', 'success', duration, context);

      logger.debug('shouldTranslate hook result', {
        context: { resourceType: context.resourceType, targetLang: context.targetLang },
        result,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordHookMetrics('shouldTranslate', 'error', duration, context, error);
      
      logger.error('shouldTranslate hook failed', { error: error.message, context, duration });
      return true; // 失败时默认翻译
    }
  }

  /**
   * 执行schedule hook
   */
  async schedule(task, context) {
    if (!this.isHooksEnabled(context)) {
      return await task(); // 禁用时直接执行
    }

    try {
      const result = await this.executeWithTimeout(
        () => this.hooks.schedule(task, context),
        this.config.timeoutMs,
        'schedule'
      );

      logger.debug('schedule hook completed', {
        context: { resourceType: context.resourceType, targetLang: context.targetLang }
      });

      return result;
    } catch (error) {
      logger.error('schedule hook failed', { error: error.message, context });
      return await task(); // 失败时直接执行
    }
  }

  /**
   * 执行validate hook
   */
  async validate(result, context) {
    if (!this.isHooksEnabled(context)) {
      return { success: true }; // 禁用时默认通过
    }

    try {
      const validationResult = await this.executeWithTimeout(
        () => this.hooks.validate(result, context),
        this.config.timeoutMs,
        'validate'
      );

      logger.debug('validate hook result', {
        context: { resourceType: context.resourceType, targetLang: context.targetLang },
        validationResult
      });

      return validationResult;
    } catch (error) {
      logger.error('validate hook failed', { error: error.message, context });
      return { success: true }; // 失败时默认通过
    }
  }

  /**
   * 带超时的hook执行
   */
  async executeWithTimeout(hookFn, timeoutMs, hookName) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${hookName} hook timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await hookFn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * 获取当前hooks状态
   */
  /**
   * 记录Hook执行指标
   */
  recordHookMetrics(hookName, status, duration, context, error = null) {
    if (!this.config.monitoringEnabled) {
      return;
    }

    const metrics = {
      hookName,
      status,
      duration,
      resourceType: context.resourceType,
      targetLang: context.targetLang,
      shopId: context.shopId,
      timestamp: new Date().toISOString()
    };

    if (error) {
      metrics.errorMessage = error.message;
      metrics.errorCode = error.code;
    }

    logger.info('Translation Hook指标', {
      ...metrics,
      event: 'hook.metrics'
    });

    // 性能告警
    if (duration > this.config.timeoutMs * 0.8) {
      logger.warn('Hook执行时间过长', {
        hookName,
        duration,
        threshold: this.config.timeoutMs * 0.8,
        context: { resourceType: context.resourceType, targetLang: context.targetLang }
      });
    }
  }

  getStatus() {
    return {
      config: this.config,
      hasCustomHooks: this.hooks !== DEFAULT_HOOKS,
      hooksVersion: this.hooks.hooksVersion
    };
  }

  /**
   * 重置为默认状态
   */
  reset() {
    this.hooks = DEFAULT_HOOKS;
    this.config = {
      enabled: false,
      enabledResourceTypes: [],
      timeoutMs: 5000
    };
    logger.info('Translation hooks reset to default');
  }
}

// 全局单例
export const translationHooksManager = new TranslationHooksManager();

// 便捷函数导出
export const {
  setConfig: setHooksConfig,
  setHooks: setTranslationHooks,
  usePlugin: useHooksPlugin,
  clearPlugin: clearHooksPlugin,
  getPluginStatus: getHooksPluginStatus,
  shouldTranslate,
  schedule,
  validate,
  getStatus: getHooksStatus,
  reset: resetHooks
} = translationHooksManager;