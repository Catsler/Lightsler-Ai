/**
 * 同步翻译到Shopify服务
 * 从数据库读取已翻译但未同步的内容，批量提交到Shopify
 */

import prisma from '../db.server.js';
import { updateResourceTranslationBatch } from './shopify-graphql.server.js';

// 创建简单的日志记录器
const logger = {
  info: (message, ...args) => console.log(`[sync-to-shopify] ${message}`, ...args),
  error: (message, ...args) => console.error(`[sync-to-shopify] ERROR: ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[sync-to-shopify] WARN: ${message}`, ...args),
  debug: (message, ...args) => console.log(`[sync-to-shopify] DEBUG: ${message}`, ...args)
};

/**
 * 获取待同步的翻译记录
 * @param {string} shopId - 店铺ID
 * @param {Object} options - 筛选选项
 * @returns {Promise<Array>} 待同步的翻译记录
 */
export async function getPendingTranslations(shopId, options = {}) {
  const { resourceType, language, limit } = options;
  
  const where = {
    shopId,
    syncStatus: 'pending',
    status: 'completed'
  };
  
  if (language) {
    where.language = language;
  }
  
  if (resourceType) {
    where.resource = {
      resourceType
    };
  }
  
  return await prisma.translation.findMany({
    where,
    include: {
      resource: true
    },
    take: limit || 100,
    orderBy: {
      createdAt: 'asc'
    }
  });
}

/**
 * 获取同步状态统计
 * @param {string} shopId - 店铺ID
 * @returns {Promise<Object>} 状态统计
 */
export async function getSyncStatusStats(shopId) {
  const [pending, syncing, synced, failed] = await Promise.all([
    prisma.translation.count({
      where: { shopId, syncStatus: 'pending', status: 'completed' }
    }),
    prisma.translation.count({
      where: { shopId, syncStatus: 'syncing' }
    }),
    prisma.translation.count({
      where: { shopId, syncStatus: 'synced' }
    }),
    prisma.translation.count({
      where: { shopId, syncStatus: 'failed' }
    })
  ]);
  
  return {
    pending,
    syncing,
    synced,
    failed,
    total: pending + syncing + synced + failed
  };
}

/**
 * 更新翻译同步状态
 * @param {string} translationId - 翻译记录ID
 * @param {string} status - 同步状态
 * @param {Object} additionalData - 额外数据
 */
async function updateSyncStatus(translationId, status, additionalData = {}) {
  const updateData = {
    syncStatus: status,
    ...additionalData
  };
  
  if (status === 'synced') {
    updateData.syncedAt = new Date();
    updateData.syncError = null;
  }
  
  return await prisma.translation.update({
    where: { id: translationId },
    data: updateData
  });
}

/**
 * 批量更新同步状态
 * @param {Array} translationIds - 翻译记录ID数组
 * @param {string} status - 同步状态
 * @param {Object} additionalData - 额外数据
 */
async function batchUpdateSyncStatus(translationIds, status, additionalData = {}) {
  const updateData = {
    syncStatus: status,
    ...additionalData
  };
  
  if (status === 'synced') {
    updateData.syncedAt = new Date();
    updateData.syncError = null;
  }
  
  return await prisma.translation.updateMany({
    where: {
      id: { in: translationIds }
    },
    data: updateData
  });
}

/**
 * 按资源分组翻译记录
 * @param {Array} translations - 翻译记录数组
 * @returns {Map} 按资源GID分组的翻译记录
 */
function groupTranslationsByResource(translations) {
  const grouped = new Map();
  
  for (const translation of translations) {
    const gid = translation.resource.gid;
    if (!grouped.has(gid)) {
      grouped.set(gid, {
        resource: translation.resource,
        translations: []
      });
    }
    grouped.get(gid).translations.push(translation);
  }
  
  return grouped;
}

/**
 * 准备翻译输入数据
 * @param {Object} translation - 翻译记录
 * @param {Object} resource - 资源信息
 * @returns {Object} 格式化的翻译数据
 */
function prepareTranslationData(translation, resource) {
  const translationData = {
    titleTrans: translation.titleTrans,
    descTrans: translation.descTrans,
    handleTrans: translation.handleTrans,
    summaryTrans: translation.summaryTrans,
    labelTrans: translation.labelTrans,
    seoTitleTrans: translation.seoTitleTrans,
    seoDescTrans: translation.seoDescTrans,
    translationFields: translation.translationFields
  };
  
  // 移除空值
  Object.keys(translationData).forEach(key => {
    if (translationData[key] === null || translationData[key] === undefined) {
      delete translationData[key];
    }
  });
  
  return translationData;
}

/**
 * 同步单个资源的翻译到Shopify
 * @param {Object} admin - Shopify Admin API客户端
 * @param {Object} resourceData - 资源数据
 * @param {number} batchIndex - 批次索引
 * @returns {Promise<Object>} 同步结果
 */
async function syncResourceTranslations(admin, resourceData, batchIndex = 0) {
  const { resource, translations } = resourceData;
  const results = {
    success: [],
    failed: []
  };
  
  logger.info(`开始同步资源 ${resource.gid} 的 ${translations.length} 个翻译`);
  
  // 按语言分组
  const byLanguage = {};
  for (const translation of translations) {
    if (!byLanguage[translation.language]) {
      byLanguage[translation.language] = [];
    }
    byLanguage[translation.language].push(translation);
  }
  
  // 为每种语言同步翻译
  for (const [language, langTranslations] of Object.entries(byLanguage)) {
    try {
      // 更新状态为syncing
      const translationIds = langTranslations.map(t => t.id);
      await batchUpdateSyncStatus(translationIds, 'syncing', { syncBatch: batchIndex });
      
      // 准备翻译数据
      const translationData = prepareTranslationData(langTranslations[0], resource);
      
      // 调用Shopify API（使用新的批量处理函数）
      const result = await updateResourceTranslationBatch(
        admin,
        resource.gid,
        translationData,
        language,
        resource.resourceType
      );
      
      if (result.success) {
        // 更新状态为synced
        await batchUpdateSyncStatus(translationIds, 'synced', { syncBatch: batchIndex });
        results.success.push(...translationIds);
        logger.info(`资源 ${resource.gid} 的 ${language} 翻译同步成功`);
      } else {
        throw new Error(result.error || '同步失败');
      }
    } catch (error) {
      // 更新状态为failed
      const translationIds = langTranslations.map(t => t.id);
      await batchUpdateSyncStatus(translationIds, 'failed', {
        syncError: error.message,
        syncBatch: batchIndex
      });
      results.failed.push(...translationIds);
      logger.error(`资源 ${resource.gid} 的 ${language} 翻译同步失败:`, error);
    }
  }
  
  return results;
}

/**
 * 批量同步翻译到Shopify
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} shopId - 店铺ID
 * @param {Object} options - 同步选项
 * @returns {Promise<Object>} 同步结果
 */
export async function syncTranslationsToShopify(admin, shopId, options = {}) {
  const startTime = Date.now();
  const results = {
    totalProcessed: 0,
    successCount: 0,
    failedCount: 0,
    successIds: [],
    failedIds: [],
    errors: []
  };
  
  try {
    // 获取待同步的翻译
    const pendingTranslations = await getPendingTranslations(shopId, options);
    
    if (pendingTranslations.length === 0) {
      logger.info('没有待同步的翻译');
      return results;
    }
    
    logger.info(`找到 ${pendingTranslations.length} 个待同步的翻译`);
    results.totalProcessed = pendingTranslations.length;
    
    // 按资源分组
    const groupedTranslations = groupTranslationsByResource(pendingTranslations);
    logger.info(`分组为 ${groupedTranslations.size} 个资源`);
    
    // 逐个资源同步
    let batchIndex = 0;
    for (const [gid, resourceData] of groupedTranslations) {
      try {
        const syncResult = await syncResourceTranslations(admin, resourceData, batchIndex);
        results.successIds.push(...syncResult.success);
        results.failedIds.push(...syncResult.failed);
        results.successCount += syncResult.success.length;
        results.failedCount += syncResult.failed.length;
        batchIndex++;
      } catch (error) {
        logger.error(`同步资源 ${gid} 时发生错误:`, error);
        results.errors.push({
          resourceGid: gid,
          error: error.message
        });
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`同步完成，耗时 ${duration}ms，成功 ${results.successCount}，失败 ${results.failedCount}`);
    
  } catch (error) {
    logger.error('同步过程中发生错误:', error);
    results.errors.push({
      general: error.message
    });
  }
  
  return results;
}

/**
 * 重试失败的翻译同步
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} shopId - 店铺ID
 * @returns {Promise<Object>} 同步结果
 */
export async function retryFailedSync(admin, shopId) {
  logger.info('开始重试失败的同步');
  
  // 将失败状态重置为pending
  await prisma.translation.updateMany({
    where: {
      shopId,
      syncStatus: 'failed'
    },
    data: {
      syncStatus: 'pending',
      syncError: null
    }
  });
  
  // 重新同步
  return await syncTranslationsToShopify(admin, shopId);
}

/**
 * 清理同步错误
 * @param {string} shopId - 店铺ID
 * @returns {Promise<number>} 清理的记录数
 */
export async function clearSyncErrors(shopId) {
  const result = await prisma.translation.updateMany({
    where: {
      shopId,
      syncStatus: 'failed'
    },
    data: {
      syncError: null
    }
  });
  
  return result.count;
}