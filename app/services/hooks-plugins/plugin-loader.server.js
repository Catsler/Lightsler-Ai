/**
 * Hooks插件加载器
 * 基于KISS原则的简单插件管理系统
 */

import { logger } from '../../utils/logger.server.js';
import { config } from '../../utils/config.server.js';

// 可用的hooks插件
const AVAILABLE_PLUGINS = {
  'intelligent-skip': () => import('./intelligent-skip-hooks.server.js'),
  // 未来可以添加更多插件
  // 'quality-enhancement': () => import('./quality-enhancement-hooks.server.js'),
  // 'performance-optimization': () => import('./performance-optimization-hooks.server.js'),
};

/**
 * Hooks插件加载器类
 */
export class HooksPluginLoader {
  constructor() {
    this.loadedPlugins = new Map();
    this.activePlugin = null;
  }

  /**
   * 加载指定的hooks插件
   * @param {string} pluginName 插件名称
   * @returns {Promise<Object|null>} 加载的hooks对象
   */
  async loadPlugin(pluginName) {
    try {
      // 检查是否已加载
      if (this.loadedPlugins.has(pluginName)) {
        return this.loadedPlugins.get(pluginName);
      }

      // 检查插件是否存在
      if (!AVAILABLE_PLUGINS[pluginName]) {
        logger.warn('未知的hooks插件', { pluginName, available: Object.keys(AVAILABLE_PLUGINS) });
        return null;
      }

      // 动态加载插件
      logger.info('正在加载hooks插件', { pluginName });
      const pluginModule = await AVAILABLE_PLUGINS[pluginName]();

      // 获取默认导出或命名导出
      const hooks = pluginModule.default || pluginModule[Object.keys(pluginModule)[0]];

      if (!hooks || !hooks.hooksVersion) {
        logger.error('无效的hooks插件格式', { pluginName });
        return null;
      }

      // 验证hooks版本
      if (hooks.hooksVersion !== 1) {
        logger.warn('不兼容的hooks版本', {
          pluginName,
          version: hooks.hooksVersion,
          expected: 1
        });
        return null;
      }

      // 缓存插件
      this.loadedPlugins.set(pluginName, hooks);

      logger.info('hooks插件加载成功', {
        pluginName,
        hasCustomShouldTranslate: !!hooks.shouldTranslate,
        hasCustomSchedule: !!hooks.schedule,
        hasCustomValidate: !!hooks.validate
      });

      return hooks;

    } catch (error) {
      logger.error('hooks插件加载失败', {
        pluginName,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * 设置活动插件
   * @param {string} pluginName 插件名称
   * @returns {Promise<boolean>} 是否设置成功
   */
  async setActivePlugin(pluginName) {
    if (!pluginName) {
      this.activePlugin = null;
      logger.info('已清除活动hooks插件');
      return true;
    }

    const plugin = await this.loadPlugin(pluginName);
    if (plugin) {
      this.activePlugin = plugin;
      logger.info('设置活动hooks插件成功', { pluginName });
      return true;
    }

    return false;
  }

  /**
   * 获取当前活动插件
   * @returns {Object|null} 当前活动的hooks插件
   */
  getActivePlugin() {
    return this.activePlugin;
  }

  /**
   * 列出所有可用插件
   * @returns {Array<string>} 可用插件名称列表
   */
  listAvailablePlugins() {
    return Object.keys(AVAILABLE_PLUGINS);
  }

  /**
   * 列出已加载插件
   * @returns {Array<string>} 已加载插件名称列表
   */
  listLoadedPlugins() {
    return Array.from(this.loadedPlugins.keys());
  }

  /**
   * 卸载插件
   * @param {string} pluginName 插件名称
   */
  unloadPlugin(pluginName) {
    if (this.loadedPlugins.has(pluginName)) {
      this.loadedPlugins.delete(pluginName);

      // 如果卸载的是当前活动插件，清除活动插件
      if (this.activePlugin && this.getActivePluginName() === pluginName) {
        this.activePlugin = null;
      }

      logger.info('hooks插件已卸载', { pluginName });
    }
  }

  /**
   * 获取当前活动插件名称
   * @returns {string|null} 当前活动插件名称
   */
  getActivePluginName() {
    if (!this.activePlugin) return null;

    // 通过比较对象实例找到插件名称
    for (const [name, plugin] of this.loadedPlugins.entries()) {
      if (plugin === this.activePlugin) {
        return name;
      }
    }
    return null;
  }

  /**
   * 重载插件
   * @param {string} pluginName 插件名称
   * @returns {Promise<boolean>} 是否重载成功
   */
  async reloadPlugin(pluginName) {
    const wasActive = this.getActivePluginName() === pluginName;

    // 卸载现有插件
    this.unloadPlugin(pluginName);

    // 重新加载
    const plugin = await this.loadPlugin(pluginName);

    // 如果之前是活动插件，重新设置为活动
    if (wasActive && plugin) {
      this.activePlugin = plugin;
    }

    return !!plugin;
  }

  /**
   * 获取插件状态信息
   * @returns {Object} 插件状态信息
   */
  getStatus() {
    return {
      availablePlugins: this.listAvailablePlugins(),
      loadedPlugins: this.listLoadedPlugins(),
      activePlugin: this.getActivePluginName(),
      loadedCount: this.loadedPlugins.size
    };
  }
}

// 创建全局插件加载器实例
export const hooksPluginLoader = new HooksPluginLoader();

/**
 * 根据环境变量自动加载插件
 */
export async function autoLoadPlugins() {
  const pluginName = process.env.TRANSLATION_HOOKS_PLUGIN;

  if (pluginName) {
    logger.info('根据环境变量自动加载hooks插件', { pluginName });
    const success = await hooksPluginLoader.setActivePlugin(pluginName);

    if (!success) {
      logger.warn('自动加载hooks插件失败', { pluginName });
    }
  }
}

// 在模块加载时自动初始化
autoLoadPlugins().catch(error => {
  logger.error('自动加载hooks插件时出错', { error: error.message });
});

export default hooksPluginLoader;