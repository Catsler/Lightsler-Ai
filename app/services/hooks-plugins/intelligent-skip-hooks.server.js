/**
 * 智能跳过Hooks插件
 * 将Sequential Thinking中的智能跳过逻辑迁移到hooks插件
 * 基于KISS原则简化复杂决策逻辑
 */

import { logger } from '../../utils/logger.server.js';
import { prisma } from '../../db.server.js';

/**
 * 智能跳过Hooks实现
 * 替代原有的复杂Sequential Thinking跳过决策
 */
export const intelligentSkipHooks = {
  hooksVersion: 1,

  /**
   * 智能判断是否需要翻译
   * 简化版本的跳过逻辑，基于实际数据驱动
   */
  async shouldTranslate(context) {
    try {
      // 1. 基础验证 - 快速失败
      if (!context.text || !context.text.trim()) {
        logger.debug('跳过空文本翻译', { context });
        return false;
      }

      // 2. 长度检查 - 避免处理过短/过长文本
      const textLength = context.text.trim().length;
      if (textLength < 2) {
        logger.debug('跳过过短文本', { textLength, context });
        return false;
      }

      if (textLength > 10000) {
        logger.debug('跳过过长文本', { textLength, context });
        return false;
      }

      // 3. 重复翻译检查 - 基于内容哈希
      if (context.resourceId) {
        const existingTranslation = await prisma.translation.findFirst({
          where: {
            resourceId: context.resourceId,
            language: context.targetLang,
            syncStatus: 'synced'
          },
          select: { id: true, updatedAt: true }
        });

        if (existingTranslation) {
          // 如果已有翻译且更新时间在24小时内，跳过
          const hoursSinceUpdate = (Date.now() - existingTranslation.updatedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceUpdate < 24) {
            logger.debug('跳过重复翻译', {
              resourceId: context.resourceId,
              hoursSinceUpdate: Math.round(hoursSinceUpdate)
            });
            return false;
          }
        }
      }

      // 4. 语言相同性检查
      if (context.targetLang === 'en' && isLikelyEnglish(context.text)) {
        logger.debug('跳过英文到英文翻译', { context });
        return false;
      }

      // 5. 特殊内容检查
      if (isSpecialContent(context.text)) {
        logger.debug('跳过特殊内容', {
          text: context.text.substring(0, 100),
          context
        });
        return false;
      }

      // 6. 资源类型特殊规则
      if (shouldSkipByResourceType(context.resourceType, context.text)) {
        logger.debug('根据资源类型跳过', {
          resourceType: context.resourceType,
          context
        });
        return false;
      }

      // 默认允许翻译
      return true;

    } catch (error) {
      logger.error('shouldTranslate hook执行失败', {
        error: error.message,
        context
      });
      // 错误时默认允许翻译，避免阻塞
      return true;
    }
  },

  /**
   * 简化的调度逻辑
   * 直接执行，去除复杂的调度决策
   */
  async schedule(task, context) {
    try {
      // 简单优先级处理
      if (context.priority && context.priority > 3) {
        // 高优先级任务立即执行
        return await task();
      }

      // 普通任务直接执行
      return await task();

    } catch (error) {
      logger.error('schedule hook执行失败', {
        error: error.message,
        context
      });
      // 错误时直接执行原任务
      return await task();
    }
  },

  /**
   * 简化的验证逻辑
   * 基于实际质量指标，去除复杂的质量分析
   */
  async validate(result, context) {
    try {
      // 1. 基础成功性检查
      if (!result.success || !result.text) {
        return {
          success: false,
          errors: ['翻译结果无效']
        };
      }

      // 2. 简单的质量检查
      const originalLength = context.text?.length || 0;
      const translatedLength = result.text.length;

      // 长度异常检查
      if (translatedLength === 0) {
        return {
          success: false,
          errors: ['翻译结果为空']
        };
      }

      // 长度比例异常检查（翻译后长度不应该相差太大）
      const lengthRatio = translatedLength / Math.max(originalLength, 1);
      if (lengthRatio > 5 || lengthRatio < 0.1) {
        return {
          success: false,
          errors: [`翻译长度异常，比例: ${lengthRatio.toFixed(2)}`],
          warnings: ['翻译长度与原文差异较大']
        };
      }

      // 3. 相同性检查
      if (originalLength > 10 && result.text.trim() === context.text?.trim()) {
        return {
          success: false,
          errors: ['翻译结果与原文相同'],
          warnings: ['可能翻译未生效']
        };
      }

      // 验证通过
      return {
        success: true,
        warnings: lengthRatio > 3 || lengthRatio < 0.3 ?
          ['翻译长度变化较大，请检查质量'] : undefined
      };

    } catch (error) {
      logger.error('validate hook执行失败', {
        error: error.message,
        context,
        result: { success: result.success, textLength: result.text?.length }
      });

      // 错误时默认通过验证
      return {
        success: true,
        warnings: ['验证过程出错，已跳过验证']
      };
    }
  }
};

/**
 * 检查是否为英文文本
 */
function isLikelyEnglish(text) {
  const englishPattern = /^[a-zA-Z0-9\s\.,!?'"-]+$/;
  return englishPattern.test(text.trim());
}

/**
 * 检查是否为特殊内容（不需要翻译）
 */
function isSpecialContent(text) {
  const specialPatterns = [
    /^https?:\/\//, // URL
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // Email
    /^\d+$/, // 纯数字
    /^[A-Z_][A-Z0-9_]*$/, // 常量名
    /^#[0-9a-fA-F]{3,6}$/, // 颜色代码
    /^\$\{.*\}$/, // 模板变量
    /^[<>].*[<>]$/ // HTML标签（简单检查）
  ];

  return specialPatterns.some(pattern => pattern.test(text.trim()));
}

/**
 * 根据资源类型判断是否跳过
 */
function shouldSkipByResourceType(resourceType, text) {
  // 链接类型通常不需要翻译URL部分
  if (resourceType === 'link' && text.startsWith('http')) {
    return true;
  }

  // 过滤器类型如果是技术术语则跳过
  if (resourceType === 'filter' && text.length < 10 && /^[a-zA-Z_]+$/.test(text)) {
    return true;
  }

  return false;
}

export default intelligentSkipHooks;