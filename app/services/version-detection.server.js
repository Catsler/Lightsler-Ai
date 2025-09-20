import { prisma } from '../db.server.js';
import { captureError, TranslationError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';
import { fetchResourcesByType } from './shopify-graphql.server.js';
import { invalidateCoverageCache } from './language-coverage.server.js';
import crypto from 'crypto';

/**
 * 版本检测服务 - 基于Shopify translatableResources API的智能版本管理
 * 
 * 功能：
 * - 基于digest的内容变更检测
 * - 增量资源扫描和同步
 * - 新增/删除/修改资源识别
 * - 翻译版本同步管理
 */
export class VersionDetectionService {
  constructor() {
    this.batchSize = 50; // GraphQL查询批次大小
    this.maxRetries = 3;  // 最大重试次数
  }

  /**
   * 检测店铺所有资源的内容变更
   * @param {string} shopId 店铺ID
   * @param {Object} options 检测选项
   * @returns {Promise<Object>} 检测结果
   */
  async detectAllResourceChanges(shopId, options = {}) {
    try {
      const {
        resourceTypes = [], // 空数组表示检测所有类型
        includeDeleted = true,
        batchSize = this.batchSize
      } = options;

      const startTime = Date.now();
      let totalProcessed = 0;
      let totalChanges = 0;

      // 获取要检测的资源类型列表
      const typesToDetect = resourceTypes.length > 0 ? resourceTypes : 
        Object.values(await import('./shopify-graphql.server.js').then(m => m.RESOURCE_TYPES));

      const detectionResults = {
        summary: {
          shopId,
          startTime: new Date(startTime).toISOString(),
          resourceTypes: typesToDetect,
          totalProcessed: 0,
          totalChanges: 0,
          newResources: 0,
          modifiedResources: 0,
          deletedResources: 0
        },
        changes: [],
        errors: []
      };

      // 逐一检测每种资源类型
      for (const resourceType of typesToDetect) {
        try {
          logger.info('开始检测资源类型变更', { shopId, resourceType });

          const typeResult = await this._detectResourceTypeChanges(shopId, resourceType, {
            batchSize,
            includeDeleted
          });

          detectionResults.changes.push({
            resourceType,
            ...typeResult
          });

          totalProcessed += typeResult.processed;
          totalChanges += typeResult.changes.length;
          detectionResults.summary.newResources += typeResult.newCount;
          detectionResults.summary.modifiedResources += typeResult.modifiedCount;
          detectionResults.summary.deletedResources += typeResult.deletedCount;

          logger.info('资源类型变更检测完成', {
            shopId,
            resourceType,
            processed: typeResult.processed,
            changes: typeResult.changes.length
          });

        } catch (error) {
          logger.error('资源类型变更检测失败', {
            shopId,
            resourceType,
            error: error.message
          });

          detectionResults.errors.push({
            resourceType,
            error: error.message
          });
        }
      }

      // 更新汇总信息
      detectionResults.summary.totalProcessed = totalProcessed;
      detectionResults.summary.totalChanges = totalChanges;
      detectionResults.summary.duration = Date.now() - startTime;
      detectionResults.summary.completedAt = new Date().toISOString();

      logger.info('全量资源变更检测完成', detectionResults.summary);

      return detectionResults;
    } catch (error) {
      await captureError(error, {
        operation: 'detectAllResourceChanges',
        shopId,
        options
      });
      throw error;
    }
  }

  /**
   * 增量检测：仅检测自上次检测以来的变更
   * @param {string} shopId 店铺ID
   * @param {Object} options 增量检测选项
   * @returns {Promise<Object>} 增量检测结果
   */
  async detectIncrementalChanges(shopId, options = {}) {
    try {
      const {
        since, // 指定时间点，如果不提供则从上次检测时间开始
        resourceTypes = []
      } = options;

      // 获取上次检测时间
      const lastDetectionTime = since || await this._getLastDetectionTime(shopId);
      
      if (!lastDetectionTime) {
        logger.info('未找到上次检测时间，执行全量检测', { shopId });
        return await this.detectAllResourceChanges(shopId, options);
      }

      logger.info('开始增量变更检测', {
        shopId,
        since: lastDetectionTime.toISOString(),
        resourceTypes
      });

      // 获取可能有变更的资源
      const candidateResources = await this._getCandidateResourcesForIncremental(
        shopId, 
        lastDetectionTime, 
        resourceTypes
      );

      if (candidateResources.length === 0) {
        logger.info('增量检测：未发现候选资源', { shopId });
        await this._updateLastDetectionTime(shopId);
        
        return {
          summary: {
            shopId,
            type: 'incremental',
            since: lastDetectionTime.toISOString(),
            totalProcessed: 0,
            totalChanges: 0,
            newResources: 0,
            modifiedResources: 0,
            deletedResources: 0
          },
          changes: []
        };
      }

      // 对候选资源执行详细的变更检测
      const incrementalResults = await this._processIncrementalCandidates(
        shopId, 
        candidateResources,
        lastDetectionTime
      );

      // 更新最后检测时间
      await this._updateLastDetectionTime(shopId);

      logger.info('增量变更检测完成', incrementalResults.summary);

      return incrementalResults;
    } catch (error) {
      await captureError(error, {
        operation: 'detectIncrementalChanges',
        shopId,
        options
      });
      throw error;
    }
  }

  /**
   * 获取资源的当前版本信息
   * @param {string} shopId 店铺ID
   * @param {string} resourceType 资源类型
   * @param {string} resourceId 资源ID
   * @returns {Promise<Object>} 版本信息
   */
  async getResourceVersionInfo(shopId, resourceType, resourceId) {
    try {
      // 从数据库获取本地版本信息
      const localResource = await prisma.resource.findFirst({
        where: {
          shopId,
          resourceType,
          resourceId
        },
        include: {
          translations: {
            select: {
              language: true,
              sourceVersion: true,
              status: true,
              qualityScore: true,
              updatedAt: true
            }
          }
        }
      });

      // 从Shopify API获取远程版本信息（digest）
      const remoteInfo = await this._getRemoteResourceInfo(shopId, resourceType, resourceId);

      const versionInfo = {
        resourceId,
        resourceType,
        local: {
          exists: !!localResource,
          contentHash: localResource?.contentHash,
          contentVersion: localResource?.contentVersion || 0,
          lastScannedAt: localResource?.lastScannedAt,
          translationCount: localResource?.translations.length || 0
        },
        remote: {
          exists: !!remoteInfo,
          digest: remoteInfo?.digest,
          updatedAt: remoteInfo?.updatedAt
        },
        status: 'unknown'
      };

      // 判断同步状态
      if (!localResource && !remoteInfo) {
        versionInfo.status = 'not_found';
      } else if (!localResource && remoteInfo) {
        versionInfo.status = 'new_remote';
      } else if (localResource && !remoteInfo) {
        versionInfo.status = 'deleted_remote';
      } else {
        // 都存在，比较版本
        const localHash = this._calculateDigestHash(remoteInfo.digest);
        if (localResource.contentHash === localHash) {
          versionInfo.status = 'synced';
        } else {
          versionInfo.status = 'modified_remote';
        }
      }

      return versionInfo;
    } catch (error) {
      await captureError(error, {
        operation: 'getResourceVersionInfo',
        shopId,
        resourceType,
        resourceId
      });
      throw error;
    }
  }

  /**
   * 同步资源版本到本地数据库
   * @param {string} shopId 店铺ID  
   * @param {Array} resources 要同步的资源列表
   * @returns {Promise<Object>} 同步结果
   */
  async syncResourceVersions(shopId, resources) {
    try {
      const syncResults = {
        processed: 0,
        updated: 0,
        created: 0,
        errors: []
      };

      for (const resource of resources) {
        try {
          const result = await this._syncSingleResourceVersion(shopId, resource);
          syncResults.processed++;
          
          if (result.action === 'created') {
            syncResults.created++;
          } else if (result.action === 'updated') {
            syncResults.updated++;
          }
        } catch (error) {
          syncResults.errors.push({
            resourceId: resource.resourceId || resource.id,
            error: error.message
          });
          
          logger.error('单个资源版本同步失败', {
            shopId,
            resourceId: resource.resourceId || resource.id,
            error: error.message
          });
        }
      }

      logger.info('资源版本同步完成', {
        shopId,
        ...syncResults
      });

      return syncResults;
    } catch (error) {
      await captureError(error, {
        operation: 'syncResourceVersions',
        shopId,
        resourceCount: resources.length
      });
      throw error;
    }
  }

  // 私有方法

  /**
   * 检测单个资源类型的变更
   * @private
   */
  async _detectResourceTypeChanges(shopId, resourceType, options) {
    const { batchSize, includeDeleted } = options;
    
    // 获取Shopify远程数据
    const remoteResources = await fetchResourcesByType(shopId, resourceType, {
      includeTranslatableContent: true,
      batchSize
    });

    // 获取本地数据
    const localResources = await prisma.resource.findMany({
      where: { shopId, resourceType },
      select: {
        id: true,
        resourceId: true,
        contentHash: true,
        contentVersion: true,
        lastScannedAt: true
      }
    });

    // 创建查找映射
    const localResourceMap = new Map(
      localResources.map(r => [r.resourceId, r])
    );

    const changes = [];
    let newCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;

    // 检测新增和修改的资源
    for (const remoteResource of remoteResources) {
      const localResource = localResourceMap.get(remoteResource.resourceId);
      
      if (!localResource) {
        // 新增资源
        changes.push({
          type: 'NEW',
          resourceId: remoteResource.resourceId,
          remote: remoteResource
        });
        newCount++;
      } else {
        // 检查是否有变更
        const remoteHash = this._calculateResourceHash(remoteResource);
        
        if (localResource.contentHash !== remoteHash) {
          changes.push({
            type: 'MODIFIED',
            resourceId: remoteResource.resourceId,
            local: localResource,
            remote: remoteResource,
            oldHash: localResource.contentHash,
            newHash: remoteHash
          });
          modifiedCount++;
        }
        
        // 从本地映射中移除，剩余的就是已删除的
        localResourceMap.delete(remoteResource.resourceId);
      }
    }

    // 检测已删除的资源
    if (includeDeleted) {
      for (const [resourceId, localResource] of localResourceMap) {
        changes.push({
          type: 'DELETED',
          resourceId,
          local: localResource
        });
        deletedCount++;
      }
    }

    return {
      processed: remoteResources.length,
      changes,
      newCount,
      modifiedCount,
      deletedCount
    };
  }

  /**
   * 获取增量检测的候选资源
   * @private
   */
  async _getCandidateResourcesForIncremental(shopId, since, resourceTypes) {
    const where = {
      shopId,
      OR: [
        // 本地有更新的资源
        { updatedAt: { gte: since } },
        // 从未扫描过的资源
        { lastScannedAt: null },
        // 很久没扫描的资源（可能有远程更新）
        {
          lastScannedAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24小时前
          }
        }
      ],
      ...(resourceTypes.length > 0 && {
        resourceType: { in: resourceTypes }
      })
    };

    return await prisma.resource.findMany({
      where,
      select: {
        id: true,
        resourceId: true,
        resourceType: true,
        contentHash: true,
        contentVersion: true,
        lastScannedAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * 处理增量检测的候选资源
   * @private
   */
  async _processIncrementalCandidates(shopId, candidates, since) {
    const results = {
      summary: {
        shopId,
        type: 'incremental',
        since: since.toISOString(),
        totalProcessed: 0,
        totalChanges: 0,
        newResources: 0,
        modifiedResources: 0,
        deletedResources: 0
      },
      changes: []
    };

    // 按资源类型分组处理
    const typeGroups = new Map();
    for (const candidate of candidates) {
      if (!typeGroups.has(candidate.resourceType)) {
        typeGroups.set(candidate.resourceType, []);
      }
      typeGroups.get(candidate.resourceType).push(candidate);
    }

    for (const [resourceType, resources] of typeGroups) {
      try {
        const typeChanges = await this._detectTypeChangesIncremental(
          shopId, 
          resourceType, 
          resources
        );

        results.changes.push({
          resourceType,
          changes: typeChanges.changes
        });

        results.summary.totalProcessed += typeChanges.processed;
        results.summary.totalChanges += typeChanges.changes.length;
        results.summary.newResources += typeChanges.newCount || 0;
        results.summary.modifiedResources += typeChanges.modifiedCount || 0;
        results.summary.deletedResources += typeChanges.deletedCount || 0;

      } catch (error) {
        logger.error('增量检测资源类型失败', {
          shopId,
          resourceType,
          candidateCount: resources.length,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 增量检测特定类型的资源变更
   * @private
   */
  async _detectTypeChangesIncremental(shopId, resourceType, localResources) {
    const resourceIds = localResources.map(r => r.resourceId);
    
    // 只获取指定的资源ID
    const remoteResources = await fetchResourcesByType(shopId, resourceType, {
      includeTranslatableContent: true,
      resourceIds
    });

    const remoteMap = new Map(
      remoteResources.map(r => [r.resourceId, r])
    );

    const changes = [];
    let modifiedCount = 0;
    let deletedCount = 0;

    for (const localResource of localResources) {
      const remoteResource = remoteMap.get(localResource.resourceId);
      
      if (!remoteResource) {
        // 资源已删除
        changes.push({
          type: 'DELETED',
          resourceId: localResource.resourceId,
          local: localResource
        });
        deletedCount++;
      } else {
        // 检查变更
        const remoteHash = this._calculateResourceHash(remoteResource);
        
        if (localResource.contentHash !== remoteHash) {
          changes.push({
            type: 'MODIFIED',
            resourceId: localResource.resourceId,
            local: localResource,
            remote: remoteResource,
            oldHash: localResource.contentHash,
            newHash: remoteHash
          });
          modifiedCount++;
        }
      }
    }

    return {
      processed: localResources.length,
      changes,
      modifiedCount,
      deletedCount
    };
  }

  /**
   * 获取远程资源信息
   * @private
   */
  async _getRemoteResourceInfo(shopId, resourceType, resourceId) {
    try {
      const resources = await fetchResourcesByType(shopId, resourceType, {
        resourceIds: [resourceId],
        includeTranslatableContent: true
      });

      if (resources.length === 0) {
        return null;
      }

      const resource = resources[0];
      return {
        resourceId: resource.resourceId,
        digest: this._extractDigest(resource),
        updatedAt: resource.updatedAt || new Date().toISOString()
      };
    } catch (error) {
      logger.error('获取远程资源信息失败', {
        shopId,
        resourceType,
        resourceId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 同步单个资源版本
   * @private
   */
  async _syncSingleResourceVersion(shopId, resource) {
    const contentHash = this._calculateResourceHash(resource);
    // 细粒度字段digest映射（若提供了translatableContent）
    let contentDigests = null;
    if (resource.translatableContent && Array.isArray(resource.translatableContent)) {
      const { extractDigestMap } = await import('./content-digest-tracker.server.js');
      contentDigests = extractDigestMap(resource.translatableContent);
    }

    const existingResource = await prisma.resource.findFirst({
      where: {
        shopId,
        resourceType: resource.resourceType || 'UNKNOWN',
        resourceId: resource.resourceId
      }
    });

    if (existingResource) {
      // 更新现有资源
      if (existingResource.contentHash !== contentHash) {
        const updatedResource = await prisma.resource.update({
          where: { id: existingResource.id },
          data: {
            contentHash,
            contentVersion: existingResource.contentVersion + 1,
            lastScannedAt: new Date(),
            updatedAt: new Date(),
            // 更新其他字段
            title: resource.title || existingResource.title,
            description: resource.description || existingResource.description,
            descriptionHtml: resource.descriptionHtml || existingResource.descriptionHtml,
            ...(contentDigests && { contentDigests })
          }
        });
        invalidateCoverageCache(shopId, {
          resourceType: updatedResource.resourceType || resource.resourceType || null,
          scope: 'resource',
          scopeId: resource.resourceId
        });
        
        return { action: 'updated', versionIncremented: true };
      } else {
        // 只更新扫描时间
        await prisma.resource.update({
          where: { id: existingResource.id },
          data: { lastScannedAt: new Date() }
        });
        
        return { action: 'updated', versionIncremented: false };
      }
    } else {
      // 创建新资源
      const createdResource = await prisma.resource.create({
        data: {
          shopId,
          resourceType: resource.resourceType || 'UNKNOWN',
          resourceId: resource.resourceId,
          originalResourceId: resource.originalResourceId,
          gid: resource.gid || '',
          title: resource.title || '',
          description: resource.description,
          descriptionHtml: resource.descriptionHtml,
          handle: resource.handle,
          seoTitle: resource.seoTitle,
          seoDescription: resource.seoDescription,
          summary: resource.summary,
          label: resource.label,
          contentFields: resource.contentFields ? JSON.stringify(resource.contentFields) : null,
          status: 'pending',
          contentHash,
          contentVersion: 1,
          lastScannedAt: new Date(),
          ...(contentDigests && { contentDigests })
        }
      });
      invalidateCoverageCache(shopId, {
        resourceType: resource.resourceType || 'UNKNOWN',
        scope: 'resource',
        scopeId: resource.resourceId
      });
      
      return { action: 'created' };
    }
  }

  /**
   * 计算资源内容哈希
   * @private
   */
  _calculateResourceHash(resource) {
    // 提取关键内容字段
    const contentData = {
      title: resource.title || '',
      description: resource.description || '',
      descriptionHtml: resource.descriptionHtml || '',
      handle: resource.handle || '',
      seoTitle: resource.seoTitle || '',
      seoDescription: resource.seoDescription || '',
      summary: resource.summary || '',
      label: resource.label || '',
      contentFields: resource.contentFields || {}
    };

    // 如果有translatableContent，也包含进来
    if (resource.translatableContent && Array.isArray(resource.translatableContent)) {
      contentData.translatableContent = resource.translatableContent.map(tc => ({
        key: tc.key,
        value: tc.value,
        digest: tc.digest
      }));
    }

    const contentString = JSON.stringify(contentData, Object.keys(contentData).sort());
    return crypto.createHash('md5').update(contentString).digest('hex');
  }

  /**
   * 计算digest哈希
   * @private
   */
  _calculateDigestHash(digest) {
    return crypto.createHash('md5').update(digest || '').digest('hex');
  }

  /**
   * 提取资源的digest信息
   * @private
   */
  _extractDigest(resource) {
    if (resource.translatableContent && Array.isArray(resource.translatableContent)) {
      // 将所有digest拼接起来作为整体digest
      const digests = resource.translatableContent
        .map(tc => tc.digest)
        .filter(Boolean)
        .join('|');
      return digests || 'no-digest';
    }
    return 'no-digest';
  }

  /**
   * 获取上次检测时间
   * @private
   */
  async _getLastDetectionTime(shopId) {
    const lastDetection = await prisma.resource.findFirst({
      where: { shopId, lastScannedAt: { not: null } },
      orderBy: { lastScannedAt: 'desc' },
      select: { lastScannedAt: true }
    });

    return lastDetection?.lastScannedAt;
  }

  /**
   * 更新最后检测时间
   * @private
   */
  async _updateLastDetectionTime(shopId) {
    // 可以在shop表中记录最后检测时间，或者使用其他方式
    // 这里简单地更新所有资源的扫描时间标记
    const now = new Date();
    
    try {
      // 更新shop表的时间戳（如果有这个字段的话）
      await prisma.shop.update({
        where: { id: shopId },
        data: { updatedAt: now }
      });
    } catch (error) {
      // 如果shop表更新失败，不影响主流程
      logger.warn('更新shop最后检测时间失败', {
        shopId,
        error: error.message
      });
    }
  }
}

// 创建单例实例
export const versionDetectionService = new VersionDetectionService();
