/**
 * Translation Hooks v1 - 核心接口定义
 * 基于 KISS 原则设计，提供最小可用接口
 */

/**
 * Hook 上下文 - 最小字段集合
 */
export interface HookContext {
  // 核心标识
  requestId: string;
  shopId: string;
  resourceId?: string;

  // 业务参数
  text: string;
  targetLang: string;
  resourceType?: string;

  // 扩展字段（未来用）
  extra?: Record<string, unknown>;
}

/**
 * Hook 结果 - 标准化输出
 */
export interface HookResult {
  success: boolean;
  data?: any;
  error?: Error;
  metadata?: {
    duration?: number;
    retryCount?: number;
    strategy?: string;
  };
}

/**
 * 验证结果
 */
export interface ValidationResult {
  success: boolean;
  score?: number;
  issues?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Translation Hooks v1 核心接口
 * 所有方法都是可选的，默认直通
 */
export interface TranslationHooksV1 {
  /**
   * 前置决策：是否需要翻译
   * @param ctx 上下文
   * @returns true=继续翻译, false=跳过
   */
  shouldTranslate?(ctx: HookContext): Promise<boolean> | boolean;

  /**
   * 执行调度：控制翻译执行
   * @param task 翻译任务函数
   * @param ctx 上下文
   * @returns 翻译结果
   */
  schedule?<T>(task: () => Promise<T>, ctx: HookContext): Promise<T>;

  /**
   * 结果验证：验证翻译质量
   * @param result 翻译结果
   * @param ctx 上下文
   * @returns 验证结果
   */
  validate?(result: any, ctx: HookContext): Promise<ValidationResult> | ValidationResult;
}

/**
 * Hook 执行选项
 */
export interface HookOptions {
  timeout?: number;
  fallbackToDefault?: boolean;
  logErrors?: boolean;
}

/**
 * 默认的安全值
 */
export const DEFAULT_HOOK_VALUES = {
  shouldTranslate: true,
  schedule: <T>(task: () => Promise<T>) => task(),
  validate: { success: true }
} as const;