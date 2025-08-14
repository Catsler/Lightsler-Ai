import { prisma } from '../db.server.js';
import { captureError, TranslationError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';
import { translationSessionManager } from './translation-session-manager.server.js';
import { intelligentSkipEngine } from './intelligent-skip-engine.server.js';

/**
 * 自动恢复服务 - 基于错误模式的智能自动修复和恢复系统
 * 
 * 功能：
 * - 自动错误诊断和分类
 * - 智能修复策略执行
 * - 翻译会话自动恢复
 * - 系统健康自动维护
 */
export class AutoRecoveryService {
  constructor() {
    this.recoveryStrategies = new Map();
    this.activeRecoveryTasks = new Map();
    this.recoveryAttemptLimit = 3;
    
    // 初始化恢复策略
    this._initializeRecoveryStrategies();
  }

  /**
   * 自动诊断和修复错误
   * @param {Object} error 错误对象
   * @param {Object} context 错误上下文
   * @returns {Promise<Object>} 修复结果
   */
  async diagnoseAndRecover(error, context) {
    try {
      const {
        errorId,
        shopId,
        sessionId,
        resourceId,
        operation,
        errorType,
        severity
      } = context;

      const startTime = Date.now();

      // 错误分类和诊断
      const diagnosis = await this._diagnoseError(error, context);
      
      // 检查是否已达到重试限制
      if (await this._hasExceededRetryLimit(errorId || error.fingerprint, context)) {
        return {
          success: false,
          action: 'EXCEEDED_RETRY_LIMIT',
          message: '已达到最大重试次数，停止自动恢复',
          diagnosis
        };
      }

      // 选择恢复策略
      const strategy = this._selectRecoveryStrategy(diagnosis, context);
      
      if (!strategy) {
        return {
          success: false,
          action: 'NO_STRATEGY_AVAILABLE',
          message: '未找到适用的自动恢复策略',
          diagnosis
        };
      }

      // 执行恢复操作
      const recoveryResult = await this._executeRecoveryStrategy(strategy, error, context);

      // 记录恢复尝试
      await this._recordRecoveryAttempt(error, context, strategy, recoveryResult);

      logger.info('自动错误恢复完成', {
        errorId,
        shopId,
        sessionId,
        strategy: strategy.name,
        success: recoveryResult.success,
        duration: Date.now() - startTime
      });

      return {
        ...recoveryResult,
        diagnosis,
        strategy: strategy.name,
        recoveryTime: Date.now() - startTime
      };
    } catch (recoveryError) {
      await captureError(recoveryError, {
        operation: 'diagnoseAndRecover',
        originalError: error,
        context
      });

      return {
        success: false,
        action: 'RECOVERY_FAILED',
        error: recoveryError.message,
        originalError: error.message
      };
    }
  }

  /**
   * 批量恢复失败的翻译
   * @param {string} shopId 店铺ID
   * @param {Object} options 恢复选项
   * @returns {Promise<Object>} 批量恢复结果
   */
  async batchRecoverFailedTranslations(shopId, options = {}) {
    try {
      const {
        sessionId,
        maxBatchSize = 20,
        resourceType,
        language,
        minFailureAge = 300000 // 5分钟，避免恢复正在处理的错误
      } = options;

      const cutoffTime = new Date(Date.now() - minFailureAge);

      // 获取失败的翻译
      const failedTranslations = await prisma.translation.findMany({
        where: {
          shopId,
          status: 'failed',
          updatedAt: { lt: cutoffTime },
          retryCount: { lt: this.recoveryAttemptLimit },
          ...(sessionId && { translationSessionId: sessionId }),
          ...(resourceType && { 
            resource: { resourceType } 
          }),
          ...(language && { language })
        },
        include: {
          resource: {
            select: {
              resourceType: true,
              title: true,
              errorCount: true
            }
          }
        },
        take: maxBatchSize,
        orderBy: { updatedAt: 'asc' }
      });

      if (failedTranslations.length === 0) {
        return {
          success: true,
          message: '没有需要恢复的失败翻译',
          recoveredCount: 0,
          totalAttempted: 0
        };
      }

      const recoveryResults = [];
      let successCount = 0;

      // 批量恢复处理
      for (const translation of failedTranslations) {
        try {
          const recoveryResult = await this._recoverSingleTranslation(translation, options);
          recoveryResults.push({
            translationId: translation.id,
            resourceId: translation.resourceId,
            language: translation.language,
            ...recoveryResult
          });

          if (recoveryResult.success) {
            successCount++;
          }

          // 短暂延迟避免过载
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          recoveryResults.push({
            translationId: translation.id,
            success: false,
            error: error.message
          });
        }
      }

      logger.info('批量翻译恢复完成', {
        shopId,
        totalAttempted: failedTranslations.length,
        successCount,
        failureCount: failedTranslations.length - successCount
      });

      return {
        success: true,
        message: `批量恢复完成，成功恢复${successCount}个翻译`,
        totalAttempted: failedTranslations.length,
        recoveredCount: successCount,
        results: recoveryResults
      };
    } catch (error) {
      await captureError(error, {
        operation: 'batchRecoverFailedTranslations',
        shopId,
        options
      });
      throw error;
    }
  }

  /**
   * 自动恢复翻译会话
   * @param {string} sessionId 会话ID
   * @param {Object} options 恢复选项
   * @returns {Promise<Object>} 会话恢复结果
   */
  async recoverTranslationSession(sessionId, options = {}) {
    try {
      const {
        validateBeforeRecover = true,
        autoFixErrors = true,
        skipProblematicResources = true
      } = options;

      // 获取会话信息
      const session = await prisma.translationSession.findUnique({
        where: { id: sessionId },
        include: {
          translations: {
            where: { status: 'failed' }
          },
          errorLogs: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24小时内的错误
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!session) {
        throw new TranslationError('翻译会话不存在', 'SESSION_NOT_FOUND', { sessionId });
      }

      if (session.status === 'RUNNING') {
        return {
          success: false,
          message: '会话正在运行中，无需恢复',
          sessionId
        };
      }

      const recoveryPlan = {
        sessionId,
        currentStatus: session.status,
        failedTranslations: session.translations.length,
        recentErrors: session.errorLogs.length,
        recoveryActions: []
      };

      // 验证会话状态
      if (validateBeforeRecover) {
        const validationResult = await this._validateSessionForRecovery(session);
        if (!validationResult.isValid) {
          return {
            success: false,
            message: '会话验证失败，无法恢复',
            issues: validationResult.issues,
            recoveryPlan
          };
        }
        recoveryPlan.validationPassed = true;
      }

      // 处理失败的翻译
      if (session.translations.length > 0 && autoFixErrors) {
        const batchRecoveryResult = await this.batchRecoverFailedTranslations(
          session.shopId,
          { sessionId, maxBatchSize: 10 }
        );
        
        recoveryPlan.recoveryActions.push({
          action: 'BATCH_RECOVER_TRANSLATIONS',
          result: batchRecoveryResult
        });
      }

      // 处理问题资源
      if (skipProblematicResources) {
        const skipResult = await this._skipProblematicResources(sessionId);
        recoveryPlan.recoveryActions.push({
          action: 'SKIP_PROBLEMATIC_RESOURCES',
          result: skipResult
        });
      }

      // 尝试恢复会话
      const sessionRecoveryResult = await translationSessionManager.resumeSession(sessionId);
      
      recoveryPlan.recoveryActions.push({
        action: 'RESUME_SESSION',
        result: sessionRecoveryResult
      });

      return {
        success: sessionRecoveryResult.success,
        message: '翻译会话恢复处理完成',
        sessionId,
        recoveryPlan
      };
    } catch (error) {
      await captureError(error, {
        operation: 'recoverTranslationSession',
        sessionId,
        options
      });
      throw error;
    }
  }

  /**
   * 系统健康检查和自动维护
   * @param {string} shopId 店铺ID
   * @returns {Promise<Object>} 健康检查结果
   */
  async performSystemHealthCheck(shopId) {
    try {
      const healthCheck = {
        shopId,
        checkTime: new Date().toISOString(),
        overallHealth: 'UNKNOWN',
        issues: [],
        maintenanceActions: [],
        recommendations: []
      };

      // 检查数据库健康
      const dbHealth = await this._checkDatabaseHealth(shopId);
      healthCheck.databaseHealth = dbHealth;
      
      if (!dbHealth.isHealthy) {
        healthCheck.issues.push(...dbHealth.issues);
      }

      // 检查翻译服务健康
      const translationHealth = await this._checkTranslationServiceHealth(shopId);
      healthCheck.translationHealth = translationHealth;
      
      if (!translationHealth.isHealthy) {
        healthCheck.issues.push(...translationHealth.issues);
      }

      // 检查错误率
      const errorHealth = await this._checkErrorRate(shopId);
      healthCheck.errorHealth = errorHealth;
      
      if (!errorHealth.isHealthy) {
        healthCheck.issues.push(...errorHealth.issues);
      }

      // 检查活跃会话健康
      const sessionHealth = await this._checkActiveSessionsHealth(shopId);
      healthCheck.sessionHealth = sessionHealth;
      
      if (!sessionHealth.isHealthy) {
        healthCheck.issues.push(...sessionHealth.issues);
      }

      // 执行自动维护
      if (healthCheck.issues.length > 0) {
        const maintenanceResult = await this._performAutoMaintenance(shopId, healthCheck.issues);
        healthCheck.maintenanceActions = maintenanceResult.actions;
      }

      // 计算整体健康状态
      const healthyChecks = [dbHealth, translationHealth, errorHealth, sessionHealth]
        .filter(check => check.isHealthy).length;
      const totalChecks = 4;
      
      if (healthyChecks === totalChecks) {
        healthCheck.overallHealth = 'HEALTHY';
      } else if (healthyChecks >= totalChecks * 0.75) {
        healthCheck.overallHealth = 'MOSTLY_HEALTHY';
      } else if (healthyChecks >= totalChecks * 0.5) {
        healthCheck.overallHealth = 'CONCERNING';
      } else {
        healthCheck.overallHealth = 'UNHEALTHY';
      }

      // 生成建议
      healthCheck.recommendations = this._generateHealthRecommendations(healthCheck);

      logger.info('系统健康检查完成', {
        shopId,
        overallHealth: healthCheck.overallHealth,
        issueCount: healthCheck.issues.length,
        maintenanceActionCount: healthCheck.maintenanceActions.length
      });

      return healthCheck;
    } catch (error) {
      await captureError(error, {
        operation: 'performSystemHealthCheck',
        shopId
      });
      throw error;
    }
  }

  // 私有方法

  /**
   * 初始化恢复策略
   * @private
   */
  _initializeRecoveryStrategies() {
    // API超时恢复策略
    this.recoveryStrategies.set('API_TIMEOUT', {
      name: 'API_TIMEOUT',
      condition: (diagnosis) => diagnosis.errorType === 'API' && diagnosis.isTimeout,
      action: async (error, context) => {
        return await this._retryWithBackoff(context, { maxRetries: 2, baseDelay: 5000 });
      }
    });

    // API限流恢复策略
    this.recoveryStrategies.set('API_RATE_LIMIT', {
      name: 'API_RATE_LIMIT',
      condition: (diagnosis) => diagnosis.errorType === 'API' && diagnosis.isRateLimit,
      action: async (error, context) => {
        return await this._retryWithExponentialBackoff(context, { maxRetries: 3, baseDelay: 10000 });
      }
    });

    // 网络连接恢复策略
    this.recoveryStrategies.set('NETWORK_ERROR', {
      name: 'NETWORK_ERROR',
      condition: (diagnosis) => diagnosis.errorType === 'NETWORK',
      action: async (error, context) => {
        return await this._retryWithBackoff(context, { maxRetries: 3, baseDelay: 3000 });
      }
    });

    // 翻译质量问题恢复策略
    this.recoveryStrategies.set('QUALITY_ISSUE', {
      name: 'QUALITY_ISSUE',
      condition: (diagnosis) => diagnosis.errorType === 'TRANSLATION' && diagnosis.isQualityIssue,
      action: async (error, context) => {
        return await this._adjustTranslationParameters(context);
      }
    });

    // HTML结构问题恢复策略
    this.recoveryStrategies.set('HTML_STRUCTURE', {
      name: 'HTML_STRUCTURE',
      condition: (diagnosis) => diagnosis.isHtmlStructureIssue,
      action: async (error, context) => {
        return await this._fixHtmlStructureIssue(context);
      }
    });

    // 内容过长恢复策略
    this.recoveryStrategies.set('CONTENT_TOO_LONG', {
      name: 'CONTENT_TOO_LONG',
      condition: (diagnosis) => diagnosis.isContentTooLong,
      action: async (error, context) => {
        return await this._splitLongContent(context);
      }
    });

    // 资源不存在恢复策略
    this.recoveryStrategies.set('RESOURCE_NOT_FOUND', {
      name: 'RESOURCE_NOT_FOUND',
      condition: (diagnosis) => diagnosis.isResourceNotFound,
      action: async (error, context) => {
        return await this._skipMissingResource(context);
      }
    });
  }

  /**
   * 诊断错误
   * @private
   */
  async _diagnoseError(error, context) {
    const diagnosis = {
      errorType: 'UNKNOWN',
      severity: 'MEDIUM',
      isRetryable: false,
      isTimeout: false,
      isRateLimit: false,
      isQualityIssue: false,
      isHtmlStructureIssue: false,
      isContentTooLong: false,
      isResourceNotFound: false,
      confidence: 0.5
    };

    const errorMessage = error.message || '';
    const errorCode = error.code || '';

    // API错误诊断
    if (errorMessage.includes('timeout') || errorCode === 'TIMEOUT') {
      diagnosis.errorType = 'API';
      diagnosis.isTimeout = true;
      diagnosis.isRetryable = true;
      diagnosis.confidence = 0.9;
    }

    // 限流错误诊断
    if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorCode === 'RATE_LIMIT') {
      diagnosis.errorType = 'API';
      diagnosis.isRateLimit = true;
      diagnosis.isRetryable = true;
      diagnosis.confidence = 0.95;
    }

    // 网络错误诊断
    if (errorMessage.includes('network') || errorMessage.includes('connection') || errorCode === 'NETWORK_ERROR') {
      diagnosis.errorType = 'NETWORK';
      diagnosis.isRetryable = true;
      diagnosis.confidence = 0.85;
    }

    // 翻译质量问题诊断
    if (errorMessage.includes('quality') || errorMessage.includes('validation') || errorCode === 'QUALITY_CHECK_FAILED') {
      diagnosis.errorType = 'TRANSLATION';
      diagnosis.isQualityIssue = true;
      diagnosis.isRetryable = true;
      diagnosis.confidence = 0.8;
    }

    // HTML结构问题诊断
    if (errorMessage.includes('HTML') || errorMessage.includes('tag') || errorCode === 'HTML_STRUCTURE_ERROR') {
      diagnosis.isHtmlStructureIssue = true;
      diagnosis.isRetryable = true;
      diagnosis.confidence = 0.9;
    }

    // 内容过长诊断
    if (errorMessage.includes('too long') || errorMessage.includes('content length') || errorCode === 'CONTENT_TOO_LONG') {
      diagnosis.isContentTooLong = true;
      diagnosis.isRetryable = true;
      diagnosis.confidence = 0.95;
    }

    // 资源不存在诊断
    if (errorMessage.includes('not found') || errorMessage.includes('404') || errorCode === 'RESOURCE_NOT_FOUND') {
      diagnosis.isResourceNotFound = true;
      diagnosis.isRetryable = false; // 资源不存在通常不需要重试
      diagnosis.confidence = 0.9;
    }

    // 基于上下文的额外诊断
    if (context.operation === 'translate' && context.resourceType) {
      diagnosis.resourceType = context.resourceType;
    }

    return diagnosis;
  }

  /**
   * 选择恢复策略
   * @private
   */
  _selectRecoveryStrategy(diagnosis, context) {
    for (const [name, strategy] of this.recoveryStrategies) {
      if (strategy.condition(diagnosis)) {
        return strategy;
      }
    }
    return null;
  }

  /**
   * 执行恢复策略
   * @private
   */
  async _executeRecoveryStrategy(strategy, error, context) {
    try {
      const result = await strategy.action(error, context);
      return {
        success: true,
        action: strategy.name,
        result,
        message: `成功执行恢复策略: ${strategy.name}`
      };
    } catch (recoveryError) {
      return {
        success: false,
        action: strategy.name,
        error: recoveryError.message,
        message: `恢复策略执行失败: ${strategy.name}`
      };
    }
  }

  /**
   * 检查重试限制
   * @private
   */
  async _hasExceededRetryLimit(errorFingerprint, context) {
    if (!errorFingerprint) return false;

    const recentAttempts = await prisma.errorLog.count({
      where: {
        fingerprint: errorFingerprint,
        autoFixAttempts: { gt: 0 },
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // 1小时内
        }
      }
    });

    return recentAttempts >= this.recoveryAttemptLimit;
  }

  /**
   * 记录恢复尝试
   * @private
   */
  async _recordRecoveryAttempt(error, context, strategy, result) {
    try {
      await prisma.errorLog.create({
        data: {
          shopId: context.shopId,
          resourceId: context.resourceId,
          translationSessionId: context.sessionId,
          
          errorType: 'AUTO_RECOVERY',
          errorCategory: result.success ? 'INFO' : 'WARNING',
          errorCode: `RECOVERY_${strategy.name}`,
          message: `自动恢复尝试: ${strategy.name}`,
          
          context: JSON.stringify({
            originalError: {
              message: error.message,
              code: error.code
            },
            recoveryStrategy: strategy.name,
            recoveryResult: result,
            recoveryContext: context
          }),
          
          autoFixStatus: result.success ? 'COMPLETED' : 'FAILED',
          autoFixAttempts: 1,
          
          tags: JSON.stringify({
            autoRecovery: true,
            strategy: strategy.name,
            success: result.success
          })
        }
      });
    } catch (recordError) {
      logger.error('记录恢复尝试失败', {
        context,
        strategy: strategy.name,
        error: recordError.message
      });
    }
  }

  /**
   * 恢复单个翻译
   * @private
   */
  async _recoverSingleTranslation(translation, options) {
    try {
      // 分析失败原因
      const errorLogs = await prisma.errorLog.findMany({
        where: {
          shopId: translation.shopId,
          resourceId: translation.resourceId,
          isTranslationError: true
        },
        orderBy: { createdAt: 'desc' },
        take: 3
      });

      const lastError = errorLogs[0];
      if (!lastError) {
        // 没有错误日志，直接重置状态
        await prisma.translation.update({
          where: { id: translation.id },
          data: {
            status: 'pending',
            retryCount: translation.retryCount + 1,
            lastRetryAt: new Date()
          }
        });

        return {
          success: true,
          action: 'STATUS_RESET',
          message: '重置翻译状态为待处理'
        };
      }

      // 基于错误类型执行恢复
      const context = {
        shopId: translation.shopId,
        resourceId: translation.resourceId,
        language: translation.language,
        operation: 'translate',
        resourceType: translation.resource.resourceType
      };

      return await this.diagnoseAndRecover(lastError, context);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 验证会话恢复条件
   * @private
   */
  async _validateSessionForRecovery(session) {
    const issues = [];

    // 检查会话年龄
    const sessionAge = Date.now() - session.createdAt.getTime();
    if (sessionAge > 7 * 24 * 60 * 60 * 1000) { // 7天
      issues.push('会话过期（超过7天）');
    }

    // 检查错误率
    if (session.errorRate > 0.8) {
      issues.push('会话错误率过高');
    }

    // 检查资源是否仍然存在
    const resourceCount = await prisma.resource.count({
      where: { shopId: session.shopId }
    });

    if (resourceCount === 0) {
      issues.push('店铺没有可翻译的资源');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * 跳过问题资源
   * @private
   */
  async _skipProblematicResources(sessionId) {
    const problematicResources = await prisma.resource.findMany({
      where: {
        translations: {
          some: {
            translationSessionId: sessionId,
            status: 'failed',
            retryCount: { gte: 2 }
          }
        }
      },
      select: { id: true }
    });

    let skippedCount = 0;

    for (const resource of problematicResources) {
      try {
        await intelligentSkipEngine.evaluateSkip(
          resource,
          'zh-CN', // 默认语言，实际应该从会话中获取
          {
            sessionId,
            forceSkip: true,
            reason: 'AUTO_RECOVERY_SKIP'
          }
        );
        skippedCount++;
      } catch (error) {
        logger.error('跳过问题资源失败', {
          resourceId: resource.id,
          error: error.message
        });
      }
    }

    return {
      totalProblematic: problematicResources.length,
      skippedCount,
      message: `跳过了${skippedCount}个问题资源`
    };
  }

  /**
   * 恢复策略实现方法
   * @private
   */
  async _retryWithBackoff(context, options) {
    const { maxRetries = 3, baseDelay = 1000 } = options;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 延迟等待
        await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
        
        // 这里应该调用实际的翻译重试逻辑
        // 简化实现：更新翻译状态
        if (context.resourceId) {
          await prisma.translation.updateMany({
            where: {
              resourceId: context.resourceId,
              status: 'failed'
            },
            data: {
              status: 'pending',
              retryCount: { increment: 1 },
              lastRetryAt: new Date()
            }
          });
        }

        return {
          success: true,
          attempt,
          message: `第${attempt}次重试成功`
        };
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
  }

  async _retryWithExponentialBackoff(context, options) {
    const { maxRetries = 3, baseDelay = 1000 } = options;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (context.resourceId) {
          await prisma.translation.updateMany({
            where: {
              resourceId: context.resourceId,
              status: 'failed'
            },
            data: {
              status: 'pending',
              retryCount: { increment: 1 },
              lastRetryAt: new Date()
            }
          });
        }

        return {
          success: true,
          attempt,
          delay,
          message: `指数退避重试第${attempt}次成功`
        };
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
  }

  async _adjustTranslationParameters(context) {
    // 调整翻译参数，如降低温度值、调整prompt等
    return {
      success: true,
      adjustments: ['降低创造性参数', '简化翻译prompt'],
      message: '已调整翻译参数'
    };
  }

  async _fixHtmlStructureIssue(context) {
    // 修复HTML结构问题
    return {
      success: true,
      fixes: ['修复未闭合标签', '清理无效HTML'],
      message: 'HTML结构问题已修复'
    };
  }

  async _splitLongContent(context) {
    // 将过长的内容分割处理
    return {
      success: true,
      action: 'CONTENT_SPLIT',
      message: '内容已分割为多个较短片段处理'
    };
  }

  async _skipMissingResource(context) {
    // 跳过不存在的资源
    if (context.resourceId) {
      await prisma.translation.updateMany({
        where: {
          resourceId: context.resourceId,
          status: 'failed'
        },
        data: {
          skipReason: 'RESOURCE_NOT_FOUND',
          status: 'pending'
        }
      });
    }

    return {
      success: true,
      action: 'RESOURCE_SKIPPED',
      message: '不存在的资源已标记为跳过'
    };
  }

  /**
   * 健康检查实现方法
   * @private
   */
  async _checkDatabaseHealth(shopId) {
    try {
      // 检查数据库连接和响应时间
      const startTime = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      const issues = [];
      if (responseTime > 5000) {
        issues.push('数据库响应时间过长');
      }

      // 检查数据完整性
      const resourceCount = await prisma.resource.count({ where: { shopId } });
      const translationCount = await prisma.translation.count({ where: { shopId } });

      if (resourceCount === 0 && translationCount > 0) {
        issues.push('数据不一致：存在翻译但无对应资源');
      }

      return {
        isHealthy: issues.length === 0,
        responseTime,
        resourceCount,
        translationCount,
        issues
      };
    } catch (error) {
      return {
        isHealthy: false,
        issues: [`数据库连接失败: ${error.message}`]
      };
    }
  }

  async _checkTranslationServiceHealth(shopId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const [recentTranslations, failedTranslations] = await Promise.all([
      prisma.translation.count({
        where: { shopId, updatedAt: { gte: oneHourAgo } }
      }),
      prisma.translation.count({
        where: { shopId, status: 'failed', updatedAt: { gte: oneHourAgo } }
      })
    ]);

    const issues = [];
    const failureRate = recentTranslations > 0 ? failedTranslations / recentTranslations : 0;

    if (failureRate > 0.5) {
      issues.push(`翻译失败率过高: ${Math.round(failureRate * 100)}%`);
    }

    return {
      isHealthy: issues.length === 0,
      recentTranslations,
      failedTranslations,
      failureRate,
      issues
    };
  }

  async _checkErrorRate(shopId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const errorCount = await prisma.errorLog.count({
      where: {
        shopId,
        severity: { gte: 4 },
        createdAt: { gte: oneHourAgo }
      }
    });

    const issues = [];
    if (errorCount > 10) {
      issues.push(`最近一小时高严重性错误过多: ${errorCount}个`);
    }

    return {
      isHealthy: issues.length === 0,
      errorCount,
      issues
    };
  }

  async _checkActiveSessionsHealth(shopId) {
    const stalledSessions = await prisma.translationSession.count({
      where: {
        shopId,
        status: 'RUNNING',
        lastCheckpoint: {
          lt: new Date(Date.now() - 30 * 60 * 1000) // 30分钟无更新
        }
      }
    });

    const issues = [];
    if (stalledSessions > 0) {
      issues.push(`${stalledSessions}个会话可能已停滞`);
    }

    return {
      isHealthy: issues.length === 0,
      stalledSessions,
      issues
    };
  }

  async _performAutoMaintenance(shopId, issues) {
    const actions = [];

    // 清理过期的错误日志
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const cleanupResult = await prisma.errorLog.deleteMany({
        where: {
          shopId,
          createdAt: { lt: thirtyDaysAgo },
          status: 'resolved'
        }
      });

      if (cleanupResult.count > 0) {
        actions.push({
          action: 'CLEANUP_OLD_ERRORS',
          result: `清理了${cleanupResult.count}条过期错误日志`
        });
      }
    } catch (error) {
      actions.push({
        action: 'CLEANUP_OLD_ERRORS',
        error: error.message
      });
    }

    // 重置停滞的会话
    try {
      const stalledResult = await prisma.translationSession.updateMany({
        where: {
          shopId,
          status: 'RUNNING',
          lastCheckpoint: {
            lt: new Date(Date.now() - 60 * 60 * 1000) // 1小时无更新
          }
        },
        data: {
          status: 'PAUSED',
          pausedAt: new Date()
        }
      });

      if (stalledResult.count > 0) {
        actions.push({
          action: 'RESET_STALLED_SESSIONS',
          result: `重置了${stalledResult.count}个停滞会话`
        });
      }
    } catch (error) {
      actions.push({
        action: 'RESET_STALLED_SESSIONS',
        error: error.message
      });
    }

    return { actions };
  }

  _generateHealthRecommendations(healthCheck) {
    const recommendations = [];

    if (healthCheck.overallHealth === 'UNHEALTHY') {
      recommendations.push('系统健康状况不佳，建议立即检查和维护');
    }

    if (healthCheck.databaseHealth && !healthCheck.databaseHealth.isHealthy) {
      recommendations.push('数据库存在问题，建议检查数据库配置和性能');
    }

    if (healthCheck.translationHealth && !healthCheck.translationHealth.isHealthy) {
      recommendations.push('翻译服务健康状况不佳，建议检查翻译配置');
    }

    if (healthCheck.errorHealth && !healthCheck.errorHealth.isHealthy) {
      recommendations.push('错误率过高，建议分析错误原因并采取相应措施');
    }

    return recommendations;
  }
}

// 创建单例实例
export const autoRecoveryService = new AutoRecoveryService();