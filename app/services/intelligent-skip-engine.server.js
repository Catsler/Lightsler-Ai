import { prisma } from '../db.server.js';
import { captureError, TranslationError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';
import crypto from 'crypto';

/**
 * 智能跳过引擎 - 基于错误数据和质量评估的智能跳过系统
 * 
 * 功能：
 * - 内容变更检测和智能跳过
 * - 基于历史错误数据的风险评估
 * - 可配置的跳过规则引擎
 * - 翻译质量预测和过滤
 */
export class IntelligentSkipEngine {
  constructor() {
    this.skipRules = new Map(); // 跳过规则缓存
    this.riskThresholds = {
      HIGH: 0.8,    // 高风险，建议跳过
      MEDIUM: 0.5,  // 中风险，谨慎处理
      LOW: 0.2      // 低风险，正常处理
    };
  }

  /**
   * 评估资源是否应该跳过翻译
   * @param {Object} resource 资源对象
   * @param {string} targetLanguage 目标语言
   * @param {Object} options 评估选项
   * @returns {Promise<Object>} 跳过评估结果
   */
  async evaluateSkip(resource, targetLanguage, options = {}) {
    try {
      const {
        sessionId,
        forceEvaluation = false,
        skipRules = {},
        qualityThreshold = 0.7
      } = options;

      // 检查是否已有有效的翻译
      const existingTranslation = await this._getExistingTranslation(resource.id, targetLanguage);
      
      // 执行各种跳过检查
      const evaluations = await Promise.all([
        this._evaluateContentChange(resource, existingTranslation),
        this._evaluateErrorProneness(resource, targetLanguage),
        this._evaluateQualityHistory(resource, targetLanguage),
        this._evaluateUserRules(resource, targetLanguage, skipRules),
        this._evaluateResourceLock(resource, targetLanguage)
      ]);

      // 综合评估结果
      const skipDecision = this._calculateSkipDecision(evaluations, {
        forceEvaluation,
        qualityThreshold,
        resource,
        targetLanguage
      });

      // 记录跳过决策
      if (skipDecision.shouldSkip) {
        await this._recordSkipDecision(resource.id, targetLanguage, skipDecision, sessionId);
      }

      logger.info('智能跳过评估完成', {
        resourceId: resource.id,
        resourceType: resource.resourceType,
        targetLanguage,
        shouldSkip: skipDecision.shouldSkip,
        reason: skipDecision.reason,
        riskScore: skipDecision.riskScore
      });

      return skipDecision;
    } catch (error) {
      await captureError(error, {
        operation: 'evaluateSkip',
        resourceId: resource.id,
        targetLanguage,
        options
      });
      
      // 评估失败时默认不跳过，但记录风险
      return {
        shouldSkip: false,
        reason: 'EVALUATION_ERROR',
        riskScore: 1.0,
        details: { error: error.message }
      };
    }
  }

  /**
   * 批量评估资源列表的跳过策略
   * @param {Array} resources 资源列表
   * @param {Array} languages 目标语言列表
   * @param {Object} options 批量评估选项
   * @returns {Promise<Map>} 跳过策略映射
   */
  async batchEvaluate(resources, languages, options = {}) {
    const {
      concurrency = 5,
      sessionId,
      progressCallback
    } = options;

    const results = new Map();
    let processed = 0;
    const total = resources.length * languages.length;

    try {
      // 分批处理以避免并发过高
      for (let i = 0; i < resources.length; i += concurrency) {
        const batch = resources.slice(i, i + concurrency);
        
        const batchPromises = batch.flatMap(resource =>
          languages.map(async language => {
            try {
              const result = await this.evaluateSkip(resource, language, { 
                sessionId, 
                ...options 
              });
              
              const key = `${resource.id}_${language}`;
              results.set(key, {
                resourceId: resource.id,
                language,
                ...result
              });

              processed++;
              if (progressCallback) {
                progressCallback(processed, total);
              }
            } catch (error) {
              logger.error('批量跳过评估单项失败', {
                resourceId: resource.id,
                language,
                error: error.message
              });
            }
          })
        );

        await Promise.allSettled(batchPromises);
        
        // 短暂延迟，避免数据库压力过大
        if (i + concurrency < resources.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info('批量跳过评估完成', {
        totalResources: resources.length,
        totalLanguages: languages.length,
        totalEvaluations: total,
        processed,
        skipCount: Array.from(results.values()).filter(r => r.shouldSkip).length
      });

      return results;
    } catch (error) {
      await captureError(error, {
        operation: 'batchEvaluateSkip',
        resourceCount: resources.length,
        languageCount: languages.length,
        options
      });
      throw error;
    }
  }

  /**
   * 更新内容哈希并检测变更
   * @param {string} resourceId 资源ID
   * @param {Object} content 内容对象
   * @returns {Promise<Object>} 变更检测结果
   */
  async updateContentHash(resourceId, content) {
    try {
      // 计算内容哈希
      const contentString = this._serializeContent(content);
      const newHash = crypto.createHash('md5').update(contentString).digest('hex');

      // 获取当前资源信息
      const resource = await prisma.resource.findUnique({
        where: { id: resourceId }
      });

      if (!resource) {
        throw new TranslationError('资源不存在', 'RESOURCE_NOT_FOUND', { resourceId });
      }

      const hasChanged = resource.contentHash !== newHash;
      const newVersion = hasChanged ? resource.contentVersion + 1 : resource.contentVersion;

      // 更新资源哈希和版本
      const updatedResource = await prisma.resource.update({
        where: { id: resourceId },
        data: {
          contentHash: newHash,
          contentVersion: newVersion,
          lastScannedAt: new Date(),
          ...(hasChanged && {
            // 内容变更时，需要重新评估所有翻译
            riskScore: 0, // 重置风险评分
            errorCount: 0 // 重置错误计数
          })
        }
      });

      // 如果内容发生变更，更新相关翻译的源版本状态
      if (hasChanged) {
        await prisma.translation.updateMany({
          where: { resourceId },
          data: {
            sourceVersion: newVersion,
            // 可选：标记为需要重新翻译
            skipReason: null
          }
        });

        logger.info('资源内容变更检测', {
          resourceId,
          oldHash: resource.contentHash,
          newHash,
          versionIncrement: hasChanged,
          newVersion
        });
      }

      return {
        hasChanged,
        oldHash: resource.contentHash,
        newHash,
        oldVersion: resource.contentVersion,
        newVersion,
        needsRetranslation: hasChanged
      };
    } catch (error) {
      await captureError(error, {
        operation: 'updateContentHash',
        resourceId,
        content
      });
      throw error;
    }
  }

  /**
   * 获取跳过统计信息
   * @param {string} shopId 店铺ID
   * @param {Object} filters 过滤条件
   * @returns {Promise<Object>} 跳过统计
   */
  async getSkipStatistics(shopId, filters = {}) {
    try {
      const { 
        timeRange = '7d',
        resourceType,
        language 
      } = filters;

      const timeFilter = this._getTimeFilter(timeRange);
      
      const where = {
        shopId,
        skipReason: { not: null },
        updatedAt: timeFilter,
        ...(resourceType && { 
          resource: { resourceType } 
        })
      };

      const [
        totalSkipped,
        skipReasonBreakdown,
        qualityBasedSkips,
        errorBasedSkips
      ] = await Promise.all([
        // 总跳过数量
        prisma.translation.count({ where }),
        
        // 按跳过原因分组
        prisma.translation.groupBy({
          by: ['skipReason'],
          where,
          _count: true
        }),
        
        // 基于质量的跳过
        prisma.translation.count({
          where: {
            ...where,
            skipReason: 'QUALITY_INSUFFICIENT'
          }
        }),
        
        // 基于错误的跳过
        prisma.translation.count({
          where: {
            ...where,
            skipReason: 'ERROR_PRONE'
          }
        })
      ]);

      // 计算跳过率
      const totalTranslations = await prisma.translation.count({
        where: { shopId, updatedAt: timeFilter }
      });

      const skipRate = totalTranslations > 0 ? (totalSkipped / totalTranslations) : 0;

      return {
        summary: {
          totalSkipped,
          totalTranslations,
          skipRate: Math.round(skipRate * 100) / 100
        },
        breakdown: {
          byReason: skipReasonBreakdown.reduce((acc, item) => {
            acc[item.skipReason] = item._count;
            return acc;
          }, {}),
          qualityBased: qualityBasedSkips,
          errorBased: errorBasedSkips
        },
        timeRange,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      await captureError(error, {
        operation: 'getSkipStatistics',
        shopId,
        filters
      });
      throw error;
    }
  }

  // 私有方法

  /**
   * 获取现有翻译
   * @private
   */
  async _getExistingTranslation(resourceId, language) {
    return await prisma.translation.findFirst({
      where: { resourceId, language },
      include: {
        resource: {
          select: {
            contentVersion: true,
            contentHash: true,
            errorCount: true,
            riskScore: true
          }
        }
      }
    });
  }

  /**
   * 评估内容变更
   * @private
   */
  async _evaluateContentChange(resource, existingTranslation) {
    if (!existingTranslation) {
      return {
        type: 'CONTENT_CHANGE',
        shouldSkip: false,
        reason: 'NO_EXISTING_TRANSLATION',
        score: 0
      };
    }

    // 检查源版本是否匹配
    const isUpToDate = existingTranslation.sourceVersion >= resource.contentVersion;
    
    if (isUpToDate && existingTranslation.status === 'completed') {
      return {
        type: 'CONTENT_CHANGE',
        shouldSkip: true,
        reason: 'ALREADY_TRANSLATED',
        score: 1.0,
        details: {
          sourceVersion: existingTranslation.sourceVersion,
          resourceVersion: resource.contentVersion
        }
      };
    }

    return {
      type: 'CONTENT_CHANGE',
      shouldSkip: false,
      reason: 'CONTENT_UPDATED',
      score: 0.2
    };
  }

  /**
   * 评估错误倾向性
   * @private
   */
  async _evaluateErrorProneness(resource, language) {
    // 查看该资源历史错误记录
    const errorCount = await prisma.errorLog.count({
      where: {
        resourceId: resource.id,
        isTranslationError: true,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天内
        }
      }
    });

    // 查看同类型资源的错误倾向
    const typeErrorRate = await this._getResourceTypeErrorRate(resource.resourceType, resource.shopId);

    const riskScore = Math.min(1.0, (errorCount * 0.1) + (typeErrorRate * 0.3));
    
    if (riskScore > this.riskThresholds.HIGH) {
      return {
        type: 'ERROR_PRONENESS',
        shouldSkip: true,
        reason: 'ERROR_PRONE',
        score: riskScore,
        details: {
          errorCount,
          typeErrorRate: Math.round(typeErrorRate * 100) / 100
        }
      };
    }

    return {
      type: 'ERROR_PRONENESS',
      shouldSkip: false,
      reason: 'LOW_ERROR_RISK',
      score: riskScore
    };
  }

  /**
   * 评估质量历史
   * @private
   */
  async _evaluateQualityHistory(resource, language) {
    // 查看该资源相同语言的历史质量
    const historicalTranslations = await prisma.translation.findMany({
      where: {
        resourceId: resource.id,
        language,
        qualityScore: { gt: 0 }
      },
      select: { qualityScore: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (historicalTranslations.length === 0) {
      return {
        type: 'QUALITY_HISTORY',
        shouldSkip: false,
        reason: 'NO_QUALITY_HISTORY',
        score: 0
      };
    }

    const avgQuality = historicalTranslations.reduce((sum, t) => sum + t.qualityScore, 0) / historicalTranslations.length;

    // 如果历史质量很差，建议跳过
    if (avgQuality < 0.3) {
      return {
        type: 'QUALITY_HISTORY',
        shouldSkip: true,
        reason: 'POOR_QUALITY_HISTORY',
        score: 1.0 - avgQuality,
        details: { avgQuality: Math.round(avgQuality * 100) / 100 }
      };
    }

    return {
      type: 'QUALITY_HISTORY',
      shouldSkip: false,
      reason: 'ACCEPTABLE_QUALITY',
      score: 1.0 - avgQuality
    };
  }

  /**
   * 评估用户自定义规则
   * @private
   */
  async _evaluateUserRules(resource, language, customRules) {
    // 实现用户自定义跳过规则
    const rules = {
      ...customRules,
      // 默认规则
      skipEmptyContent: true,
      skipShortContent: 5, // 少于5个字符
      excludeResourceTypes: [],
      excludeLanguages: [],
      includePatterns: [],
      excludePatterns: []
    };

    // 检查空内容
    if (rules.skipEmptyContent && this._isContentEmpty(resource)) {
      return {
        type: 'USER_RULES',
        shouldSkip: true,
        reason: 'EMPTY_CONTENT',
        score: 1.0
      };
    }

    // 检查内容长度
    if (rules.skipShortContent && this._getContentLength(resource) < rules.skipShortContent) {
      return {
        type: 'USER_RULES',
        shouldSkip: true,
        reason: 'CONTENT_TOO_SHORT',
        score: 0.8,
        details: { contentLength: this._getContentLength(resource) }
      };
    }

    // 检查资源类型排除列表
    if (rules.excludeResourceTypes.includes(resource.resourceType)) {
      return {
        type: 'USER_RULES',
        shouldSkip: true,
        reason: 'RESOURCE_TYPE_EXCLUDED',
        score: 1.0
      };
    }

    // 检查语言排除列表
    if (rules.excludeLanguages.includes(language)) {
      return {
        type: 'USER_RULES',
        shouldSkip: true,
        reason: 'LANGUAGE_EXCLUDED',
        score: 1.0
      };
    }

    return {
      type: 'USER_RULES',
      shouldSkip: false,
      reason: 'RULES_PASSED',
      score: 0
    };
  }

  /**
   * 评估资源锁定状态
   * @private
   */
  async _evaluateResourceLock(resource, language) {
    // 检查是否有正在进行的翻译
    const activeTranslation = await prisma.translation.findFirst({
      where: {
        resourceId: resource.id,
        language,
        status: 'processing'
      }
    });

    if (activeTranslation) {
      return {
        type: 'RESOURCE_LOCK',
        shouldSkip: true,
        reason: 'TRANSLATION_IN_PROGRESS',
        score: 1.0,
        details: { activeTranslationId: activeTranslation.id }
      };
    }

    return {
      type: 'RESOURCE_LOCK',
      shouldSkip: false,
      reason: 'NO_LOCK',
      score: 0
    };
  }

  /**
   * 计算综合跳过决策
   * @private
   */
  _calculateSkipDecision(evaluations, options) {
    const { forceEvaluation, qualityThreshold, resource, targetLanguage } = options;

    // 如果强制评估，忽略大部分跳过建议
    if (forceEvaluation) {
      const criticalSkips = evaluations.filter(e => 
        e.shouldSkip && ['TRANSLATION_IN_PROGRESS', 'RESOURCE_LOCKED'].includes(e.reason)
      );
      
      if (criticalSkips.length > 0) {
        return criticalSkips[0];
      }
    }

    // 查找任何建议跳过的评估
    const skipEvaluations = evaluations.filter(e => e.shouldSkip);
    
    if (skipEvaluations.length > 0) {
      // 按优先级排序跳过原因
      const priorityOrder = {
        'TRANSLATION_IN_PROGRESS': 1,
        'ALREADY_TRANSLATED': 2,
        'RESOURCE_TYPE_EXCLUDED': 3,
        'LANGUAGE_EXCLUDED': 4,
        'ERROR_PRONE': 5,
        'POOR_QUALITY_HISTORY': 6,
        'EMPTY_CONTENT': 7,
        'CONTENT_TOO_SHORT': 8
      };

      skipEvaluations.sort((a, b) => 
        (priorityOrder[a.reason] || 10) - (priorityOrder[b.reason] || 10)
      );

      return skipEvaluations[0];
    }

    // 计算综合风险分数
    const totalScore = evaluations.reduce((sum, e) => sum + (e.score || 0), 0);
    const avgScore = totalScore / evaluations.length;

    return {
      shouldSkip: false,
      reason: 'PROCEED_WITH_TRANSLATION',
      riskScore: avgScore,
      details: {
        evaluations: evaluations.map(e => ({
          type: e.type,
          score: e.score,
          reason: e.reason
        })),
        overallRisk: avgScore > this.riskThresholds.HIGH ? 'HIGH' : 
                     avgScore > this.riskThresholds.MEDIUM ? 'MEDIUM' : 'LOW'
      }
    };
  }

  /**
   * 记录跳过决策
   * @private
   */
  async _recordSkipDecision(resourceId, language, skipDecision, sessionId = null) {
    try {
      await prisma.translation.upsert({
        where: {
          resourceId_language: { resourceId, language }
        },
        update: {
          skipReason: skipDecision.reason,
          skipConditions: JSON.stringify(skipDecision.details || {}),
          updatedAt: new Date(),
          ...(sessionId && { translationSessionId: sessionId })
        },
        create: {
          resourceId,
          language,
          shopId: await this._getShopIdByResourceId(resourceId),
          status: 'pending',
          skipReason: skipDecision.reason,
          skipConditions: JSON.stringify(skipDecision.details || {}),
          ...(sessionId && { translationSessionId: sessionId })
        }
      });
    } catch (error) {
      logger.error('记录跳过决策失败', {
        resourceId,
        language,
        skipDecision: skipDecision.reason,
        error: error.message
      });
    }
  }

  /**
   * 获取资源类型错误率
   * @private
   */
  async _getResourceTypeErrorRate(resourceType, shopId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [totalCount, errorCount] = await Promise.all([
      prisma.translation.count({
        where: {
          shopId,
          resource: { resourceType },
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.translation.count({
        where: {
          shopId,
          resource: { resourceType },
          status: 'failed',
          createdAt: { gte: thirtyDaysAgo }
        }
      })
    ]);

    return totalCount > 0 ? errorCount / totalCount : 0;
  }

  /**
   * 序列化内容用于哈希计算
   * @private
   */
  _serializeContent(content) {
    const relevantFields = [
      'title', 'description', 'descriptionHtml', 'handle',
      'seoTitle', 'seoDescription', 'summary', 'label'
    ];
    
    const serializable = {};
    relevantFields.forEach(field => {
      if (content[field] !== undefined && content[field] !== null) {
        serializable[field] = content[field];
      }
    });

    // 包含contentFields中的数据
    if (content.contentFields) {
      serializable.contentFields = content.contentFields;
    }

    return JSON.stringify(serializable, Object.keys(serializable).sort());
  }

  /**
   * 检查内容是否为空
   * @private
   */
  _isContentEmpty(resource) {
    const contentFields = ['title', 'description', 'descriptionHtml', 'summary'];
    return contentFields.every(field => 
      !resource[field] || resource[field].toString().trim().length === 0
    );
  }

  /**
   * 获取内容长度
   * @private
   */
  _getContentLength(resource) {
    const content = [
      resource.title,
      resource.description,
      resource.descriptionHtml,
      resource.summary
    ].filter(Boolean).join(' ');

    return content.replace(/<[^>]*>/g, '').trim().length; // 去除HTML标签
  }

  /**
   * 根据资源ID获取店铺ID
   * @private
   */
  async _getShopIdByResourceId(resourceId) {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      select: { shopId: true }
    });
    return resource?.shopId;
  }

  /**
   * 获取时间过滤器
   * @private
   */
  _getTimeFilter(timeRange) {
    const now = new Date();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    const duration = ranges[timeRange] || ranges['7d'];
    return { gte: new Date(now - duration) };
  }
}

// 创建单例实例
export const intelligentSkipEngine = new IntelligentSkipEngine();