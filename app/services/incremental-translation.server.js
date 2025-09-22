/**
 * 增量翻译服务
 * 实现字段级翻译状态追踪，支持只翻译未翻译的内容
 */

import { prisma } from '../db.server.js';
import { logger } from '../utils/logger.server.js';
import { translateTextWithFallback } from './translation.server.js';
import crypto from 'crypto';

/**
 * 计算内容摘要
 * @param {string} content - 内容
 * @returns {string} 摘要哈希值
 */
function calculateContentDigest(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }
  return crypto.createHash('md5').update(content.trim()).digest('hex');
}

/**
 * 检测资源中未翻译的字段
 * @param {Object} resource - 资源对象
 * @param {string} language - 目标语言
 * @returns {Promise<Array>} 未翻译字段列表
 */
export async function detectUntranslatedFields(resource, language) {
  try {
    // 获取该资源的翻译记录
    const translation = await prisma.translation.findUnique({
      where: {
        resourceId_language: {
          resourceId: resource.id,
          language: language
        }
      }
    });

    const untranslatedFields = [];
    const contentDigests = resource.contentDigests || {};

    // 定义可翻译字段映射
    const translatableFields = {
      'title': 'titleTrans',
      'description': 'descTrans',
      'seoTitle': 'seoTitleTrans',
      'seoDescription': 'seoDescTrans',
      'summary': 'summaryTrans',
      'label': 'labelTrans'
    };

    // 检查每个字段的翻译状态
    for (const [sourceField, targetField] of Object.entries(translatableFields)) {
      const sourceContent = resource[sourceField];

      // 跳过空内容
      if (!sourceContent || sourceContent.trim() === '') {
        continue;
      }

      // 计算当前内容摘要
      const currentDigest = calculateContentDigest(sourceContent);
      const storedDigest = contentDigests[sourceField];

      // 检查翻译字段
      const translatedValue = translation?.translationFields?.[sourceField] || translation?.[targetField];

      // 判断是否需要翻译
      const needsTranslation =
        !translatedValue || // 没有翻译
        !storedDigest || // 没有存储摘要
        storedDigest !== currentDigest; // 内容已变更

      if (needsTranslation) {
        untranslatedFields.push({
          field: sourceField,
          targetField: targetField,
          content: sourceContent,
          reason: !translatedValue ? 'no_translation' :
                  !storedDigest ? 'no_digest' : 'content_changed'
        });
      }
    }

    // 处理 contentFields 中的嵌套字段
    const contentFields = resource.contentFields || {};
    for (const [key, value] of Object.entries(contentFields)) {
      if (typeof value === 'string' && value.trim() && key.includes('text') || key.includes('title') || key.includes('description')) {
        const currentDigest = calculateContentDigest(value);
        const storedDigest = contentDigests[`contentFields.${key}`];
        const translatedValue = translation?.translationFields?.[`contentFields.${key}`];

        if (!translatedValue || !storedDigest || storedDigest !== currentDigest) {
          untranslatedFields.push({
            field: `contentFields.${key}`,
            targetField: `contentFields.${key}`,
            content: value,
            reason: !translatedValue ? 'no_translation' :
                    !storedDigest ? 'no_digest' : 'content_changed'
          });
        }
      }
    }

    logger.info(`检测到 ${untranslatedFields.length} 个未翻译字段`, {
      resourceId: resource.id,
      language,
      fields: untranslatedFields.map(f => f.field)
    });

    return untranslatedFields;
  } catch (error) {
    logger.error('检测未翻译字段失败:', error);
    throw error;
  }
}

/**
 * 翻译指定字段
 * @param {Object} resource - 资源对象
 * @param {Array} untranslatedFields - 未翻译字段列表
 * @param {string} language - 目标语言
 * @returns {Promise<Object>} 翻译结果
 */
export async function translateSpecificFields(resource, untranslatedFields, language) {
  try {
    const translationResults = {};
    const newContentDigests = { ...resource.contentDigests };
    let successCount = 0;
    let failureCount = 0;

    for (const fieldInfo of untranslatedFields) {
      try {
        logger.info(`翻译字段: ${fieldInfo.field}`, {
          resourceId: resource.id,
          language,
          reason: fieldInfo.reason
        });

        // 调用翻译API
        const result = await translateTextWithFallback(fieldInfo.content, language);

        if (result.success) {
          translationResults[fieldInfo.targetField] = result.text;
          // 更新内容摘要
          newContentDigests[fieldInfo.field] = calculateContentDigest(fieldInfo.content);
          successCount++;

          logger.debug(`字段翻译成功: ${fieldInfo.field}`, {
            original: fieldInfo.content.substring(0, 100),
            translated: result.text.substring(0, 100)
          });
        } else {
          logger.warn(`字段翻译失败: ${fieldInfo.field}`, { error: result.error });
          failureCount++;
        }
      } catch (error) {
        logger.error(`翻译字段 ${fieldInfo.field} 时出错:`, error);
        failureCount++;
      }
    }

    return {
      translationResults,
      newContentDigests,
      stats: {
        total: untranslatedFields.length,
        success: successCount,
        failure: failureCount
      }
    };
  } catch (error) {
    logger.error('翻译指定字段失败:', error);
    throw error;
  }
}

/**
 * 保存增量翻译结果
 * @param {Object} resource - 资源对象
 * @param {Object} translationResults - 翻译结果
 * @param {Object} newContentDigests - 新的内容摘要
 * @param {string} language - 目标语言
 * @returns {Promise<Object>} 保存结果
 */
export async function saveIncrementalTranslation(resource, translationResults, newContentDigests, language) {
  try {
    // 获取现有翻译记录
    const existingTranslation = await prisma.translation.findUnique({
      where: {
        resourceId_language: {
          resourceId: resource.id,
          language: language
        }
      }
    });

    // 合并翻译字段
    const existingFields = existingTranslation?.translationFields || {};
    const mergedFields = { ...existingFields, ...translationResults };

    // 使用事务更新资源和翻译
    const result = await prisma.$transaction(async (tx) => {
      // 更新资源的 contentDigests
      await tx.resource.update({
        where: { id: resource.id },
        data: {
          contentDigests: newContentDigests,
          contentVersion: { increment: 1 }
        }
      });

      // 更新或创建翻译记录
      const savedTranslation = await tx.translation.upsert({
        where: {
          resourceId_language: {
            resourceId: resource.id,
            language: language
          }
        },
        update: {
          translationFields: mergedFields,
          status: 'completed',
          syncStatus: 'pending',
          sourceVersion: resource.contentVersion + 1,
          qualityScore: 0.8, // 默认质量评分
          updatedAt: new Date()
        },
        create: {
          resourceId: resource.id,
          shopId: resource.shopId,
          language: language,
          translationFields: mergedFields,
          status: 'completed',
          syncStatus: 'pending',
          sourceVersion: resource.contentVersion + 1,
          qualityScore: 0.8
        }
      });

      return savedTranslation;
    });

    logger.info('增量翻译保存成功', {
      resourceId: resource.id,
      language,
      fieldsCount: Object.keys(translationResults).length
    });

    return result;
  } catch (error) {
    logger.error('保存增量翻译失败:', error);
    throw error;
  }
}

/**
 * 执行增量翻译
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {Array} resourceIds - 资源ID列表，为空则处理所有资源
 * @returns {Promise<Object>} 翻译结果统计
 */
export async function performIncrementalTranslation(shopId, language, resourceIds = []) {
  try {
    logger.info('开始增量翻译', { shopId, language, resourceCount: resourceIds.length || 'all' });

    // 获取待处理资源
    const whereClause = { shopId };
    if (resourceIds.length > 0) {
      whereClause.id = { in: resourceIds };
    }

    const resources = await prisma.resource.findMany({
      where: whereClause,
      include: {
        translations: {
          where: { language }
        }
      }
    });

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailure = 0;
    let totalFieldsTranslated = 0;

    for (const resource of resources) {
      try {
        // 检测未翻译字段
        const untranslatedFields = await detectUntranslatedFields(resource, language);

        if (untranslatedFields.length === 0) {
          logger.debug(`资源 ${resource.id} 无需翻译`);
          continue;
        }

        // 翻译指定字段
        const translationResult = await translateSpecificFields(resource, untranslatedFields, language);

        // 保存翻译结果
        await saveIncrementalTranslation(
          resource,
          translationResult.translationResults,
          translationResult.newContentDigests,
          language
        );

        totalProcessed++;
        totalSuccess += translationResult.stats.success;
        totalFailure += translationResult.stats.failure;
        totalFieldsTranslated += translationResult.stats.success;

        logger.info(`资源 ${resource.id} 增量翻译完成`, translationResult.stats);
      } catch (error) {
        logger.error(`处理资源 ${resource.id} 时出错:`, error);
        totalProcessed++;
        totalFailure++;
      }
    }

    const summary = {
      shopId,
      language,
      resourcesProcessed: totalProcessed,
      fieldsTranslated: totalFieldsTranslated,
      successCount: totalSuccess,
      failureCount: totalFailure,
      totalResources: resources.length
    };

    logger.info('增量翻译完成', summary);
    return summary;
  } catch (error) {
    logger.error('执行增量翻译失败:', error);
    throw error;
  }
}