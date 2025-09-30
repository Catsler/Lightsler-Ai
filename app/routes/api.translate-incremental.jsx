/**
 * 增量翻译API端点
 * 支持只翻译未翻译或已变更的字段
 */

import {
  performIncrementalTranslation,
  detectUntranslatedFields
} from '../services/incremental-translation.server.js';
import { getOrCreateShop, getAllResources } from '../services/database.server.js';
import { createApiRoute } from '../utils/base-route.server.js';

async function handleIncrementalTranslationAction({ request, admin, session }) {
    const formData = await request.formData();

    // 参数验证
    const params = {
      language: formData.get("language") || "zh-CN",
      resourceIds: formData.get("resourceIds") || "[]",
      analyzeOnly: formData.get("analyzeOnly") === "true" // 只分析不翻译
    };

    if (!params.language) {
      throw new Error('language 参数是必需的');
    }

    const targetLanguage = params.language;
    let resourceIds;
    try {
      resourceIds = JSON.parse(params.resourceIds);
    } catch (error) {
      throw new Error('resourceIds 必须是有效的JSON格式');
    }

    // 获取店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);

    if (params.analyzeOnly) {
      // 分析模式：只检测未翻译字段，不执行翻译
      return await analyzeTranslationNeeds(shop.id, targetLanguage, resourceIds);
    } else {
      // 翻译模式：执行增量翻译
      return await executeIncrementalTranslation(shop.id, targetLanguage, resourceIds);
    }
}

/**
 * 分析翻译需求
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {Array} resourceIds - 资源ID列表
 * @returns {Promise<Response>} 分析结果
 */
async function analyzeTranslationNeeds(shopId, language, resourceIds) {
  // 获取所有资源
  const allResources = await getAllResources(shopId);

  // 筛选要分析的资源
  const resourcesToAnalyze = resourceIds.length > 0
    ? allResources.filter(r => resourceIds.includes(r.id))
    : allResources;

  const analysisResults = [];
  let totalUntranslatedFields = 0;

  for (const resource of resourcesToAnalyze) {
    try {
      const untranslatedFields = await detectUntranslatedFields(resource, language);

      if (untranslatedFields.length > 0) {
        analysisResults.push({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          title: resource.title,
          untranslatedFields: untranslatedFields.map(f => ({
            field: f.field,
            reason: f.reason,
            contentPreview: f.content.substring(0, 100) + (f.content.length > 100 ? '...' : '')
          }))
        });
        totalUntranslatedFields += untranslatedFields.length;
      }
    } catch (error) {
      console.error(`分析资源 ${resource.id} 时出错:`, error);
    }
  }

  return {
    success: true,
    data: {
      analysis: analysisResults,
      summary: {
        totalResources: resourcesToAnalyze.length,
        resourcesNeedingTranslation: analysisResults.length,
        totalUntranslatedFields,
        language,
        mode: 'analyze_only'
      }
    },
    message: `分析完成：${analysisResults.length} 个资源需要翻译，共 ${totalUntranslatedFields} 个字段`
  };
}

/**
 * 执行增量翻译
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {Array} resourceIds - 资源ID列表
 * @returns {Promise<Response>} 翻译结果
 */
async function executeIncrementalTranslation(shopId, language, resourceIds) {
  const result = await performIncrementalTranslation(shopId, language, resourceIds);

  return {
    success: true,
    data: {
      translation: result,
      summary: {
        resourcesProcessed: result.resourcesProcessed,
        fieldsTranslated: result.fieldsTranslated,
        successRate: result.successCount / (result.successCount + result.failureCount),
        language,
        mode: 'incremental_translation'
      }
    },
    message: `增量翻译完成：处理 ${result.resourcesProcessed} 个资源，翻译 ${result.fieldsTranslated} 个字段`
  };
}

// GET方法用于获取增量翻译状态
async function handleIncrementalTranslationLoader({ request, admin, session, searchParams }) {
    const language = searchParams.get('language') || 'zh-CN';

    const shop = await getOrCreateShop(session.shop, session.accessToken);
    const allResources = await getAllResources(shop.id);

    // 统计翻译状态
    let totalResources = 0;
    let fullyTranslatedResources = 0;
    let partiallyTranslatedResources = 0;
    let untranslatedResources = 0;

    for (const resource of allResources) {
      totalResources++;
      try {
        const untranslatedFields = await detectUntranslatedFields(resource, language);

        if (untranslatedFields.length === 0) {
          fullyTranslatedResources++;
        } else {
          // 检查是否有任何翻译字段
          const hasAnyTranslation = resource.translations?.some(t =>
            t.language === language &&
            (t.translationFields && Object.keys(t.translationFields).length > 0)
          );

          if (hasAnyTranslation) {
            partiallyTranslatedResources++;
          } else {
            untranslatedResources++;
          }
        }
      } catch (error) {
        console.error(`检查资源 ${resource.id} 状态时出错:`, error);
        untranslatedResources++;
      }
    }

    return {
      success: true,
      data: {
        status: {
          language,
          totalResources,
          fullyTranslated: fullyTranslatedResources,
          partiallyTranslated: partiallyTranslatedResources,
          untranslated: untranslatedResources,
          translationCoverage: (fullyTranslatedResources / totalResources * 100).toFixed(1)
        }
      },
      message: `翻译状态统计完成`
    };
}

export const action = createApiRoute(handleIncrementalTranslationAction, {
  requireAuth: true,
  operationName: '增量翻译'
});

export const loader = createApiRoute(handleIncrementalTranslationLoader, {
  requireAuth: true,
  operationName: '增量翻译状态查询'
});