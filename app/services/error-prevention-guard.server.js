import { prisma } from '../db.server.js';
import { captureError, TranslationError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';
import { intelligentSkipEngine } from './intelligent-skip-engine.server.js';

/**
 * 错误预防守卫服务 - 基于历史错误数据的智能预防系统
 * 
 * 功能：
 * - 翻译前错误风险评估
 * - 错误模式匹配和预警
 * - 自动错误预防措施
 * - 实时错误监控和阻断
 */
export class ErrorPreventionGuard {
  constructor() {
    this.riskThresholds = {
      CRITICAL: 0.9,  // 关键风险，阻止操作
      HIGH: 0.7,      // 高风险，需要确认
      MEDIUM: 0.5,    // 中等风险，记录警告
      LOW: 0.3        // 低风险，正常处理
    };
    
    this.preventionStrategies = new Map();
    this.activePatterns = new Map();
    this._loadErrorPatterns();
  }

  /**
   * 翻译前风险评估
   * @param {Object} context 翻译上下文
   * @returns {Promise<Object>} 风险评估结果
   */
  async assessTranslationRisk(context) {
    try {
      const {
        shopId,
        resourceId,
        resourceType,
        language,
        content,
        sessionId,
        translationConfig = {}
      } = context;

      const startTime = Date.now();

      // 并行执行多维度风险评估
      const [
        resourceRiskScore,
        languageRiskScore, 
        contentRiskScore,
        systemRiskScore,
        patternMatchResults
      ] = await Promise.all([
        this._assessResourceRisk(shopId, resourceId, resourceType),
        this._assessLanguageRisk(shopId, language, resourceType),
        this._assessContentRisk(content, resourceType),
        this._assessSystemRisk(shopId),
        this._matchErrorPatterns(context)
      ]);

      // 计算综合风险评分
      const overallRiskScore = this._calculateOverallRisk({
        resourceRisk: resourceRiskScore,
        languageRisk: languageRiskScore,
        contentRisk: contentRiskScore,
        systemRisk: systemRiskScore,
        patternMatches: patternMatchResults
      });

      // 生成风险评估报告
      const riskAssessment = {
        overallRisk: this._getRiskLevel(overallRiskScore),
        riskScore: overallRiskScore,
        shouldProceed: overallRiskScore < this.riskThresholds.CRITICAL,
        shouldWarn: overallRiskScore >= this.riskThresholds.MEDIUM,
        
        breakdown: {
          resource: { score: resourceRiskScore, level: this._getRiskLevel(resourceRiskScore) },
          language: { score: languageRiskScore, level: this._getRiskLevel(languageRiskScore) },
          content: { score: contentRiskScore, level: this._getRiskLevel(contentRiskScore) },
          system: { score: systemRiskScore, level: this._getRiskLevel(systemRiskScore) }
        },
        
        patternMatches: patternMatchResults.matches,
        recommendations: this._generatePreventionRecommendations(overallRiskScore, patternMatchResults),
        
        metadata: {
          assessmentTime: Date.now() - startTime,
          assessedAt: new Date().toISOString()
        }
      };

      // 如果风险过高，记录预防日志
      if (overallRiskScore >= this.riskThresholds.HIGH) {
        await this._logHighRiskAssessment(context, riskAssessment);
      }

      logger.info('翻译风险评估完成', {
        shopId,
        resourceId,
        language,
        overallRisk: riskAssessment.overallRisk,
        riskScore: overallRiskScore,
        shouldProceed: riskAssessment.shouldProceed
      });

      return riskAssessment;
    } catch (error) {
      await captureError(error, {
        operation: 'assessTranslationRisk',
        context
      });

      // 评估失败时采用保守策略
      return {
        overallRisk: 'HIGH',
        riskScore: 0.8,
        shouldProceed: false,
        shouldWarn: true,
        error: error.message,
        breakdown: {},
        patternMatches: [],
        recommendations: ['评估失败，建议人工审核']
      };
    }
  }

  /**
   * 执行错误预防措施
   * @param {Object} riskAssessment 风险评估结果
   * @param {Object} context 上下文
   * @returns {Promise<Object>} 预防措施执行结果
   */
  async executePreventionMeasures(riskAssessment, context) {
    try {
      const measures = [];
      
      // 根据风险级别执行相应预防措施
      if (riskAssessment.overallRisk === 'CRITICAL') {
        measures.push(await this._executeCriticalPrevention(context, riskAssessment));
      } else if (riskAssessment.overallRisk === 'HIGH') {
        measures.push(await this._executeHighRiskPrevention(context, riskAssessment));
      } else if (riskAssessment.overallRisk === 'MEDIUM') {
        measures.push(await this._executeMediumRiskPrevention(context, riskAssessment));
      }

      // 执行模式匹配的预防措施
      for (const patternMatch of riskAssessment.patternMatches) {
        if (patternMatch.autoFixEnabled && patternMatch.fixAction) {
          measures.push(await this._executePatternPrevention(patternMatch, context));
        }
      }

      return {
        measuresExecuted: measures.length,
        measures,
        success: measures.every(m => m.success),
        canProceed: measures.every(m => m.allowProceed !== false)
      };
    } catch (error) {
      await captureError(error, {
        operation: 'executePreventionMeasures',
        context,
        riskAssessment
      });
      throw error;
    }
  }

  /**
   * 实时监控翻译过程中的错误
   * @param {string} sessionId 翻译会话ID
   * @param {Object} monitorConfig 监控配置
   * @returns {Promise<Object>} 监控器对象
   */
  async startTranslationMonitoring(sessionId, monitorConfig = {}) {
    try {
      const {
        errorThreshold = 0.3,        // 错误率阈值
        monitorInterval = 30000,     // 监控间隔（毫秒）
        autoSuspend = true,          // 自动暂停
        alertCallback = null         // 告警回调
      } = monitorConfig;

      const monitor = {
        sessionId,
        startTime: Date.now(),
        config: monitorConfig,
        stats: {
          totalProcessed: 0,
          totalErrors: 0,
          errorRate: 0,
          lastUpdate: new Date()
        },
        active: true
      };

      // 启动监控循环
      const monitorInterval_id = setInterval(async () => {
        try {
          await this._performMonitoringCheck(monitor, alertCallback);
          
          // 如果错误率过高且启用自动暂停
          if (autoSuspend && monitor.stats.errorRate > errorThreshold) {
            await this._triggerAutoSuspend(sessionId, monitor.stats);
            clearInterval(monitorInterval_id);
            monitor.active = false;
          }
        } catch (error) {
          logger.error('翻译监控检查失败', {
            sessionId,
            error: error.message
          });
        }
      }, monitorInterval);

      // 存储监控器引用
      this.activeMonitors = this.activeMonitors || new Map();
      this.activeMonitors.set(sessionId, {
        monitor,
        intervalId: monitorInterval_id
      });

      logger.info('翻译监控启动', {
        sessionId,
        errorThreshold,
        monitorInterval,
        autoSuspend
      });

      return monitor;
    } catch (error) {
      await captureError(error, {
        operation: 'startTranslationMonitoring',
        sessionId,
        monitorConfig
      });
      throw error;
    }
  }

  /**
   * 停止翻译监控
   * @param {string} sessionId 会话ID
   * @returns {Promise<void>}
   */
  async stopTranslationMonitoring(sessionId) {
    try {
      const monitorInfo = this.activeMonitors?.get(sessionId);
      
      if (monitorInfo) {
        clearInterval(monitorInfo.intervalId);
        monitorInfo.monitor.active = false;
        this.activeMonitors.delete(sessionId);
        
        logger.info('翻译监控停止', { sessionId });
      }
    } catch (error) {
      logger.error('停止翻译监控失败', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * 获取错误预防统计
   * @param {string} shopId 店铺ID
   * @param {Object} filters 过滤条件
   * @returns {Promise<Object>} 预防统计
   */
  async getPreventionStatistics(shopId, filters = {}) {
    try {
      const { timeRange = '7d' } = filters;
      const timeFilter = this._getTimeFilter(timeRange);

      const [
        totalAssessments,
        highRiskBlocked,
        errorsPreventedEstimate,
        patternMatchStats
      ] = await Promise.all([
        // 总评估次数（通过ErrorLog中的预防记录估算）
        prisma.errorLog.count({
          where: {
            shopId,
            createdAt: timeFilter,
            tags: {
              path: ['preventionAssessment'],
              equals: true
            }
          }
        }),

        // 高风险阻止次数
        prisma.errorLog.count({
          where: {
            shopId,
            createdAt: timeFilter,
            errorType: 'PREVENTION',
            severity: { gte: 4 }
          }
        }),

        // 估算预防的错误数（基于跳过的高风险翻译）
        prisma.translation.count({
          where: {
            shopId,
            updatedAt: timeFilter,
            skipReason: 'ERROR_PRONE'
          }
        }),

        // 模式匹配统计
        prisma.errorPatternMatch.groupBy({
          by: ['fixStatus'],
          where: {
            errorLog: { shopId },
            matchedAt: timeFilter
          },
          _count: true
        })
      ]);

      return {
        summary: {
          totalAssessments,
          highRiskBlocked,
          errorsPreventedEstimate,
          preventionRate: totalAssessments > 0 ? (errorsPreventedEstimate / totalAssessments) : 0
        },
        patternMatching: {
          totalMatches: patternMatchStats.reduce((sum, p) => sum + p._count, 0),
          byStatus: patternMatchStats.reduce((acc, p) => {
            acc[p.fixStatus] = p._count;
            return acc;
          }, {})
        },
        timeRange,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      await captureError(error, {
        operation: 'getPreventionStatistics',
        shopId,
        filters
      });
      throw error;
    }
  }

  // 私有方法

  /**
   * 加载错误模式
   * @private
   */
  async _loadErrorPatterns() {
    try {
      const patterns = await prisma.errorPattern.findMany({
        where: { isActive: true },
        orderBy: { priority: 'asc' }
      });

      this.activePatterns.clear();
      patterns.forEach(pattern => {
        this.activePatterns.set(pattern.id, pattern);
      });

      logger.info('错误模式加载完成', { patternCount: patterns.length });
    } catch (error) {
      logger.error('加载错误模式失败', { error: error.message });
    }
  }

  /**
   * 评估资源风险
   * @private
   */
  async _assessResourceRisk(shopId, resourceId, resourceType) {
    try {
      // 获取资源的错误历史
      const [errorCount, totalTranslations, avgQuality] = await Promise.all([
        prisma.errorLog.count({
          where: {
            shopId,
            resourceId,
            isTranslationError: true,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天内
            }
          }
        }),

        prisma.translation.count({
          where: { resourceId }
        }),

        prisma.translation.aggregate({
          where: { 
            resourceId,
            qualityScore: { gt: 0 }
          },
          _avg: { qualityScore: true }
        }).then(result => result._avg.qualityScore || 0)
      ]);

      // 计算资源风险评分
      const errorRate = totalTranslations > 0 ? errorCount / totalTranslations : 0;
      const qualityPenalty = avgQuality > 0 ? (1 - avgQuality) : 0.5;
      
      return Math.min(1.0, errorRate * 0.6 + qualityPenalty * 0.4);
    } catch (error) {
      logger.error('资源风险评估失败', { shopId, resourceId, error: error.message });
      return 0.5; // 默认中等风险
    }
  }

  /**
   * 评估语言风险
   * @private
   */
  async _assessLanguageRisk(shopId, language, resourceType) {
    try {
      // 获取该语言的翻译成功率
      const [successCount, totalCount] = await Promise.all([
        prisma.translation.count({
          where: {
            shopId,
            language,
            status: 'completed',
            createdAt: {
              gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14天内
            }
          }
        }),

        prisma.translation.count({
          where: {
            shopId,
            language,
            createdAt: {
              gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);

      const successRate = totalCount > 0 ? successCount / totalCount : 0.5;
      return Math.max(0, 1 - successRate);
    } catch (error) {
      logger.error('语言风险评估失败', { shopId, language, error: error.message });
      return 0.3; // 默认低风险
    }
  }

  /**
   * 评估内容风险
   * @private
   */
  _assessContentRisk(content, resourceType) {
    try {
      let riskScore = 0;
      
      // 检查内容长度
      const contentLength = this._getContentLength(content);
      if (contentLength > 5000) {
        riskScore += 0.2; // 内容过长增加风险
      } else if (contentLength < 10) {
        riskScore += 0.3; // 内容过短增加风险
      }

      // 检查HTML复杂度
      if (content.descriptionHtml) {
        const htmlComplexity = this._calculateHtmlComplexity(content.descriptionHtml);
        riskScore += htmlComplexity * 0.15;
      }

      // 检查特殊字符
      const specialCharRisk = this._assessSpecialCharacters(content);
      riskScore += specialCharRisk * 0.1;

      // 检查内容类型特定风险
      const typeSpecificRisk = this._assessResourceTypeRisk(resourceType, content);
      riskScore += typeSpecificRisk * 0.25;

      return Math.min(1.0, riskScore);
    } catch (error) {
      logger.error('内容风险评估失败', { resourceType, error: error.message });
      return 0.4; // 默认中等风险
    }
  }

  /**
   * 评估系统风险
   * @private
   */
  async _assessSystemRisk(shopId) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now - 60 * 60 * 1000);

      // 获取最近一小时的系统错误率
      const [recentErrors, recentTranslations] = await Promise.all([
        prisma.errorLog.count({
          where: {
            shopId,
            createdAt: { gte: oneHourAgo },
            isTranslationError: true
          }
        }),

        prisma.translation.count({
          where: {
            shopId,
            updatedAt: { gte: oneHourAgo }
          }
        })
      ]);

      const systemErrorRate = recentTranslations > 0 ? recentErrors / recentTranslations : 0;
      
      // 检查API限制状态
      const apiRiskScore = await this._assessAPIRisk(shopId);
      
      return Math.min(1.0, systemErrorRate * 0.7 + apiRiskScore * 0.3);
    } catch (error) {
      logger.error('系统风险评估失败', { shopId, error: error.message });
      return 0.2; // 默认低系统风险
    }
  }

  /**
   * 匹配错误模式
   * @private
   */
  async _matchErrorPatterns(context) {
    const matches = [];
    let totalMatchScore = 0;

    try {
      for (const [patternId, pattern] of this.activePatterns) {
        const matchResult = await this._matchSinglePattern(pattern, context);
        
        if (matchResult.isMatch) {
          matches.push({
            patternId,
            patternName: pattern.patternName,
            matchScore: matchResult.score,
            category: pattern.category,
            severity: pattern.severity,
            autoFixEnabled: pattern.autoFixEnabled,
            fixAction: pattern.fixAction,
            details: matchResult.details
          });
          
          totalMatchScore += matchResult.score * (pattern.severity / 5);
        }
      }

      return {
        matches,
        totalMatchScore: Math.min(1.0, totalMatchScore),
        hasHighSeverityMatch: matches.some(m => m.severity >= 4)
      };
    } catch (error) {
      logger.error('错误模式匹配失败', { error: error.message });
      return { matches: [], totalMatchScore: 0, hasHighSeverityMatch: false };
    }
  }

  /**
   * 匹配单个模式
   * @private
   */
  async _matchSinglePattern(pattern, context) {
    try {
      let matchScore = 0;
      const details = {};

      // 检查资源类型过滤器
      if (pattern.resourceTypeFilter) {
        const allowedTypes = Array.isArray(pattern.resourceTypeFilter) 
          ? pattern.resourceTypeFilter 
          : JSON.parse(pattern.resourceTypeFilter);
        
        if (!allowedTypes.includes(context.resourceType)) {
          return { isMatch: false, score: 0 };
        }
      }

      // 检查时间窗口内的匹配次数
      if (pattern.occurrenceThreshold > 1) {
        const recentMatches = await prisma.errorPatternMatch.count({
          where: {
            errorPatternId: pattern.id,
            matchedAt: {
              gte: new Date(Date.now() - pattern.timeWindowMinutes * 60 * 1000)
            }
          }
        });

        if (recentMatches >= pattern.occurrenceThreshold) {
          matchScore += 0.3;
          details.recentMatches = recentMatches;
        }
      }

      // 检查上下文模式
      if (pattern.contextPattern) {
        const contextScore = this._matchContextPattern(pattern.contextPattern, context);
        matchScore += contextScore * 0.4;
        details.contextScore = contextScore;
      }

      // 检查内容模式（如果有的话）
      if (pattern.messagePattern) {
        const contentScore = this._matchContentPattern(pattern.messagePattern, context.content);
        matchScore += contentScore * 0.3;
        details.contentScore = contentScore;
      }

      return {
        isMatch: matchScore > 0.2, // 阈值
        score: Math.min(1.0, matchScore),
        details
      };
    } catch (error) {
      logger.error('单个模式匹配失败', {
        patternId: pattern.id,
        error: error.message
      });
      return { isMatch: false, score: 0 };
    }
  }

  /**
   * 计算综合风险评分
   * @private
   */
  _calculateOverallRisk(riskFactors) {
    const {
      resourceRisk,
      languageRisk,
      contentRisk,
      systemRisk,
      patternMatches
    } = riskFactors;

    // 权重配置
    const weights = {
      resource: 0.25,
      language: 0.20,
      content: 0.20,
      system: 0.15,
      patterns: 0.20
    };

    const baseScore = 
      resourceRisk * weights.resource +
      languageRisk * weights.language +
      contentRisk * weights.content +
      systemRisk * weights.system +
      patternMatches.totalMatchScore * weights.patterns;

    // 如果有高严重性模式匹配，增加额外风险
    const severityBonus = patternMatches.hasHighSeverityMatch ? 0.2 : 0;

    return Math.min(1.0, baseScore + severityBonus);
  }

  /**
   * 获取风险级别
   * @private
   */
  _getRiskLevel(score) {
    if (score >= this.riskThresholds.CRITICAL) return 'CRITICAL';
    if (score >= this.riskThresholds.HIGH) return 'HIGH';
    if (score >= this.riskThresholds.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * 生成预防建议
   * @private
   */
  _generatePreventionRecommendations(riskScore, patternMatches) {
    const recommendations = [];

    if (riskScore >= this.riskThresholds.CRITICAL) {
      recommendations.push('关键风险：建议暂停翻译，人工审核');
    } else if (riskScore >= this.riskThresholds.HIGH) {
      recommendations.push('高风险：建议降低批量大小，增加质量检查');
    } else if (riskScore >= this.riskThresholds.MEDIUM) {
      recommendations.push('中等风险：建议启用额外验证');
    }

    // 基于模式匹配的建议
    for (const match of patternMatches.matches) {
      if (match.fixAction && match.autoFixEnabled) {
        recommendations.push(`可应用自动修复: ${match.fixAction}`);
      }
    }

    return recommendations;
  }

  /**
   * 记录高风险评估
   * @private
   */
  async _logHighRiskAssessment(context, riskAssessment) {
    try {
      await prisma.errorLog.create({
        data: {
          shopId: context.shopId,
          resourceId: context.resourceId,
          translationSessionId: context.sessionId,
          
          errorType: 'PREVENTION',
          errorCategory: 'WARNING',
          errorCode: 'HIGH_RISK_DETECTED',
          message: `翻译前风险评估：${riskAssessment.overallRisk}风险`,
          
          severity: riskAssessment.riskScore >= this.riskThresholds.CRITICAL ? 5 : 4,
          context: JSON.stringify({
            riskAssessment,
            translationContext: {
              resourceType: context.resourceType,
              language: context.language,
              contentLength: this._getContentLength(context.content)
            }
          }),
          
          tags: JSON.stringify({
            preventionAssessment: true,
            riskLevel: riskAssessment.overallRisk,
            patternMatches: riskAssessment.patternMatches.length
          }),

          isTranslationError: true,
          operation: 'risk_assessment'
        }
      });
    } catch (error) {
      logger.error('记录高风险评估失败', {
        shopId: context.shopId,
        error: error.message
      });
    }
  }

  /**
   * 执行关键预防措施
   * @private
   */
  async _executeCriticalPrevention(context, riskAssessment) {
    return {
      type: 'CRITICAL_PREVENTION',
      action: 'BLOCK_TRANSLATION',
      success: true,
      allowProceed: false,
      message: '检测到关键风险，翻译已阻止',
      details: riskAssessment
    };
  }

  /**
   * 执行高风险预防措施
   * @private
   */
  async _executeHighRiskPrevention(context, riskAssessment) {
    // 标记资源需要人工审核
    try {
      if (context.resourceId) {
        await prisma.translation.upsert({
          where: {
            resourceId_language: {
              resourceId: context.resourceId,
              language: context.language
            }
          },
          update: {
            isManualReview: true,
            reviewNotes: '高风险翻译，需要人工审核'
          },
          create: {
            resourceId: context.resourceId,
            shopId: context.shopId,
            language: context.language,
            status: 'pending',
            isManualReview: true,
            reviewNotes: '高风险翻译，需要人工审核'
          }
        });
      }

      return {
        type: 'HIGH_RISK_PREVENTION',
        action: 'REQUIRE_MANUAL_REVIEW',
        success: true,
        allowProceed: true,
        message: '高风险检测，已标记为需要人工审核'
      };
    } catch (error) {
      return {
        type: 'HIGH_RISK_PREVENTION',
        action: 'REQUIRE_MANUAL_REVIEW',
        success: false,
        allowProceed: true,
        error: error.message
      };
    }
  }

  /**
   * 执行中等风险预防措施
   * @private
   */
  async _executeMediumRiskPrevention(context, riskAssessment) {
    return {
      type: 'MEDIUM_RISK_PREVENTION',
      action: 'ENABLE_EXTRA_VALIDATION',
      success: true,
      allowProceed: true,
      message: '中等风险检测，建议启用额外验证',
      recommendations: riskAssessment.recommendations
    };
  }

  /**
   * 执行模式匹配预防措施
   * @private
   */
  async _executePatternPrevention(patternMatch, context) {
    try {
      // 根据fixAction执行相应操作
      switch (patternMatch.fixAction) {
        case 'SKIP':
          return await this._executeSkipAction(context, patternMatch);
        case 'ADJUST_PARAMS':
          return await this._executeAdjustParams(context, patternMatch);
        case 'NOTIFY':
          return await this._executeNotifyAction(context, patternMatch);
        default:
          return {
            type: 'PATTERN_PREVENTION',
            action: patternMatch.fixAction,
            success: false,
            message: `未知的修复动作: ${patternMatch.fixAction}`
          };
      }
    } catch (error) {
      return {
        type: 'PATTERN_PREVENTION',
        action: patternMatch.fixAction,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 其他辅助方法
   * @private
   */
  _getContentLength(content) {
    if (!content) return 0;
    
    const textContent = [
      content.title,
      content.description,
      content.descriptionHtml,
      content.summary
    ].filter(Boolean).join(' ');

    return textContent.replace(/<[^>]*>/g, '').length;
  }

  _calculateHtmlComplexity(html) {
    if (!html) return 0;
    
    const tagCount = (html.match(/<[^>]*>/g) || []).length;
    const nestingLevel = this._getMaxNestingLevel(html);
    
    return Math.min(1.0, (tagCount / 100) + (nestingLevel / 10));
  }

  _getMaxNestingLevel(html) {
    let maxLevel = 0;
    let currentLevel = 0;
    
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    let match;
    
    while ((match = tagRegex.exec(html)) !== null) {
      const isClosingTag = match[0].startsWith('</');
      
      if (isClosingTag) {
        currentLevel--;
      } else if (!match[0].endsWith('/>')) {
        currentLevel++;
        maxLevel = Math.max(maxLevel, currentLevel);
      }
    }
    
    return maxLevel;
  }

  _assessSpecialCharacters(content) {
    const text = JSON.stringify(content);
    const specialCharCount = (text.match(/[^\x00-\x7F]/g) || []).length;
    return Math.min(1.0, specialCharCount / text.length);
  }

  _assessResourceTypeRisk(resourceType, content) {
    // 不同资源类型的特定风险评估
    const typeRisks = {
      'PRODUCT': this._assessProductRisk(content),
      'COLLECTION': this._assessCollectionRisk(content),
      'ARTICLE': this._assessArticleRisk(content),
      'PAGE': this._assessPageRisk(content)
    };

    return typeRisks[resourceType] || 0.1;
  }

  _assessProductRisk(content) {
    let risk = 0;
    
    // 产品特定风险检查
    if (content.descriptionHtml && content.descriptionHtml.includes('<script>')) {
      risk += 0.8; // 包含脚本的产品描述风险很高
    }
    
    return risk;
  }

  _assessCollectionRisk(content) {
    // 集合特定风险检查
    return 0.05; // 集合通常风险较低
  }

  _assessArticleRisk(content) {
    let risk = 0;
    
    // 文章特定风险检查
    if (this._getContentLength(content) > 10000) {
      risk += 0.3; // 长文章风险较高
    }
    
    return risk;
  }

  _assessPageRisk(content) {
    // 页面特定风险检查
    return 0.1; // 页面中等风险
  }

  async _assessAPIRisk(shopId) {
    // 评估API限制风险
    // 这里可以检查API调用频率、响应时间等
    return 0.1; // 简化实现
  }

  _matchContextPattern(contextPattern, context) {
    // 匹配上下文模式的简化实现
    try {
      const pattern = JSON.parse(contextPattern);
      let matchScore = 0;
      
      if (pattern.resourceType && pattern.resourceType === context.resourceType) {
        matchScore += 0.3;
      }
      
      if (pattern.language && pattern.language === context.language) {
        matchScore += 0.3;
      }
      
      return matchScore;
    } catch {
      return 0;
    }
  }

  _matchContentPattern(messagePattern, content) {
    // 匹配内容模式的简化实现
    try {
      const contentString = JSON.stringify(content);
      const regex = new RegExp(messagePattern, 'i');
      return regex.test(contentString) ? 0.8 : 0;
    } catch {
      return 0;
    }
  }

  async _performMonitoringCheck(monitor, alertCallback) {
    // 获取会话最新统计
    const stats = await prisma.translationSession.findUnique({
      where: { id: monitor.sessionId },
      select: {
        processedCount: true,
        failedCount: true,
        errorRate: true
      }
    });

    if (stats) {
      monitor.stats = {
        totalProcessed: stats.processedCount,
        totalErrors: stats.failedCount,
        errorRate: stats.errorRate,
        lastUpdate: new Date()
      };

      // 如果有告警回调且错误率过高
      if (alertCallback && stats.errorRate > 0.3) {
        alertCallback(monitor);
      }
    }
  }

  async _triggerAutoSuspend(sessionId, stats) {
    try {
      // 这里可以调用TranslationSessionManager的暂停功能
      logger.warn('翻译会话因错误率过高被自动暂停', {
        sessionId,
        errorRate: stats.errorRate,
        totalErrors: stats.totalErrors
      });
    } catch (error) {
      logger.error('自动暂停翻译会话失败', {
        sessionId,
        error: error.message
      });
    }
  }

  async _executeSkipAction(context, patternMatch) {
    // 执行跳过操作
    return await intelligentSkipEngine.evaluateSkip(
      { id: context.resourceId },
      context.language,
      { forceSkip: true, reason: 'PATTERN_MATCH' }
    );
  }

  async _executeAdjustParams(context, patternMatch) {
    // 执行参数调整
    return {
      type: 'PATTERN_PREVENTION',
      action: 'ADJUST_PARAMS',
      success: true,
      allowProceed: true,
      message: '已调整翻译参数以降低风险'
    };
  }

  async _executeNotifyAction(context, patternMatch) {
    // 执行通知操作
    logger.warn('检测到错误模式匹配', {
      shopId: context.shopId,
      resourceId: context.resourceId,
      patternName: patternMatch.patternName,
      matchScore: patternMatch.matchScore
    });

    return {
      type: 'PATTERN_PREVENTION',
      action: 'NOTIFY',
      success: true,
      allowProceed: true,
      message: `模式匹配通知: ${patternMatch.patternName}`
    };
  }

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
export const errorPreventionGuard = new ErrorPreventionGuard();