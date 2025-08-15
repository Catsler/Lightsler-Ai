/**
 * Sequential Thinking 智能翻译管理服务
 * 提供智能决策、错误预防、质量管理等高级功能
 */

import prisma from '../db.server.js';
import crypto from 'crypto';

// 创建日志记录器
const logger = {
  info: (message, ...args) => console.log(`[sequential-thinking] ${message}`, ...args),
  error: (message, ...args) => console.error(`[sequential-thinking] ERROR: ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[sequential-thinking] WARN: ${message}`, ...args),
  debug: (message, ...args) => console.log(`[sequential-thinking] DEBUG: ${message}`, ...args)
};

/**
 * 创建翻译会话
 * @param {string} shopId - 店铺ID
 * @param {Object} options - 会话选项
 * @returns {Promise<Object>} 会话对象
 */
export async function createTranslationSession(shopId, options = {}) {
  const {
    name = '未命名会话',
    description = '',
    targetLanguage = 'zh-CN',
    resourceTypes = [],
    categoryKey = null,
    subcategoryKey = null
  } = options;
  
  try {
    const session = await prisma.translationSession.create({
      data: {
        shopId,
        name,
        description,
        targetLanguage,
        resourceTypes: resourceTypes.length > 0 ? resourceTypes : undefined,
        categoryKey,
        subcategoryKey,
        status: 'CREATED',
        checkpointData: {},
        totalResources: 0,
        translatedResources: 0,
        failedResources: 0,
        progressPercentage: 0
      }
    });
    
    logger.info(`创建翻译会话: ${session.id} - ${name}`);
    return session;
  } catch (error) {
    logger.error('创建翻译会话失败:', error);
    throw error;
  }
}

/**
 * 启动翻译会话
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Object>} 更新后的会话
 */
export async function startTranslationSession(sessionId) {
  try {
    // 获取会话信息
    const session = await prisma.translationSession.findUnique({
      where: { id: sessionId }
    });
    
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }
    
    if (session.status === 'RUNNING') {
      logger.warn(`会话已在运行中: ${sessionId}`);
      return session;
    }
    
    // 统计资源总数
    const resourceCount = await countSessionResources(session);
    
    // 更新会话状态
    const updatedSession = await prisma.translationSession.update({
      where: { id: sessionId },
      data: {
        status: 'RUNNING',
        totalResources: resourceCount,
        startedAt: new Date()
      }
    });
    
    logger.info(`启动翻译会话: ${sessionId}, 资源总数: ${resourceCount}`);
    return updatedSession;
  } catch (error) {
    logger.error('启动翻译会话失败:', error);
    throw error;
  }
}

/**
 * 暂停翻译会话
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Object>} 更新后的会话
 */
export async function pauseTranslationSession(sessionId) {
  try {
    const session = await prisma.translationSession.update({
      where: { id: sessionId },
      data: {
        status: 'PAUSED',
        pausedAt: new Date()
      }
    });
    
    logger.info(`暂停翻译会话: ${sessionId}`);
    return session;
  } catch (error) {
    logger.error('暂停翻译会话失败:', error);
    throw error;
  }
}

/**
 * 恢复翻译会话
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Object>} 更新后的会话
 */
export async function resumeTranslationSession(sessionId) {
  try {
    const session = await prisma.translationSession.update({
      where: { id: sessionId },
      data: {
        status: 'RUNNING',
        resumedAt: new Date()
      }
    });
    
    logger.info(`恢复翻译会话: ${sessionId}`);
    return session;
  } catch (error) {
    logger.error('恢复翻译会话失败:', error);
    throw error;
  }
}

/**
 * 检测内容变更
 * @param {string} resourceId - 资源ID
 * @param {Object} newContent - 新内容
 * @returns {Promise<Object>} 变更检测结果
 */
export async function detectContentChanges(resourceId, newContent) {
  try {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId }
    });
    
    if (!resource) {
      return { hasChanges: false, reason: '资源不存在' };
    }
    
    // 计算新内容的哈希值
    const newHash = calculateContentHash(newContent);
    
    // 比较哈希值
    if (resource.contentHash === newHash) {
      return {
        hasChanges: false,
        reason: '内容未变更'
      };
    }
    
    // 分析变更类型
    const changeAnalysis = analyzeChanges(resource, newContent);
    
    // 更新资源的哈希值和版本
    await prisma.resource.update({
      where: { id: resourceId },
      data: {
        contentHash: newHash,
        contentVersion: resource.contentVersion + 1,
        lastScannedAt: new Date()
      }
    });
    
    return {
      hasChanges: true,
      previousHash: resource.contentHash,
      newHash,
      changeAnalysis,
      version: resource.contentVersion + 1
    };
  } catch (error) {
    logger.error('检测内容变更失败:', error);
    throw error;
  }
}

/**
 * 智能跳过决策
 * @param {string} resourceId - 资源ID
 * @param {Object} context - 决策上下文
 * @returns {Promise<Object>} 决策结果
 */
export async function makeSkipDecision(resourceId, context = {}) {
  try {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: {
        translations: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        errorLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });
    
    if (!resource) {
      return { shouldSkip: false, reason: '资源不存在' };
    }
    
    // 决策因素
    const factors = [];
    
    // 1. 检查错误历史
    if (resource.errorCount > 3) {
      factors.push({
        factor: 'high_error_rate',
        weight: -0.8,
        reason: `错误次数过多: ${resource.errorCount}`
      });
    }
    
    // 2. 检查最近是否成功翻译
    const recentSuccessfulTranslation = resource.translations.find(
      t => t.status === 'completed' && t.syncStatus === 'synced'
    );
    
    if (recentSuccessfulTranslation) {
      const daysSinceTranslation = Math.floor(
        (Date.now() - new Date(recentSuccessfulTranslation.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceTranslation < 7) {
        factors.push({
          factor: 'recent_translation',
          weight: 0.9,
          reason: `${daysSinceTranslation}天前已翻译`
        });
      }
    }
    
    // 3. 检查内容是否频繁变更
    if (resource.contentVersion > 5) {
      factors.push({
        factor: 'frequent_changes',
        weight: -0.5,
        reason: `内容频繁变更，版本: ${resource.contentVersion}`
      });
    }
    
    // 4. 检查风险评分
    if (resource.riskScore > 0.7) {
      factors.push({
        factor: 'high_risk',
        weight: -0.7,
        reason: `高风险评分: ${resource.riskScore}`
      });
    }
    
    // 计算综合决策分数
    const decisionScore = factors.reduce((sum, f) => sum + f.weight, 0) / factors.length;
    
    // 决策阈值
    const shouldSkip = decisionScore > 0.3;
    
    return {
      shouldSkip,
      decisionScore,
      factors,
      recommendation: shouldSkip ? '建议跳过' : '建议翻译'
    };
  } catch (error) {
    logger.error('智能跳过决策失败:', error);
    throw error;
  }
}

/**
 * 错误预防分析
 * @param {string} resourceId - 资源ID
 * @returns {Promise<Object>} 预防措施建议
 */
export async function analyzeErrorPrevention(resourceId) {
  try {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: {
        errorLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
    
    if (!resource) {
      return { riskLevel: 'unknown', measures: [] };
    }
    
    const measures = [];
    let riskScore = 0;
    
    // 分析错误模式
    const errorPatterns = await analyzeErrorPatterns(resource.errorLogs);
    
    // 根据错误模式提供预防措施
    if (errorPatterns.tokenLimit) {
      measures.push({
        type: 'content_chunking',
        priority: 'high',
        action: '启用智能分块',
        description: '内容过长，建议分块处理'
      });
      riskScore += 0.3;
    }
    
    if (errorPatterns.htmlCorruption) {
      measures.push({
        type: 'html_protection',
        priority: 'high',
        action: '增强HTML保护',
        description: '检测到HTML结构损坏风险'
      });
      riskScore += 0.4;
    }
    
    if (errorPatterns.apiTimeout) {
      measures.push({
        type: 'timeout_adjustment',
        priority: 'medium',
        action: '调整超时设置',
        description: 'API响应超时，建议增加超时时间'
      });
      riskScore += 0.2;
    }
    
    // 更新资源风险评分
    await prisma.resource.update({
      where: { id: resourceId },
      data: { riskScore }
    });
    
    return {
      riskLevel: riskScore > 0.7 ? 'high' : riskScore > 0.3 ? 'medium' : 'low',
      riskScore,
      measures,
      recommendation: measures.length > 0 ? '建议执行预防措施' : '风险较低'
    };
  } catch (error) {
    logger.error('错误预防分析失败:', error);
    throw error;
  }
}

/**
 * 翻译质量评估
 * @param {string} translationId - 翻译ID
 * @returns {Promise<Object>} 质量评估结果
 */
export async function assessTranslationQuality(translationId) {
  try {
    const translation = await prisma.translation.findUnique({
      where: { id: translationId },
      include: { resource: true }
    });
    
    if (!translation) {
      return { qualityScore: 0, issues: ['翻译不存在'] };
    }
    
    const issues = [];
    let qualityScore = 100;
    
    // 1. 检查翻译完整性
    if (!translation.translatedTitle && translation.resource.title) {
      issues.push('标题未翻译');
      qualityScore -= 20;
    }
    
    if (!translation.translatedDescription && translation.resource.description) {
      issues.push('描述未翻译');
      qualityScore -= 15;
    }
    
    // 2. 检查HTML标签完整性
    if (translation.translatedDescriptionHtml) {
      const htmlIntegrity = checkHtmlIntegrity(
        translation.resource.descriptionHtml,
        translation.translatedDescriptionHtml
      );
      
      if (!htmlIntegrity.isValid) {
        issues.push(`HTML结构问题: ${htmlIntegrity.issue}`);
        qualityScore -= 25;
      }
    }
    
    // 3. 检查品牌词保护
    const brandWordsCheck = checkBrandWordsProtection(
      translation.resource,
      translation
    );
    
    if (!brandWordsCheck.isProtected) {
      issues.push(`品牌词未保护: ${brandWordsCheck.violatedWords.join(', ')}`);
      qualityScore -= 20;
    }
    
    // 4. 检查翻译长度合理性
    const lengthRatio = calculateLengthRatio(translation.resource, translation);
    if (lengthRatio < 0.5 || lengthRatio > 2.0) {
      issues.push(`翻译长度异常: ${Math.round(lengthRatio * 100)}%`);
      qualityScore -= 10;
    }
    
    // 更新翻译质量分数
    await prisma.translation.update({
      where: { id: translationId },
      data: {
        qualityScore: Math.max(0, qualityScore),
        qualityIssues: issues
      }
    });
    
    return {
      qualityScore: Math.max(0, qualityScore),
      issues,
      recommendation: qualityScore < 60 ? '建议重新翻译' : '质量合格'
    };
  } catch (error) {
    logger.error('翻译质量评估失败:', error);
    throw error;
  }
}

/**
 * 自动恢复建议
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Object>} 恢复建议
 */
export async function getRecoveryRecommendations(sessionId) {
  try {
    const session = await prisma.translationSession.findUnique({
      where: { id: sessionId },
      include: {
        resources: {
          where: { errorCount: { gt: 0 } },
          orderBy: { errorCount: 'desc' },
          take: 10
        }
      }
    });
    
    if (!session) {
      return { recommendations: [] };
    }
    
    const recommendations = [];
    
    // 分析错误模式
    const errorPatterns = await prisma.errorPattern.findMany({
      where: {
        matches: {
          some: {
            errorLog: {
              resourceId: { in: session.resources.map(r => r.id) }
            }
          }
        }
      },
      include: {
        matches: true
      }
    });
    
    // 生成恢复建议
    for (const pattern of errorPatterns) {
      if (pattern.fixSuggestion) {
        recommendations.push({
          type: 'pattern_based',
          priority: pattern.severity === 'HIGH' ? 'urgent' : 'normal',
          action: pattern.fixSuggestion,
          affectedResources: pattern.matches.length,
          confidence: pattern.confidence || 0.8
        });
      }
    }
    
    // 检查会话状态
    if (session.status === 'FAILED' && session.errorRate > 0.3) {
      recommendations.push({
        type: 'session_recovery',
        priority: 'high',
        action: '重置失败资源并重试',
        description: `错误率过高(${Math.round(session.errorRate * 100)}%)，建议重置并重试`
      });
    }
    
    // 检查长时间暂停
    if (session.status === 'PAUSED' && session.pausedAt) {
      const pausedHours = Math.floor(
        (Date.now() - new Date(session.pausedAt).getTime()) / (1000 * 60 * 60)
      );
      
      if (pausedHours > 24) {
        recommendations.push({
          type: 'resume_session',
          priority: 'medium',
          action: '恢复会话',
          description: `会话已暂停${pausedHours}小时`
        });
      }
    }
    
    return {
      sessionStatus: session.status,
      errorRate: session.errorRate,
      recommendations,
      autoRecoverable: recommendations.some(r => r.confidence > 0.7)
    };
  } catch (error) {
    logger.error('获取恢复建议失败:', error);
    throw error;
  }
}

// ===== 辅助函数 =====

/**
 * 计算内容哈希值
 */
function calculateContentHash(content) {
  const contentString = JSON.stringify(content);
  return crypto.createHash('sha256').update(contentString).digest('hex');
}

/**
 * 分析内容变更
 */
function analyzeChanges(oldResource, newContent) {
  const changes = [];
  
  if (oldResource.title !== newContent.title) {
    changes.push({ field: 'title', type: 'modified' });
  }
  
  if (oldResource.description !== newContent.description) {
    changes.push({ field: 'description', type: 'modified' });
  }
  
  if (oldResource.descriptionHtml !== newContent.descriptionHtml) {
    changes.push({ field: 'descriptionHtml', type: 'modified' });
  }
  
  return {
    changeCount: changes.length,
    changes,
    severity: changes.length > 2 ? 'major' : 'minor'
  };
}

/**
 * 统计会话资源数
 */
async function countSessionResources(session) {
  const where = { shopId: session.shopId };
  
  if (session.resourceTypes && session.resourceTypes.length > 0) {
    where.resourceType = { in: session.resourceTypes };
  }
  
  if (session.categoryKey) {
    // 根据分类获取资源类型
    const { RESOURCE_CATEGORIES } = await import('../config/resource-categories.js');
    const category = RESOURCE_CATEGORIES[session.categoryKey];
    
    if (category) {
      const resourceTypes = [];
      
      if (session.subcategoryKey && category.subcategories[session.subcategoryKey]) {
        resourceTypes.push(...category.subcategories[session.subcategoryKey].resources);
      } else {
        Object.values(category.subcategories).forEach(sub => {
          resourceTypes.push(...sub.resources);
        });
      }
      
      where.resourceType = { in: resourceTypes };
    }
  }
  
  return await prisma.resource.count({ where });
}

/**
 * 分析错误模式
 */
async function analyzeErrorPatterns(errorLogs) {
  const patterns = {
    tokenLimit: false,
    htmlCorruption: false,
    apiTimeout: false,
    networkError: false
  };
  
  for (const log of errorLogs) {
    if (log.errorMessage) {
      if (log.errorMessage.includes('token') || log.errorMessage.includes('limit')) {
        patterns.tokenLimit = true;
      }
      if (log.errorMessage.includes('HTML') || log.errorMessage.includes('tag')) {
        patterns.htmlCorruption = true;
      }
      if (log.errorMessage.includes('timeout')) {
        patterns.apiTimeout = true;
      }
      if (log.errorMessage.includes('network') || log.errorMessage.includes('connection')) {
        patterns.networkError = true;
      }
    }
  }
  
  return patterns;
}

/**
 * 检查HTML完整性
 */
function checkHtmlIntegrity(originalHtml, translatedHtml) {
  if (!originalHtml || !translatedHtml) {
    return { isValid: true };
  }
  
  // 简单检查：标签数量是否一致
  const originalTags = (originalHtml.match(/<[^>]+>/g) || []).length;
  const translatedTags = (translatedHtml.match(/<[^>]+>/g) || []).length;
  
  if (Math.abs(originalTags - translatedTags) > 2) {
    return {
      isValid: false,
      issue: `标签数量不匹配: 原始${originalTags}, 翻译${translatedTags}`
    };
  }
  
  return { isValid: true };
}

/**
 * 检查品牌词保护
 */
function checkBrandWordsProtection(resource, translation) {
  const BRAND_WORDS = new Set(['Shopify', 'Shop Pay', 'Shopify Plus']);
  const violatedWords = [];
  
  for (const word of BRAND_WORDS) {
    const originalCount = (resource.title + ' ' + resource.description).split(word).length - 1;
    const translatedCount = (translation.translatedTitle + ' ' + translation.translatedDescription).split(word).length - 1;
    
    if (originalCount !== translatedCount) {
      violatedWords.push(word);
    }
  }
  
  return {
    isProtected: violatedWords.length === 0,
    violatedWords
  };
}

/**
 * 计算翻译长度比例
 */
function calculateLengthRatio(resource, translation) {
  const originalLength = (resource.title || '').length + (resource.description || '').length;
  const translatedLength = (translation.translatedTitle || '').length + (translation.translatedDescription || '').length;
  
  if (originalLength === 0) return 1;
  return translatedLength / originalLength;
}

export default {
  createTranslationSession,
  startTranslationSession,
  pauseTranslationSession,
  resumeTranslationSession,
  countSessionResources,
  detectContentChanges,
  makeSkipDecision,
  analyzeErrorPrevention,
  assessTranslationQuality,
  getRecoveryRecommendations,
  analyzeChanges,
  analyzeErrorPatterns,
  calculateContentHash,
  checkHtmlIntegrity,
  checkBrandWordsProtection,
  calculateLengthRatio
};