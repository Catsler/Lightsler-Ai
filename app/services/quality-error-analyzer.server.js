import { prisma } from '../db.server.js';
import { captureError, TranslationError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';
import { validateTranslation } from './translation.server.js';

// 品牌词定义（应该与translation.server.js保持一致）
const BRAND_WORDS = new Set([
  // 科技品牌
  'shopify', 'apple', 'google', 'microsoft', 'samsung', 'huawei', 'xiaomi', 'oppo', 'vivo',
  'oneplus', 'realme', 'sony', 'lg', 'nokia', 'motorola', 'lenovo', 'asus', 'acer', 'dell',
  'hp', 'ibm', 'intel', 'amd', 'nvidia', 'qualcomm', 'mediatek', 'broadcom', 'cisco',
  
  // 电商平台
  'amazon', 'ebay', 'alibaba', 'taobao', 'jd', 'tmall', 'pinduoduo', 'wish', 'etsy',
  'walmart', 'target', 'costco', 'best buy', 'home depot', 'lowes', 'ikea', 'sephora',
  
  // 社交媒体
  'facebook', 'meta', 'instagram', 'twitter', 'x', 'youtube', 'tiktok', 'snapchat',
  'linkedin', 'pinterest', 'reddit', 'discord', 'telegram', 'whatsapp', 'wechat', 'weibo',
  
  // 支付品牌
  'paypal', 'stripe', 'square', 'visa', 'mastercard', 'amex', 'discover', 'unionpay',
  'alipay', 'wechat pay', 'apple pay', 'google pay', 'samsung pay', 'venmo', 'cash app',
  
  // 云服务
  'aws', 'azure', 'gcp', 'google cloud', 'cloudflare', 'vercel', 'netlify', 'heroku',
  'digitalocean', 'linode', 'vultr', 'ovh', 'godaddy', 'namecheap', 'squarespace', 'wix',
  
  // Shopify相关
  'shop pay', 'shopify plus', 'shopify payments', 'shopify pos', 'shopify fulfillment',
  'shopify capital', 'shopify email', 'shopify inbox', 'shopify markets', 'shopify collabs'
]);

/**
 * 质量错误分析器 - 翻译质量评估与错误关联分析
 * 
 * 功能：
 * - 翻译质量自动评估
 * - 质量与错误关联分析
 * - 质量趋势预测
 * - 智能质量优化建议
 */
export class QualityErrorAnalyzer {
  constructor() {
    this.qualityThresholds = {
      EXCELLENT: 0.9,
      GOOD: 0.7,
      ACCEPTABLE: 0.5,
      POOR: 0.3
    };

    this.qualityMetrics = {
      COMPLETENESS: 'completeness',     // 翻译完整性
      ACCURACY: 'accuracy',             // 翻译准确性
      FLUENCY: 'fluency',               // 翻译流畅性
      CONSISTENCY: 'consistency',       // 翻译一致性
      HTML_INTEGRITY: 'htmlIntegrity',  // HTML结构完整性
      BRAND_PRESERVATION: 'brandPreservation' // 品牌词保护
    };
  }

  /**
   * 评估翻译质量并关联错误分析
   * @param {Object} context 翻译上下文
   * @returns {Promise<Object>} 质量评估结果
   */
  async assessTranslationQuality(context) {
    try {
      const {
        resourceId,
        language,
        originalText,
        translatedText,
        resourceType,
        shopId,
        sessionId
      } = context;

      const startTime = Date.now();

      // 并行执行多维度质量评估
      const [
        completenessScore,
        accuracyScore,
        fluencyScore,
        consistencyScore,
        htmlIntegrityScore,
        brandPreservationScore,
        errorCorrelation
      ] = await Promise.all([
        this._assessCompleteness(originalText, translatedText),
        this._assessAccuracy(originalText, translatedText, language),
        this._assessFluency(translatedText, language),
        this._assessConsistency(resourceId, language, translatedText),
        this._assessHtmlIntegrity(originalText, translatedText),
        this._assessBrandPreservation(originalText, translatedText),
        this._analyzeErrorCorrelation(resourceId, language, shopId)
      ]);

      // 计算综合质量评分
      const overallScore = this._calculateOverallQuality({
        completeness: completenessScore,
        accuracy: accuracyScore,
        fluency: fluencyScore,
        consistency: consistencyScore,
        htmlIntegrity: htmlIntegrityScore,
        brandPreservation: brandPreservationScore
      });

      // 生成质量报告
      const qualityAssessment = {
        overallScore,
        qualityLevel: this._getQualityLevel(overallScore),
        
        breakdown: {
          completeness: { score: completenessScore, weight: 0.20 },
          accuracy: { score: accuracyScore, weight: 0.25 },
          fluency: { score: fluencyScore, weight: 0.20 },
          consistency: { score: consistencyScore, weight: 0.15 },
          htmlIntegrity: { score: htmlIntegrityScore, weight: 0.10 },
          brandPreservation: { score: brandPreservationScore, weight: 0.10 }
        },

        errorCorrelation,
        
        issues: this._identifyQualityIssues({
          completeness: completenessScore,
          accuracy: accuracyScore,
          fluency: fluencyScore,
          consistency: consistencyScore,
          htmlIntegrity: htmlIntegrityScore,
          brandPreservation: brandPreservationScore
        }),

        recommendations: this._generateQualityRecommendations(overallScore, errorCorrelation),

        metadata: {
          assessmentTime: Date.now() - startTime,
          assessedAt: new Date().toISOString(),
          resourceType,
          language,
          textLength: translatedText?.length || 0
        }
      };

      // 记录质量评估
      await this._recordQualityAssessment(context, qualityAssessment);

      logger.info('翻译质量评估完成', {
        resourceId,
        language,
        overallScore,
        qualityLevel: qualityAssessment.qualityLevel,
        assessmentTime: qualityAssessment.metadata.assessmentTime
      });

      return qualityAssessment;
    } catch (error) {
      await captureError(error, {
        operation: 'assessTranslationQuality',
        context
      });

      // 评估失败时返回默认评分
      return {
        overallScore: 0.5,
        qualityLevel: 'UNKNOWN',
        error: error.message,
        breakdown: {},
        issues: ['质量评估失败'],
        recommendations: ['建议人工审核']
      };
    }
  }

  /**
   * 批量质量分析
   * @param {string} shopId 店铺ID
   * @param {Object} filters 过滤条件
   * @returns {Promise<Object>} 批量分析结果
   */
  async batchQualityAnalysis(shopId, filters = {}) {
    try {
      const {
        sessionId,
        resourceType,
        language,
        timeRange = '7d',
        minTranslations = 5
      } = filters;

      const timeFilter = this._getTimeFilter(timeRange);

      // 获取翻译数据
      const translations = await prisma.translation.findMany({
        where: {
          shopId,
          qualityScore: { gt: 0 },
          updatedAt: timeFilter,
          ...(sessionId && { translationSessionId: sessionId }),
          ...(language && { language }),
          ...(resourceType && { 
            resource: { resourceType } 
          })
        },
        include: {
          resource: {
            select: {
              resourceType: true,
              errorCount: true,
              riskScore: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (translations.length < minTranslations) {
        return {
          summary: {
            totalTranslations: translations.length,
            message: '翻译样本数量不足以进行有效分析'
          },
          analysis: {}
        };
      }

      // 执行批量分析
      const analysis = {
        qualityDistribution: this._analyzeQualityDistribution(translations),
        errorCorrelation: await this._batchAnalyzeErrorCorrelation(translations),
        qualityTrends: this._analyzeQualityTrends(translations),
        resourceTypeAnalysis: this._analyzeByResourceType(translations),
        languageAnalysis: this._analyzeByLanguage(translations),
        recommendations: []
      };

      // 生成改进建议
      analysis.recommendations = this._generateBatchRecommendations(analysis);

      return {
        summary: {
          totalTranslations: translations.length,
          avgQuality: translations.reduce((sum, t) => sum + t.qualityScore, 0) / translations.length,
          timeRange,
          analyzedAt: new Date().toISOString()
        },
        analysis
      };
    } catch (error) {
      await captureError(error, {
        operation: 'batchQualityAnalysis',
        shopId,
        filters
      });
      throw error;
    }
  }

  /**
   * 预测质量风险
   * @param {Object} context 预测上下文
   * @returns {Promise<Object>} 质量风险预测
   */
  async predictQualityRisk(context) {
    try {
      const { shopId, resourceType, language, contentLength, sessionId } = context;

      // 获取历史质量数据
      const historicalData = await this._getHistoricalQualityData(shopId, {
        resourceType,
        language,
        lookbackDays: 30
      });

      if (historicalData.length < 10) {
        return {
          riskLevel: 'UNKNOWN',
          riskScore: 0.5,
          confidence: 0.3,
          prediction: '历史数据不足，无法进行准确预测'
        };
      }

      // 分析历史质量模式
      const qualityPattern = this._analyzeQualityPattern(historicalData);
      
      // 基于内容特征预测
      const contentRisk = this._assessContentQualityRisk(context);
      
      // 基于系统状态预测
      const systemRisk = await this._assessSystemQualityRisk(shopId);

      // 综合预测
      const riskScore = this._calculatePredictedRisk({
        historicalPattern: qualityPattern.risk,
        contentRisk,
        systemRisk
      });

      return {
        riskLevel: this._getRiskLevel(riskScore),
        riskScore,
        confidence: qualityPattern.confidence,
        prediction: this._generateRiskPrediction(riskScore),
        factors: {
          historical: qualityPattern,
          content: contentRisk,
          system: systemRisk
        },
        recommendations: this._generateRiskMitigationRecommendations(riskScore)
      };
    } catch (error) {
      await captureError(error, {
        operation: 'predictQualityRisk',
        context
      });
      throw error;
    }
  }

  /**
   * 获取质量统计
   * @param {string} shopId 店铺ID
   * @param {Object} filters 过滤条件
   * @returns {Promise<Object>} 质量统计
   */
  async getQualityStatistics(shopId, filters = {}) {
    try {
      const { timeRange = '7d', resourceType, language } = filters;
      const timeFilter = this._getTimeFilter(timeRange);

      const baseWhere = {
        shopId,
        qualityScore: { gt: 0 },
        updatedAt: timeFilter,
        ...(resourceType && {
          resource: { resourceType }
        }),
        ...(language && { language })
      };

      const [
        totalTranslations,
        avgQuality,
        qualityDistribution,
        highQualityCount,
        lowQualityCount,
        errorCorrelatedCount
      ] = await Promise.all([
        prisma.translation.count({ where: baseWhere }),
        
        prisma.translation.aggregate({
          where: baseWhere,
          _avg: { qualityScore: true }
        }).then(r => r._avg.qualityScore || 0),

        prisma.translation.findMany({
          where: baseWhere,
          select: { qualityScore: true }
        }).then(translations => this._calculateDistribution(translations.map(t => t.qualityScore))),

        prisma.translation.count({
          where: { ...baseWhere, qualityScore: { gte: 0.8 } }
        }),

        prisma.translation.count({
          where: { ...baseWhere, qualityScore: { lt: 0.5 } }
        }),

        prisma.translation.count({
          where: { ...baseWhere, errorFingerprint: { not: null } }
        })
      ]);

      return {
        summary: {
          totalTranslations,
          avgQuality: Math.round(avgQuality * 100) / 100,
          highQualityRate: totalTranslations > 0 ? highQualityCount / totalTranslations : 0,
          lowQualityRate: totalTranslations > 0 ? lowQualityCount / totalTranslations : 0,
          errorCorrelationRate: totalTranslations > 0 ? errorCorrelatedCount / totalTranslations : 0
        },
        distribution: qualityDistribution,
        timeRange,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      await captureError(error, {
        operation: 'getQualityStatistics',
        shopId,
        filters
      });
      throw error;
    }
  }

  // 私有方法

  /**
   * 评估完整性
   * @private
   */
  async _assessCompleteness(originalText, translatedText) {
    if (!originalText || !translatedText) return 0;

    // 简化实现：基于长度比例和非空字段数量
    const originalLength = originalText.replace(/\s+/g, '').length;
    const translatedLength = translatedText.replace(/\s+/g, '').length;
    
    if (originalLength === 0) return translatedLength > 0 ? 1 : 0;
    
    const lengthRatio = Math.min(translatedLength / originalLength, originalLength / translatedLength);
    
    // 检查是否有明显的未翻译占位符或空白
    const hasPlaceholders = /\[.*\]|\{.*\}|TODO|PLACEHOLDER/i.test(translatedText);
    const placeholderPenalty = hasPlaceholders ? 0.3 : 0;
    
    return Math.max(0, lengthRatio - placeholderPenalty);
  }

  /**
   * 评估准确性
   * @private
   */
  async _assessAccuracy(originalText, translatedText, language) {
    // 简化实现：基于常见翻译错误检测
    let accuracyScore = 0.8; // 基础分数

    // 检查数字是否保持一致
    const originalNumbers = (originalText.match(/\d+/g) || []);
    const translatedNumbers = (translatedText.match(/\d+/g) || []);
    
    if (originalNumbers.length === translatedNumbers.length) {
      const numbersMatch = originalNumbers.every((num, i) => num === translatedNumbers[i]);
      if (numbersMatch) {
        accuracyScore += 0.1;
      } else {
        accuracyScore -= 0.2;
      }
    }

    // 检查HTML标签是否匹配
    const originalTags = (originalText.match(/<[^>]+>/g) || []).length;
    const translatedTags = (translatedText.match(/<[^>]+>/g) || []).length;
    
    if (originalTags === translatedTags) {
      accuracyScore += 0.1;
    } else {
      accuracyScore -= 0.3;
    }

    return Math.max(0, Math.min(1, accuracyScore));
  }

  /**
   * 评估流畅性
   * @private
   */
  async _assessFluency(translatedText, language) {
    if (!translatedText) return 0;

    let fluencyScore = 0.7; // 基础分数

    // 检查重复词语
    const words = translatedText.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = uniqueWords.size / words.length;
    fluencyScore += Math.min(0.2, repetitionRatio * 0.4);

    // 检查句子结构
    const sentences = translatedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      const avgSentenceLength = words.length / sentences.length;
      // 适中的句子长度得分更高
      if (avgSentenceLength >= 8 && avgSentenceLength <= 25) {
        fluencyScore += 0.1;
      }
    }

    return Math.max(0, Math.min(1, fluencyScore));
  }

  /**
   * 评估一致性
   * @private
   */
  async _assessConsistency(resourceId, language, translatedText) {
    try {
      // 获取同一资源其他语言的翻译
      const relatedTranslations = await prisma.translation.findMany({
        where: {
          resourceId,
          language: { not: language },
          status: 'completed'
        },
        select: {
          titleTrans: true,
          descTrans: true
        }
      });

      if (relatedTranslations.length === 0) return 0.8; // 默认分数

      // 简化的一致性检查：检查关键词是否在不同语言间保持一致
      // 这里可以实现更复杂的术语一致性检查
      return 0.75; // 简化实现
    } catch (error) {
      return 0.7; // 检查失败时的默认分数
    }
  }

  /**
   * 评估HTML完整性
   * @private
   */
  async _assessHtmlIntegrity(originalText, translatedText) {
    if (!originalText || !translatedText) return 1;

    try {
      // 使用现有的HTML完整性检查
      const validationResult = await validateTranslation({
        original: originalText,
        translated: translatedText
      });

      return validationResult.isValid ? 1 : 0.3;
    } catch (error) {
      return 0.5; // 检查失败时的默认分数
    }
  }

  /**
   * 评估品牌词保护
   * @private
   */
  async _assessBrandPreservation(originalText, translatedText) {
    if (!originalText || !translatedText) return 1;

    // 导入品牌词列表
    const { BRAND_WORDS } = await import('./translation.server.js');
    
    let preservationScore = 1;
    const brandWordsFound = [];

    for (const brandWord of BRAND_WORDS) {
      const originalRegex = new RegExp(`\\b${brandWord}\\b`, 'gi');
      const originalMatches = (originalText.match(originalRegex) || []).length;
      const translatedMatches = (translatedText.match(originalRegex) || []).length;

      if (originalMatches > 0) {
        brandWordsFound.push(brandWord);
        if (translatedMatches !== originalMatches) {
          preservationScore -= 0.2; // 每个品牌词不一致扣0.2分
        }
      }
    }

    return Math.max(0, preservationScore);
  }

  /**
   * 分析错误关联
   * @private
   */
  async _analyzeErrorCorrelation(resourceId, language, shopId) {
    try {
      const errors = await prisma.errorLog.findMany({
        where: {
          shopId,
          resourceId,
          isTranslationError: true,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天内
          }
        },
        select: {
          errorType: true,
          severity: true,
          message: true,
          createdAt: true
        }
      });

      return {
        hasErrors: errors.length > 0,
        errorCount: errors.length,
        highSeverityErrors: errors.filter(e => e.severity >= 4).length,
        recentErrors: errors.slice(0, 3),
        errorImpact: this._calculateErrorImpact(errors)
      };
    } catch (error) {
      return {
        hasErrors: false,
        errorCount: 0,
        error: error.message
      };
    }
  }

  /**
   * 计算综合质量评分
   * @private
   */
  _calculateOverallQuality(scores) {
    const weights = {
      completeness: 0.20,
      accuracy: 0.25,
      fluency: 0.20,
      consistency: 0.15,
      htmlIntegrity: 0.10,
      brandPreservation: 0.10
    };

    return Object.entries(scores).reduce((total, [metric, score]) => {
      return total + (score * weights[metric]);
    }, 0);
  }

  /**
   * 获取质量级别
   * @private
   */
  _getQualityLevel(score) {
    if (score >= this.qualityThresholds.EXCELLENT) return 'EXCELLENT';
    if (score >= this.qualityThresholds.GOOD) return 'GOOD';
    if (score >= this.qualityThresholds.ACCEPTABLE) return 'ACCEPTABLE';
    if (score >= this.qualityThresholds.POOR) return 'POOR';
    return 'VERY_POOR';
  }

  /**
   * 识别质量问题
   * @private
   */
  _identifyQualityIssues(scores) {
    const issues = [];

    if (scores.completeness < 0.7) {
      issues.push('翻译不完整');
    }
    if (scores.accuracy < 0.6) {
      issues.push('翻译准确性较低');
    }
    if (scores.fluency < 0.6) {
      issues.push('翻译流畅性需要改善');
    }
    if (scores.consistency < 0.5) {
      issues.push('术语一致性不足');
    }
    if (scores.htmlIntegrity < 0.8) {
      issues.push('HTML结构完整性问题');
    }
    if (scores.brandPreservation < 0.9) {
      issues.push('品牌词保护不足');
    }

    return issues;
  }

  /**
   * 生成质量建议
   * @private
   */
  _generateQualityRecommendations(overallScore, errorCorrelation) {
    const recommendations = [];

    if (overallScore < 0.5) {
      recommendations.push('建议人工审核和修正');
    } else if (overallScore < 0.7) {
      recommendations.push('建议进行质量检查');
    }

    if (errorCorrelation.hasErrors) {
      recommendations.push('检测到翻译错误历史，建议特别关注');
    }

    if (errorCorrelation.highSeverityErrors > 0) {
      recommendations.push('存在高严重性错误，建议优先处理');
    }

    return recommendations;
  }

  /**
   * 记录质量评估
   * @private
   */
  async _recordQualityAssessment(context, assessment) {
    try {
      await prisma.translation.upsert({
        where: {
          resourceId_language: {
            resourceId: context.resourceId,
            language: context.language
          }
        },
        update: {
          qualityScore: assessment.overallScore,
          updatedAt: new Date()
        },
        create: {
          resourceId: context.resourceId,
          shopId: context.shopId,
          language: context.language,
          status: 'pending',
          qualityScore: assessment.overallScore,
          ...(context.sessionId && {
            translationSessionId: context.sessionId
          })
        }
      });
    } catch (error) {
      logger.error('记录质量评估失败', {
        resourceId: context.resourceId,
        language: context.language,
        error: error.message
      });
    }
  }

  /**
   * 其他辅助方法
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

  _calculateDistribution(scores) {
    const ranges = {
      excellent: scores.filter(s => s >= 0.9).length,
      good: scores.filter(s => s >= 0.7 && s < 0.9).length,
      acceptable: scores.filter(s => s >= 0.5 && s < 0.7).length,
      poor: scores.filter(s => s >= 0.3 && s < 0.5).length,
      veryPoor: scores.filter(s => s < 0.3).length
    };

    const total = scores.length;
    return Object.entries(ranges).reduce((acc, [level, count]) => {
      acc[level] = {
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) / 100 : 0
      };
      return acc;
    }, {});
  }

  _analyzeQualityDistribution(translations) {
    const scores = translations.map(t => t.qualityScore);
    return this._calculateDistribution(scores);
  }

  async _batchAnalyzeErrorCorrelation(translations) {
    // 分析翻译质量与错误的关联性
    const qualityErrorMap = {};
    
    for (const translation of translations) {
      const hasError = translation.errorFingerprint !== null;
      const qualityLevel = this._getQualityLevel(translation.qualityScore);
      
      if (!qualityErrorMap[qualityLevel]) {
        qualityErrorMap[qualityLevel] = { total: 0, withErrors: 0 };
      }
      
      qualityErrorMap[qualityLevel].total++;
      if (hasError) {
        qualityErrorMap[qualityLevel].withErrors++;
      }
    }

    return Object.entries(qualityErrorMap).reduce((acc, [level, data]) => {
      acc[level] = {
        ...data,
        errorRate: data.total > 0 ? data.withErrors / data.total : 0
      };
      return acc;
    }, {});
  }

  _analyzeQualityTrends(translations) {
    // 按时间分析质量趋势
    const sortedTranslations = translations.sort((a, b) => 
      new Date(a.updatedAt) - new Date(b.updatedAt)
    );

    const dailyQuality = {};
    
    sortedTranslations.forEach(translation => {
      const date = translation.updatedAt.toISOString().split('T')[0];
      if (!dailyQuality[date]) {
        dailyQuality[date] = { total: 0, sum: 0 };
      }
      dailyQuality[date].total++;
      dailyQuality[date].sum += translation.qualityScore;
    });

    return Object.entries(dailyQuality).map(([date, data]) => ({
      date,
      avgQuality: data.sum / data.total,
      count: data.total
    }));
  }

  _analyzeByResourceType(translations) {
    const typeMap = {};
    
    translations.forEach(translation => {
      const type = translation.resource.resourceType;
      if (!typeMap[type]) {
        typeMap[type] = { translations: [], errors: 0, totalRisk: 0 };
      }
      
      typeMap[type].translations.push(translation.qualityScore);
      typeMap[type].errors += translation.resource.errorCount || 0;
      typeMap[type].totalRisk += translation.resource.riskScore || 0;
    });

    return Object.entries(typeMap).reduce((acc, [type, data]) => {
      const scores = data.translations;
      acc[type] = {
        count: scores.length,
        avgQuality: scores.reduce((sum, s) => sum + s, 0) / scores.length,
        avgErrors: data.errors / scores.length,
        avgRisk: data.totalRisk / scores.length
      };
      return acc;
    }, {});
  }

  _analyzeByLanguage(translations) {
    const languageMap = {};
    
    translations.forEach(translation => {
      const lang = translation.language;
      if (!languageMap[lang]) {
        languageMap[lang] = [];
      }
      languageMap[lang].push(translation.qualityScore);
    });

    return Object.entries(languageMap).reduce((acc, [lang, scores]) => {
      acc[lang] = {
        count: scores.length,
        avgQuality: scores.reduce((sum, s) => sum + s, 0) / scores.length,
        distribution: this._calculateDistribution(scores)
      };
      return acc;
    }, {});
  }

  _generateBatchRecommendations(analysis) {
    const recommendations = [];

    // 基于质量分布的建议
    const distribution = analysis.qualityDistribution;
    if (distribution.poor?.percentage > 0.2) {
      recommendations.push('质量较差的翻译比例过高，建议检查翻译配置');
    }

    // 基于错误关联的建议
    const errorCorr = analysis.errorCorrelation;
    if (errorCorr.POOR?.errorRate > 0.5) {
      recommendations.push('低质量翻译与错误高度相关，建议加强质量控制');
    }

    // 基于资源类型的建议
    const resourceAnalysis = analysis.resourceTypeAnalysis;
    Object.entries(resourceAnalysis).forEach(([type, data]) => {
      if (data.avgQuality < 0.6) {
        recommendations.push(`${type}资源类型的翻译质量偏低，建议优化翻译策略`);
      }
    });

    return recommendations;
  }

  _calculateErrorImpact(errors) {
    if (errors.length === 0) return 0;
    
    const severityWeights = { 1: 0.1, 2: 0.2, 3: 0.4, 4: 0.7, 5: 1.0 };
    const totalImpact = errors.reduce((sum, error) => {
      return sum + (severityWeights[error.severity] || 0.5);
    }, 0);
    
    return Math.min(1.0, totalImpact / errors.length);
  }

  async _getHistoricalQualityData(shopId, options) {
    const { resourceType, language, lookbackDays } = options;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    return await prisma.translation.findMany({
      where: {
        shopId,
        qualityScore: { gt: 0 },
        updatedAt: { gte: since },
        ...(language && { language }),
        ...(resourceType && {
          resource: { resourceType }
        })
      },
      select: {
        qualityScore: true,
        updatedAt: true,
        errorFingerprint: true
      },
      orderBy: { updatedAt: 'asc' }
    });
  }

  _analyzeQualityPattern(historicalData) {
    if (historicalData.length < 5) {
      return { risk: 0.5, confidence: 0.3, trend: 'INSUFFICIENT_DATA' };
    }

    const recentData = historicalData.slice(-10);
    const avgRecent = recentData.reduce((sum, d) => sum + d.qualityScore, 0) / recentData.length;
    
    const olderData = historicalData.slice(0, -10);
    const avgOlder = olderData.length > 0 
      ? olderData.reduce((sum, d) => sum + d.qualityScore, 0) / olderData.length 
      : avgRecent;

    const trendDirection = avgRecent > avgOlder ? 'IMPROVING' : 
                          avgRecent < avgOlder ? 'DECLINING' : 'STABLE';

    const riskScore = Math.max(0, 1 - avgRecent);
    const confidence = Math.min(1, historicalData.length / 50); // 更多数据=更高置信度

    return {
      risk: riskScore,
      confidence,
      trend: trendDirection,
      avgQuality: avgRecent
    };
  }

  _assessContentQualityRisk(context) {
    const { contentLength, resourceType } = context;
    let risk = 0;

    // 基于内容长度的风险
    if (contentLength > 5000) {
      risk += 0.2; // 长内容风险较高
    } else if (contentLength < 20) {
      risk += 0.3; // 太短的内容风险也较高
    }

    // 基于资源类型的风险
    const typeRisks = {
      'PRODUCT': 0.1,
      'COLLECTION': 0.05,
      'ARTICLE': 0.2,
      'PAGE': 0.15
    };

    risk += typeRisks[resourceType] || 0.1;

    return Math.min(1, risk);
  }

  async _assessSystemQualityRisk(shopId) {
    try {
      // 获取最近系统质量表现
      const recentQuality = await prisma.translation.aggregate({
        where: {
          shopId,
          qualityScore: { gt: 0 },
          updatedAt: {
            gte: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6小时内
          }
        },
        _avg: { qualityScore: true },
        _count: true
      });

      if (!recentQuality._count || recentQuality._count < 5) {
        return 0.3; // 数据不足时的默认风险
      }

      const avgQuality = recentQuality._avg.qualityScore;
      return Math.max(0, 1 - avgQuality);
    } catch (error) {
      return 0.3; // 查询失败时的默认风险
    }
  }

  _calculatePredictedRisk(factors) {
    const weights = {
      historicalPattern: 0.5,
      contentRisk: 0.3,
      systemRisk: 0.2
    };

    return Object.entries(factors).reduce((total, [factor, value]) => {
      return total + (value * weights[factor]);
    }, 0);
  }

  _getRiskLevel(riskScore) {
    if (riskScore >= 0.8) return 'HIGH';
    if (riskScore >= 0.6) return 'MEDIUM';
    if (riskScore >= 0.4) return 'LOW';
    return 'VERY_LOW';
  }

  _generateRiskPrediction(riskScore) {
    if (riskScore >= 0.8) {
      return '预测翻译质量可能较低，建议采取预防措施';
    } else if (riskScore >= 0.6) {
      return '翻译质量存在一定风险，建议加强监控';
    } else {
      return '预测翻译质量良好';
    }
  }

  _generateRiskMitigationRecommendations(riskScore) {
    const recommendations = [];

    if (riskScore >= 0.8) {
      recommendations.push('启用人工审核');
      recommendations.push('降低批处理大小');
      recommendations.push('增加质量检查频率');
    } else if (riskScore >= 0.6) {
      recommendations.push('启用额外质量验证');
      recommendations.push('监控翻译进度');
    } else {
      recommendations.push('保持当前翻译策略');
    }

    return recommendations;
  }
}

// 创建单例实例
export const qualityErrorAnalyzer = new QualityErrorAnalyzer();