/**
 * Translation Hooks API - 可插拔翻译架构接口定义
 * 基于KISS原则设计，支持渐进式增强和灰度发布
 */

export interface TranslationContext {
  // 核心字段
  text: string;
  targetLang: string;

  // 可选上下文
  resourceType?: string;
  shopId?: string;
  resourceId?: string;
  sessionId?: string;
  requestId?: string;

  // 扩展位（避免未来breaking changes）
  metadata?: Record<string, any>;
}

export interface TranslationTask {
  (): Promise<TranslationResult>;
}

export interface ScheduleContext {
  priority?: number;
  retryCount?: number;
  deadlineMs?: number;

  // 扩展位
  metadata?: Record<string, any>;
}

export interface TranslationResult {
  success: boolean;
  text?: string;
  warnings?: string[];

  // 扩展位
  meta?: Record<string, any>;
}

export interface ValidationResult {
  success: boolean;
  errors?: string[];
  warnings?: string[];

  // 扩展位
  meta?: Record<string, any>;
}

/**
 * Translation Hooks 主接口
 * 版本化设计，支持向前兼容
 */
export interface TranslationHooks {
  // 版本标记，用于未来兼容性检查
  hooksVersion: 1;

  // 扩展位，避免未来breaking changes
  metadata?: Record<string, any>;

  /**
   * 判断是否需要翻译
   * @param context 翻译上下文
   * @returns 是否需要翻译，默认true
   */
  shouldTranslate?(context: TranslationContext): boolean | Promise<boolean>;

  /**
   * 调度翻译任务
   * @param task 翻译任务函数
   * @param context 调度上下文
   * @returns void，默认直接执行task
   */
  schedule?(task: TranslationTask, context: ScheduleContext): void | Promise<void>;

  /**
   * 验证翻译结果
   * @param result 翻译结果
   * @param context 原始上下文
   * @returns 验证结果，默认通过
   */
  validate?(result: TranslationResult, context: TranslationContext): ValidationResult | Promise<ValidationResult>;
}

/**
 * Hooks配置选项
 */
export interface HooksConfig {
  // 全局开关
  enabled: boolean;

  // 按资源类型开关
  enabledResourceTypes?: string[];

  // 超时设置（毫秒）
  timeoutMs?: number;

  // 扩展位
  metadata?: Record<string, any>;
}

/**
 * 默认Hooks实现
 */
export const DEFAULT_HOOKS: TranslationHooks = {
  hooksVersion: 1,

  shouldTranslate: () => true,

  schedule: async (task) => {
    await task();
  },

  validate: () => ({
    success: true
  })
};

/**
 * Hooks工厂函数类型
 */
export type HooksFactory = (config?: HooksConfig) => TranslationHooks;

/**
 * 导出类型用于其他模块
 */
export type {
  TranslationContext,
  TranslationTask,
  ScheduleContext,
  TranslationResult,
  ValidationResult,
  TranslationHooks,
  HooksConfig
};