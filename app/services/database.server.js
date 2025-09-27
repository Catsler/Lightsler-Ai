import { PrismaClient } from "@prisma/client";
import { invalidateCoverageCache } from "./language-coverage.server.js";

const prisma = new PrismaClient();

/**
 * 数据库操作服务
 */

/**
 * 获取或创建店铺记录
 * @param {string} shopDomain - 店铺域名
 * @param {string} accessToken - 访问令牌
 * @returns {Promise<Object>} 店铺记录
 */
export async function getOrCreateShop(shopDomain, accessToken) {
  let shop = await prisma.shop.findUnique({
    where: { domain: shopDomain }
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        id: shopDomain,
        domain: shopDomain,
        accessToken: accessToken,
      }
    });
  } else {
    // 更新访问令牌
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: { accessToken: accessToken }
    });
  }

  return shop;
}

/**
 * 批量保存资源到数据库
 * @param {string} shopId - 店铺ID
 * @param {Array} resources - 资源列表
 * @returns {Promise<Array>} 保存的资源记录
 */
export async function saveResources(shopId, resources) {
  const savedResources = [];

  for (const resource of resources) {
    // 构建更新和创建的数据对象
    const resourceData = {
      gid: resource.gid,
      title: resource.title,
      description: resource.description,
      descriptionHtml: resource.descriptionHtml,
      handle: resource.handle,
      seoTitle: resource.seoTitle,
      seoDescription: resource.seoDescription,
      summary: resource.summary || null,
      label: resource.label || null,
      contentFields: resource.contentFields || null,
      // 移除originalId字段，数据库中没有对应字段
      status: 'pending'
    };

    const saved = await prisma.resource.upsert({
      where: {
        shopId_resourceType_resourceId: {
          shopId: shopId,
          resourceType: resource.resourceType,
          // 优先使用显式的resourceId，回退到id（向后兼容）
          resourceId: resource.resourceId || resource.id
        }
      },
      update: resourceData,
      create: {
        shopId: shopId,
        resourceType: resource.resourceType,
        // 优先使用显式的resourceId，回退到id（向后兼容）
        resourceId: resource.resourceId || resource.id,
        ...resourceData
      }
    });
    savedResources.push(saved);
  }

  return savedResources;
}

/**
 * 获取店铺的待翻译资源
 * @param {string} shopId - 店铺ID
 * @param {string} resourceType - 资源类型 (product, collection, 或 null 表示全部)
 * @returns {Promise<Array>} 资源列表
 */
export async function getPendingResources(shopId, resourceType = null) {
  const where = {
    shopId: shopId,
    status: 'pending'
  };

  if (resourceType) {
    where.resourceType = resourceType;
  }

  return await prisma.resource.findMany({
    where: where,
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 获取店铺的所有资源
 * @param {string} shopId - 店铺ID
 * @param {string} language - 可选：目标语言过滤
 * @returns {Promise<Array>} 资源列表
 */
export async function getAllResources(shopId, language = null) {
  // 当有语言过滤时，添加 _count 以获取所有翻译的总数
  // 这样前端可以知道其他语言的翻译情况
  const includeClause = language ? {
    translations: {
      where: { language: language }
    },
    _count: {
      select: { translations: true }  // 返回所有翻译的总数，不受 where 过滤影响
    }
  } : {
    translations: true
  };

  return await prisma.resource.findMany({
    where: { shopId: shopId },
    include: includeClause,
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 保存翻译结果
 * @param {string} resourceId - 资源ID
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {Object} translations - 翻译内容
 * @returns {Promise<Object>} 翻译记录
 */
export async function saveTranslation(resourceId, shopId, language, translations) {
  // 记录语言参数，帮助调试
  console.log(`[saveTranslation] 保存翻译 - 资源ID: ${resourceId}, 语言: ${language}, 店铺: ${shopId}`);

  // 防御性检查：处理可能的嵌套结构
  // 兼容两种调用方式：
  // 1. 直接传递翻译字段对象 { titleTrans, descTrans, ... }
  // 2. 传递包含 translations 字段的对象 { translations: { titleTrans, descTrans, ... } }
  const actualTranslations = translations?.translations || translations || {};

  // 构建翻译数据对象，使用防御性访问
  const translationData = {
    titleTrans: actualTranslations.titleTrans || null,
    descTrans: actualTranslations.descTrans || null,
    handleTrans: actualTranslations.handleTrans || null,
    summaryTrans: actualTranslations.summaryTrans || null,
    labelTrans: actualTranslations.labelTrans || null,
    seoTitleTrans: actualTranslations.seoTitleTrans || null,
    seoDescTrans: actualTranslations.seoDescTrans || null,
    translationFields: actualTranslations.translationFields || null,
    status: 'completed',
    syncStatus: 'pending' // 新翻译默认为待同步状态
  };
  
  try {
    const result = await prisma.translation.upsert({
      where: {
        resourceId_language: {
          resourceId: resourceId,
          language: language
        }
      },
      update: translationData,
      create: {
        resourceId: resourceId,
        shopId: shopId,
        language: language,
        ...translationData
      }
    });
    
    console.log(`[saveTranslation] 成功保存 ${language} 翻译，记录ID: ${result.id}`);
    invalidateCoverageCache(shopId, {
      language,
      scope: 'resource',
      scopeId: resourceId
    });
    return result;
    
  } catch (error) {
    console.error(`[saveTranslation] 保存翻译失败:`, error);
    
    // 记录到错误数据库
    if (typeof collectError !== 'undefined') {
      const { collectError, ERROR_TYPES } = await import('./error-collector.server.js');
      await collectError({
        errorType: ERROR_TYPES.DATABASE,
        errorCategory: 'DATABASE_ERROR',
        errorCode: 'SAVE_TRANSLATION_FAILED',
        message: `Failed to save translation: ${error.message}`,
        stack: error.stack,
        operation: 'saveTranslation',
        resourceId,
        severity: 4,
        retryable: true,
        context: {
          shopId,
          language,
          hasTranslations: !!translations,
          error: error.message
        }
      });
    }
    
    throw error;
  }
}

/**
 * 更新资源状态
 * @param {string} resourceId - 资源ID
 * @param {string} status - 新状态
 * @returns {Promise<Object>} 更新后的资源记录
 */
export async function updateResourceStatus(resourceId, status) {
  return await prisma.resource.update({
    where: { id: resourceId },
    data: { status: status }
  });
}

/**
 * 获取店铺的翻译统计
 * @param {string} shopId - 店铺ID
 * @param {string} language - 可选：目标语言过滤
 * @returns {Promise<Object>} 统计信息
 */
export async function getTranslationStats(shopId, language = null) {
  const totalResources = await prisma.resource.count({
    where: { shopId: shopId }
  });

  const pendingResources = await prisma.resource.count({
    where: { shopId: shopId, status: 'pending' }
  });

  const completedResources = await prisma.resource.count({
    where: { shopId: shopId, status: 'completed' }
  });

  const translationWhere = { shopId: shopId };
  if (language) {
    translationWhere.language = language;
  }

  const totalTranslations = await prisma.translation.count({
    where: translationWhere
  });

  // Phase 2: 添加pending翻译统计
  const pendingTranslations = await prisma.translation.count({
    where: { ...translationWhere, syncStatus: 'pending' }
  });

  const syncedTranslations = await prisma.translation.count({
    where: { ...translationWhere, syncStatus: 'synced' }
  });

  // 全局pending翻译统计（所有语言）
  const totalPendingTranslations = await prisma.translation.count({
    where: { shopId: shopId, syncStatus: 'pending' }
  });

  // 如果指定了语言，添加语言特定的统计
  const result = {
    totalResources,
    pendingResources,
    completedResources,
    totalTranslations,
    pendingTranslations,
    syncedTranslations,
    totalPendingTranslations
  };

  if (language) {
    // 获取该语言已翻译的资源数量
    const resourcesWithLanguageTranslations = await prisma.resource.count({
      where: {
        shopId: shopId,
        translations: {
          some: { language: language }
        }
      }
    });
    
    result.languageTranslatedResources = resourcesWithLanguageTranslations;
    result.languageTranslationProgress = totalResources > 0 
      ? Math.round((resourcesWithLanguageTranslations / totalResources) * 100)
      : 0;
  }

  return result;
}

/**
 * 删除特定资源的翻译记录
 * @param {string} resourceId - 资源ID
 * @param {string} language - 语言代码（可选）
 * @returns {Promise<void>}
 */
export async function deleteTranslations(resourceId, language = null) {
  const where = { resourceId };
  
  if (language) {
    where.language = language;
  }
  
  await prisma.translation.deleteMany({ where });
}

/**
 * 清空店铺的所有资源和翻译
 * @param {string} shopId - 店铺ID
 * @returns {Promise<void>}
 */
export async function clearShopData(shopId) {
  // 删除翻译记录
  await prisma.translation.deleteMany({
    where: { shopId: shopId }
  });

  // 删除资源记录
  await prisma.resource.deleteMany({
    where: { shopId: shopId }
  });
}

/**
 * 清空店铺指定语言的翻译数据
 * @param {string} shopId - 店铺ID
 * @param {string} language - 语言代码
 * @returns {Promise<void>}
 */
export async function clearShopDataByLanguage(shopId, language) {
  // 删除指定语言的翻译记录
  await prisma.translation.deleteMany({
    where: {
      shopId: shopId,
      language: language
    }
  });

  // 可选：清理没有任何翻译的资源
  const orphanResources = await prisma.resource.findMany({
    where: {
      shopId: shopId,
      translations: {
        none: {}
      }
    }
  });

  if (orphanResources.length > 0) {
    await prisma.resource.deleteMany({
      where: {
        id: {
          in: orphanResources.map(r => r.id)
        }
      }
    });
  }
}

/**
 * 获取指定ID的资源及其所有翻译
 * @param {string} resourceId - 资源ID (数据库中的resourceId字段，非数据库主键)
 * @param {string} shopId - 店铺ID
 * @returns {Promise<Object|null>} 资源记录及其翻译，如果不存在则返回null
 */
export async function getResourceWithTranslations(resourceId, shopId) {
  try {
    const resource = await prisma.resource.findFirst({
      where: {
        resourceId: resourceId,
        shopId: shopId
      },
      include: {
        translations: {
          orderBy: { language: 'asc' }
        }
      }
    });

    return resource;
  } catch (error) {
    console.error('[getResourceWithTranslations] 获取资源失败:', error);
    throw error;
  }
}

function mapGroupCounts(groups, key) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return {};
  }

  return groups.reduce((acc, item) => {
    const groupKey = item[key] ?? 'unknown';
    acc[groupKey] = item._count?._all ?? 0;
    return acc;
  }, {});
}

export async function getHealthSnapshot(shopId) {
  const [
    totalResources,
    resourcesByStatus,
    resourcesByType,
    resourcesLastScanned,
    translationTotal,
    translationsByStatus,
    translationsByLanguage,
    translationsBySyncStatus,
    lastTranslation,
    lastSynced
  ] = await Promise.all([
    prisma.resource.count({ where: { shopId } }),
    prisma.resource.groupBy({
      by: ['status'],
      where: { shopId },
      _count: { _all: true }
    }),
    prisma.resource.groupBy({
      by: ['resourceType'],
      where: { shopId },
      _count: { _all: true }
    }),
    prisma.resource.findFirst({
      where: {
        shopId,
        lastScannedAt: { not: null }
      },
      orderBy: { lastScannedAt: 'desc' },
      select: { lastScannedAt: true }
    }),
    prisma.translation.count({ where: { shopId } }),
    prisma.translation.groupBy({
      by: ['status'],
      where: { shopId },
      _count: { _all: true }
    }),
    prisma.translation.groupBy({
      by: ['language'],
      where: { shopId },
      _count: { _all: true }
    }),
    prisma.translation.groupBy({
      by: ['syncStatus'],
      where: { shopId },
      _count: { _all: true }
    }),
    prisma.translation.findFirst({
      where: { shopId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, language: true, resourceId: true }
    }),
    prisma.translation.findFirst({
      where: {
        shopId,
        syncedAt: { not: null }
      },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true, language: true, resourceId: true }
    })
  ]);

  const resourceStatusCounts = mapGroupCounts(resourcesByStatus, 'status');
  const resourceTypeCounts = mapGroupCounts(resourcesByType, 'resourceType');
  const translationStatusCounts = mapGroupCounts(translationsByStatus, 'status');
  const translationLanguageCounts = mapGroupCounts(translationsByLanguage, 'language');
  const translationSyncCounts = mapGroupCounts(translationsBySyncStatus, 'syncStatus');

  return {
    resources: {
      total: totalResources,
      byStatus: resourceStatusCounts,
      byType: resourceTypeCounts,
      lastScannedAt: resourcesLastScanned?.lastScannedAt?.toISOString() ?? null
    },
    translations: {
      total: translationTotal,
      byStatus: translationStatusCounts,
      byLanguage: translationLanguageCounts,
      bySyncStatus: translationSyncCounts,
      pendingSync: translationSyncCounts.pending ?? 0,
      lastTranslatedAt: lastTranslation?.updatedAt?.toISOString() ?? null,
      lastSyncedAt: lastSynced?.syncedAt?.toISOString() ?? null
    }
  };
}

export { prisma };
