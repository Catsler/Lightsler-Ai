import { prisma } from '../db.server.js';
import { captureError, TranslationError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';

/**
 * 翻译会话管理器 - 断点续传核心服务
 * 
 * 提供翻译会话的创建、管理、恢复和监控功能
 * 支持批量翻译的中断恢复、进度跟踪、错误处理
 */
export class TranslationSessionManager {
  constructor() {
    this.activeSessions = new Map(); // 内存中的活跃会话缓存
  }

  /**
   * 创建新的翻译会话
   * @param {Object} params 会话参数
   * @returns {Promise<Object>} 创建的会话对象
   */
  async createSession(params) {
    const {
      shopId,
      sessionName,
      sessionType = 'BATCH', // BATCH/INCREMENTAL/RECOVERY/MANUAL
      resourceIds = [],
      resourceTypes = [],
      languages = [],
      translationConfig = {},
      batchSize = 10,
      maxRetries = 3,
      qualityThreshold = 0.7,
      enableManualReview = false
    } = params;

    try {
      // 验证参数
      if (!shopId || !Array.isArray(languages) || languages.length === 0) {
        throw new TranslationError('缺少必要参数', 'INVALID_PARAMS', { shopId, languages });
      }

      // 计算总资源数量
      const totalResources = await this._countResources(shopId, resourceIds, resourceTypes);
      
      if (totalResources === 0) {
        throw new TranslationError('没有找到符合条件的资源', 'NO_RESOURCES', { resourceIds, resourceTypes });
      }

      // 创建会话记录
      const session = await prisma.translationSession.create({
        data: {
          shopId,
          sessionName: sessionName || `${sessionType}_${Date.now()}`,
          sessionType,
          totalResources,
          batchSize,
          maxRetries,
          languages: JSON.stringify(languages),
          resourceTypes: JSON.stringify(resourceTypes),
          translationConfig: JSON.stringify(translationConfig),
          qualityThreshold,
          enableManualReview,
          status: 'PENDING',
          retryDelay: translationConfig.retryDelay || 5000,
          autoRecovery: translationConfig.autoRecovery !== false,
          failureThreshold: translationConfig.failureThreshold || 0.3
        }
      });

      // 添加到活跃会话缓存
      this.activeSessions.set(session.id, {
        ...session,
        startTime: Date.now(),
        lastActivity: Date.now()
      });

      logger.info('翻译会话创建成功', {
        sessionId: session.id,
        shopId,
        sessionType,
        totalResources,
        languages: languages.length
      });

      return session;
    } catch (error) {
      await captureError(error, {
        operation: 'createTranslationSession',
        shopId,
        sessionType,
        resourceIds,
        resourceTypes,
        languages
      });
      throw error;
    }
  }

  /**
   * 启动翻译会话
   * @param {string} sessionId 会话ID
   * @returns {Promise<Object>} 启动结果
   */
  async startSession(sessionId) {
    try {
      const session = await this._getSessionById(sessionId);
      
      if (session.status !== 'PENDING' && session.status !== 'PAUSED') {
        throw new TranslationError('会话状态不允许启动', 'INVALID_SESSION_STATUS', { 
          sessionId, 
          currentStatus: session.status 
        });
      }

      // 更新会话状态
      const updatedSession = await prisma.translationSession.update({
        where: { id: sessionId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          lastCheckpoint: new Date()
        }
      });

      // 更新内存缓存
      this.activeSessions.set(sessionId, {
        ...updatedSession,
        startTime: Date.now(),
        lastActivity: Date.now()
      });

      logger.info('翻译会话启动成功', { sessionId });

      return {
        success: true,
        sessionId,
        status: 'RUNNING',
        message: '翻译会话已启动'
      };
    } catch (error) {
      await captureError(error, {
        operation: 'startTranslationSession',
        sessionId
      });
      throw error;
    }
  }

  /**
   * 暂停翻译会话
   * @param {string} sessionId 会话ID
   * @param {string} reason 暂停原因
   * @returns {Promise<Object>} 暂停结果
   */
  async pauseSession(sessionId, reason = 'USER_REQUEST') {
    try {
      const session = await this._getSessionById(sessionId);
      
      if (session.status !== 'RUNNING') {
        throw new TranslationError('只有运行中的会话可以暂停', 'INVALID_SESSION_STATUS', { 
          sessionId, 
          currentStatus: session.status 
        });
      }

      // 创建当前状态检查点
      const checkpointData = await this._createCheckpoint(sessionId);

      // 更新会话状态
      const updatedSession = await prisma.translationSession.update({
        where: { id: sessionId },
        data: {
          status: 'PAUSED',
          pausedAt: new Date(),
          lastCheckpoint: new Date(),
          resumeData: JSON.stringify({
            pauseReason: reason,
            checkpoint: checkpointData,
            pausedAt: Date.now()
          })
        }
      });

      // 从活跃会话中移除
      this.activeSessions.delete(sessionId);

      logger.info('翻译会话暂停成功', { sessionId, reason });

      return {
        success: true,
        sessionId,
        status: 'PAUSED',
        reason,
        checkpoint: checkpointData
      };
    } catch (error) {
      await captureError(error, {
        operation: 'pauseTranslationSession',
        sessionId,
        reason
      });
      throw error;
    }
  }

  /**
   * 恢复翻译会话
   * @param {string} sessionId 会话ID
   * @returns {Promise<Object>} 恢复结果
   */
  async resumeSession(sessionId) {
    try {
      const session = await this._getSessionById(sessionId);
      
      if (session.status !== 'PAUSED') {
        throw new TranslationError('只有暂停的会话可以恢复', 'INVALID_SESSION_STATUS', { 
          sessionId, 
          currentStatus: session.status 
        });
      }

      // 解析恢复数据
      const resumeData = session.resumeData ? JSON.parse(session.resumeData) : {};
      
      // 验证会话状态
      const validationResult = await this._validateSessionForResume(sessionId);
      
      if (!validationResult.isValid) {
        throw new TranslationError('会话状态验证失败，无法恢复', 'SESSION_VALIDATION_FAILED', { 
          sessionId, 
          issues: validationResult.issues 
        });
      }

      // 更新会话状态
      const updatedSession = await prisma.translationSession.update({
        where: { id: sessionId },
        data: {
          status: 'RUNNING',
          pausedAt: null,
          lastCheckpoint: new Date()
        }
      });

      // 添加到活跃会话缓存
      this.activeSessions.set(sessionId, {
        ...updatedSession,
        startTime: Date.now(),
        lastActivity: Date.now(),
        resumedFrom: resumeData.checkpoint || {}
      });

      logger.info('翻译会话恢复成功', { 
        sessionId, 
        pauseDuration: Date.now() - (resumeData.pausedAt || Date.now()) 
      });

      return {
        success: true,
        sessionId,
        status: 'RUNNING',
        resumeData: validationResult.resumeInfo
      };
    } catch (error) {
      await captureError(error, {
        operation: 'resumeTranslationSession',
        sessionId
      });
      throw error;
    }
  }

  /**
   * 更新会话进度
   * @param {string} sessionId 会话ID
   * @param {Object} progress 进度信息
   * @returns {Promise<void>}
   */
  async updateProgress(sessionId, progress) {
    const {
      processedCount,
      succeededCount,
      failedCount,
      skippedCount,
      currentBatch,
      averageQuality,
      throughputPerMinute,
      errorRate
    } = progress;

    try {
      // 更新数据库记录
      await prisma.translationSession.update({
        where: { id: sessionId },
        data: {
          processedCount: processedCount || undefined,
          succeededCount: succeededCount || undefined,
          failedCount: failedCount || undefined,
          skippedCount: skippedCount || undefined,
          currentBatch: currentBatch || undefined,
          averageQuality: averageQuality || undefined,
          throughputPerMinute: throughputPerMinute || undefined,
          errorRate: errorRate || undefined,
          lastCheckpoint: new Date()
        }
      });

      // 更新内存缓存
      const cachedSession = this.activeSessions.get(sessionId);
      if (cachedSession) {
        Object.assign(cachedSession, progress, { lastActivity: Date.now() });
        this.activeSessions.set(sessionId, cachedSession);
      }

      // 检查是否需要自动暂停（错误率过高）
      if (errorRate && errorRate > 0.5) {
        logger.warn('会话错误率过高，考虑暂停', { sessionId, errorRate });
        // 可以在这里实现自动暂停逻辑
      }

    } catch (error) {
      await captureError(error, {
        operation: 'updateSessionProgress',
        sessionId,
        progress
      });
      // 进度更新失败不应该影响翻译流程，只记录错误
      logger.error('更新会话进度失败', { sessionId, error: error.message });
    }
  }

  /**
   * 完成翻译会话
   * @param {string} sessionId 会话ID
   * @param {Object} finalStats 最终统计
   * @returns {Promise<Object>} 完成结果
   */
  async completeSession(sessionId, finalStats = {}) {
    try {
      const session = await this._getSessionById(sessionId);
      
      // 计算会话总耗时
      const duration = session.startedAt ? Date.now() - session.startedAt.getTime() : 0;

      // 更新会话状态
      const updatedSession = await prisma.translationSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          ...finalStats
        }
      });

      // 从活跃会话中移除
      this.activeSessions.delete(sessionId);

      // 生成会话报告
      const report = await this._generateSessionReport(sessionId);

      logger.info('翻译会话完成', { 
        sessionId, 
        duration: Math.round(duration / 1000),
        finalStats 
      });

      return {
        success: true,
        sessionId,
        status: 'COMPLETED',
        duration,
        report
      };
    } catch (error) {
      await captureError(error, {
        operation: 'completeTranslationSession',
        sessionId,
        finalStats
      });
      throw error;
    }
  }

  /**
   * 获取会话状态
   * @param {string} sessionId 会话ID
   * @returns {Promise<Object>} 会话状态信息
   */
  async getSessionStatus(sessionId) {
    try {
      const session = await this._getSessionById(sessionId, true); // 包含关联数据

      // 计算实时进度
      const progress = this._calculateProgress(session);

      // 获取最近错误
      const recentErrors = await prisma.errorLog.findMany({
        where: {
          translationSessionId: sessionId
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          errorType: true,
          message: true,
          severity: true,
          createdAt: true
        }
      });

      return {
        sessionId: session.id,
        status: session.status,
        progress,
        statistics: {
          totalResources: session.totalResources,
          processedCount: session.processedCount,
          succeededCount: session.succeededCount,
          failedCount: session.failedCount,
          skippedCount: session.skippedCount,
          averageQuality: session.averageQuality,
          errorRate: session.errorRate
        },
        timing: {
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          pausedAt: session.pausedAt,
          completedAt: session.completedAt,
          lastCheckpoint: session.lastCheckpoint
        },
        recentErrors
      };
    } catch (error) {
      await captureError(error, {
        operation: 'getSessionStatus',
        sessionId
      });
      throw error;
    }
  }

  /**
   * 获取店铺的所有会话
   * @param {string} shopId 店铺ID
   * @param {Object} filters 过滤条件
   * @returns {Promise<Array>} 会话列表
   */
  async getShopSessions(shopId, filters = {}) {
    try {
      const { status, sessionType, limit = 50, offset = 0 } = filters;

      const where = {
        shopId,
        ...(status && { status }),
        ...(sessionType && { sessionType })
      };

      const sessions = await prisma.translationSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          sessionName: true,
          sessionType: true,
          status: true,
          totalResources: true,
          processedCount: true,
          succeededCount: true,
          failedCount: true,
          skippedCount: true,
          averageQuality: true,
          errorRate: true,
          createdAt: true,
          startedAt: true,
          completedAt: true
        }
      });

      return sessions;
    } catch (error) {
      await captureError(error, {
        operation: 'getShopSessions',
        shopId,
        filters
      });
      throw error;
    }
  }

  // 私有方法

  /**
   * 根据ID获取会话
   * @private
   */
  async _getSessionById(sessionId, includeRelations = false) {
    const session = await prisma.translationSession.findUnique({
      where: { id: sessionId },
      ...(includeRelations && {
        include: {
          translations: {
            select: { id: true, status: true, qualityScore: true }
          },
          errorLogs: {
            select: { id: true, errorType: true, severity: true }
          }
        }
      })
    });

    if (!session) {
      throw new TranslationError('翻译会话不存在', 'SESSION_NOT_FOUND', { sessionId });
    }

    return session;
  }

  /**
   * 统计资源数量
   * @private
   */
  async _countResources(shopId, resourceIds = [], resourceTypes = []) {
    const where = {
      shopId,
      ...(resourceIds.length > 0 && { id: { in: resourceIds } }),
      ...(resourceTypes.length > 0 && { resourceType: { in: resourceTypes } })
    };

    return await prisma.resource.count({ where });
  }

  /**
   * 创建检查点
   * @private
   */
  async _createCheckpoint(sessionId) {
    const session = await this._getSessionById(sessionId, true);

    return {
      timestamp: Date.now(),
      processedCount: session.processedCount,
      currentBatch: session.currentBatch,
      pendingTranslations: session.translations.filter(t => t.status === 'pending').length,
      failedTranslations: session.translations.filter(t => t.status === 'failed').map(t => t.id),
      avgQuality: session.averageQuality,
      errorCount: session.errorLogs.length
    };
  }

  /**
   * 验证会话是否可以恢复
   * @private
   */
  async _validateSessionForResume(sessionId) {
    const issues = [];
    
    try {
      const session = await this._getSessionById(sessionId);

      // 检查资源是否仍然存在
      const resourceCount = await prisma.resource.count({
        where: { shopId: session.shopId }
      });
      
      if (resourceCount === 0) {
        issues.push('没有找到可翻译的资源');
      }

      // 检查是否有过多的失败记录
      if (session.failedCount > session.totalResources * 0.5) {
        issues.push('失败记录过多，建议重新创建会话');
      }

      // 检查会话是否过期（超过7天）
      const daysSinceCreated = (Date.now() - session.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated > 7) {
        issues.push('会话已过期，建议重新创建');
      }

      return {
        isValid: issues.length === 0,
        issues,
        resumeInfo: {
          resourceCount,
          daysSinceCreated: Math.round(daysSinceCreated),
          canResume: issues.length === 0
        }
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [`验证过程出错: ${error.message}`],
        resumeInfo: {}
      };
    }
  }

  /**
   * 计算会话进度
   * @private
   */
  _calculateProgress(session) {
    const total = session.totalResources || 1;
    const processed = session.processedCount || 0;
    const percentage = Math.round((processed / total) * 100);

    return {
      total,
      processed,
      remaining: total - processed,
      percentage,
      successRate: session.succeededCount ? (session.succeededCount / processed) : 0,
      errorRate: session.errorRate || 0,
      averageQuality: session.averageQuality || 0
    };
  }

  /**
   * 生成会话报告
   * @private
   */
  async _generateSessionReport(sessionId) {
    const session = await this._getSessionById(sessionId, true);
    
    const duration = session.completedAt && session.startedAt 
      ? session.completedAt.getTime() - session.startedAt.getTime() 
      : 0;

    return {
      sessionId: session.id,
      sessionName: session.sessionName,
      sessionType: session.sessionType,
      summary: {
        totalResources: session.totalResources,
        processedCount: session.processedCount,
        successRate: session.processedCount ? (session.succeededCount / session.processedCount) : 0,
        averageQuality: session.averageQuality,
        duration: Math.round(duration / 1000), // 秒
        throughput: duration > 0 ? (session.processedCount / (duration / 60000)) : 0 // 每分钟处理量
      },
      breakdown: {
        succeeded: session.succeededCount,
        failed: session.failedCount,
        skipped: session.skippedCount
      },
      qualityMetrics: {
        averageScore: session.averageQuality,
        highQuality: session.translations?.filter(t => t.qualityScore > 0.8).length || 0,
        lowQuality: session.translations?.filter(t => t.qualityScore < 0.5).length || 0
      },
      errorSummary: {
        totalErrors: session.errorLogs?.length || 0,
        criticalErrors: session.errorLogs?.filter(e => e.severity >= 4).length || 0,
        commonErrors: this._getCommonErrorTypes(session.errorLogs || [])
      }
    };
  }

  /**
   * 获取常见错误类型
   * @private
   */
  _getCommonErrorTypes(errorLogs) {
    const errorCounts = {};
    errorLogs.forEach(error => {
      errorCounts[error.errorType] = (errorCounts[error.errorType] || 0) + 1;
    });

    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }
}

// 创建单例实例
export const translationSessionManager = new TranslationSessionManager();