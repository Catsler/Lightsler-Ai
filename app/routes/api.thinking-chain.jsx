/**
 * Sequential Thinking API端点
 * 提供思考链查询、决策分析和优化建议接口
 */

import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { withErrorHandling } from '../utils/api-response.server';
import {
  translateBatchWithIntelligence,
  getTranslationScheduleSuggestions,
  analyzeTranslationDecision,
  optimizeTranslationSession
} from '../services/translation-intelligence.server';
import { prisma } from '../db.server';

/**
 * GET请求处理器
 * 获取思考链信息和优化建议
 */
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
    const shopId = session.shop;

    const url = new URL(request.url);
    const operation = url.searchParams.get('operation');

    switch (operation) {
      case 'getSessionThinking':
        return await getSessionThinkingChain(url.searchParams.get('sessionId'));

      case 'getOptimizationStatus':
        return await getOptimizationStatus(shopId);

      case 'getScheduleSuggestions':
        return await getScheduleSuggestionsForShop(shopId);

      default:
        return json({
          success: false,
          error: '无效的操作',
          supportedOperations: [
            'getSessionThinking',
            'getOptimizationStatus',
            'getScheduleSuggestions'
          ]
        }, { status: 400 });
    }
  }, '获取思考链信息');
};

/**
 * POST请求处理器
 * 执行决策分析和优化操作
 */
export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
    const shopId = session.shop;
    const data = await request.json();

    const { operation } = data;

    switch (operation) {
      case 'analyzeDecision':
        return await handleAnalyzeDecision(data, shopId);

      case 'optimizeSession':
        return await handleOptimizeSession(data, shopId);

      case 'intelligentTranslate':
        return await handleIntelligentTranslate(data, shopId);

      case 'getSchedule':
        return await handleGetSchedule(data, shopId);

      default:
        return json({
          success: false,
          error: '无效的操作',
          supportedOperations: [
            'analyzeDecision',
            'optimizeSession',
            'intelligentTranslate',
            'getSchedule'
          ]
        }, { status: 400 });
    }
  }, '执行思考链操作');
};

/**
 * 分析单个资源的翻译决策
 */
async function handleAnalyzeDecision(data, shopId) {
  const { resourceId, resourceType, content, targetLanguage } = data;
  
  if (!resourceId || !resourceType) {
    return json({
      success: false,
      error: '缺少必要参数: resourceId, resourceType'
    }, { status: 400 });
  }
  
  // 获取资源信息
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId }
  });
  
  if (!resource) {
    return json({
      success: false,
      error: '资源不存在'
    }, { status: 404 });
  }
  
  // 分析决策
  const analysis = await analyzeTranslationDecision(resource, {
    targetLanguage,
    shopId,
    priority: data.priority || 'normal',
    userRequested: data.userRequested || false
  });
  
  return json({
    success: true,
    message: '决策分析完成',
    data: {
      resourceId,
      analysis,
      thinkingSteps: analysis.thinkingChain?.thoughts || [],
      decision: {
        action: analysis.decision,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning
      },
      recommendations: analysis.recommendations
    }
  });
}

/**
 * 优化翻译会话
 */
async function handleOptimizeSession(data, shopId) {
  const { sessionId } = data;
  
  if (!sessionId) {
    return json({
      success: false,
      error: '缺少会话ID'
    }, { status: 400 });
  }
  
  try {
    const optimization = await optimizeTranslationSession(sessionId);
    
    // 保存优化建议到数据库
    await prisma.translationSession.update({
      where: { id: sessionId },
      data: {
        optimizationSuggestions: optimization.suggestions,
        performanceMetrics: optimization.metrics
      }
    });
    
    return json({
      success: true,
      message: '会话优化分析完成',
      data: {
        sessionId,
        metrics: optimization.metrics,
        suggestions: optimization.suggestions,
        bottlenecks: optimization.bottlenecks,
        optimizationPlan: optimization.optimizationPlan
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: `优化失败: ${error.message}`
    }, { status: 500 });
  }
}

/**
 * 执行智能批量翻译
 */
async function handleIntelligentTranslate(data, shopId) {
  const { resourceIds, targetLanguage, options = {} } = data;
  
  if (!resourceIds || !Array.isArray(resourceIds) || resourceIds.length === 0) {
    return json({
      success: false,
      error: '请提供要翻译的资源ID数组'
    }, { status: 400 });
  }
  
  if (!targetLanguage) {
    return json({
      success: false,
      error: '请指定目标语言'
    }, { status: 400 });
  }
  
  // 获取资源
  const resources = await prisma.resource.findMany({
    where: {
      id: { in: resourceIds },
      shopId
    }
  });
  
  if (resources.length === 0) {
    return json({
      success: false,
      error: '未找到指定的资源'
    }, { status: 404 });
  }
  
  try {
    // 执行智能翻译
    const result = await translateBatchWithIntelligence(
      resources,
      targetLanguage,
      {
        ...options,
        shopId
      }
    );
    
    // 保存翻译结果到数据库
    for (const item of result.successful) {
      await prisma.translation.upsert({
        where: {
          resourceId_targetLang: {
            resourceId: item.resource.id,
            targetLang: targetLanguage
          }
        },
        update: {
          ...item.translation,
          status: 'completed',
          updatedAt: new Date()
        },
        create: {
          resourceId: item.resource.id,
          targetLang: targetLanguage,
          ...item.translation,
          status: 'completed'
        }
      });
    }
    
    return json({
      success: true,
      message: '智能翻译完成',
      data: {
        stats: result.stats,
        schedule: result.schedule,
        analysis: result.analysis,
        suggestions: result.suggestions,
        thinkingChain: result.thinkingChain,
        results: {
          successful: result.successful.length,
          failed: result.failed.length,
          skipped: result.skipped.length
        }
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: `翻译失败: ${error.message}`
    }, { status: 500 });
  }
}

/**
 * 获取翻译调度建议
 */
async function handleGetSchedule(data, shopId) {
  const { resourceIds, systemStatus = {} } = data;
  
  if (!resourceIds || !Array.isArray(resourceIds)) {
    return json({
      success: false,
      error: '请提供资源ID数组'
    }, { status: 400 });
  }
  
  // 获取资源
  const resources = await prisma.resource.findMany({
    where: {
      id: { in: resourceIds },
      shopId
    }
  });
  
  // 获取系统状态
  const currentSystemStatus = {
    ...systemStatus,
    activeTranslations: await prisma.translation.count({
      where: {
        status: 'translating',
        resource: { shopId }
      }
    }),
    queueLength: await prisma.translation.count({
      where: {
        status: 'pending',
        resource: { shopId }
      }
    })
  };
  
  // 获取调度建议
  const suggestions = await getTranslationScheduleSuggestions(
    resources,
    currentSystemStatus
  );
  
  return json({
    success: true,
    message: '调度建议生成完成',
    data: {
      resourceCount: resources.length,
      systemStatus: currentSystemStatus,
      ...suggestions
    }
  });
}

/**
 * 获取会话的思考链
 */
async function getSessionThinkingChain(sessionId) {
  if (!sessionId) {
    return json({
      success: false,
      error: '缺少会话ID'
    }, { status: 400 });
  }
  
  const session = await prisma.translationSession.findUnique({
    where: { id: sessionId },
    include: {
      translations: {
        select: {
          id: true,
          resourceId: true,
          status: true,
          createdAt: true
        }
      }
    }
  });
  
  if (!session) {
    return json({
      success: false,
      error: '会话不存在'
    }, { status: 404 });
  }
  
  return json({
    success: true,
    data: {
      sessionId,
      status: session.status,
      progress: session.progress,
      thinkingChain: session.thinkingChain || [],
      translationCount: session.translations.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }
  });
}

/**
 * 获取店铺的优化状态
 */
async function getOptimizationStatus(shopId) {
  // 获取最近的会话
  const recentSessions = await prisma.translationSession.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      progress: true,
      totalResources: true,
      completedResources: true,
      errorRate: true,
      performanceMetrics: true,
      optimizationSuggestions: true,
      createdAt: true
    }
  });
  
  // 计算整体统计
  const stats = {
    totalSessions: recentSessions.length,
    avgErrorRate: recentSessions.reduce((sum, s) => sum + (s.errorRate || 0), 0) / Math.max(1, recentSessions.length),
    avgCompletionRate: recentSessions.reduce((sum, s) => {
      const rate = s.totalResources > 0 ? s.completedResources / s.totalResources : 0;
      return sum + rate;
    }, 0) / Math.max(1, recentSessions.length)
  };
  
  // 汇总优化建议
  const allSuggestions = [];
  recentSessions.forEach(session => {
    if (session.optimizationSuggestions) {
      allSuggestions.push(...(Array.isArray(session.optimizationSuggestions) ? 
        session.optimizationSuggestions : [session.optimizationSuggestions]));
    }
  });
  
  // 去重和排序建议
  const uniqueSuggestions = Array.from(new Set(allSuggestions.map(s => JSON.stringify(s))))
    .map(s => JSON.parse(s))
    .slice(0, 5);
  
  return json({
    success: true,
    data: {
      shopId,
      stats,
      recentSessions: recentSessions.map(s => ({
        id: s.id,
        status: s.status,
        progress: s.progress,
        errorRate: s.errorRate,
        createdAt: s.createdAt
      })),
      topSuggestions: uniqueSuggestions,
      optimizationScore: calculateOptimizationScore(stats)
    }
  });
}

/**
 * 获取店铺的调度建议
 */
async function getScheduleSuggestionsForShop(shopId) {
  // 获取待翻译资源
  const pendingResources = await prisma.resource.findMany({
    where: {
      shopId,
      translations: {
        none: {}
      }
    },
    take: 100
  });
  
  if (pendingResources.length === 0) {
    return json({
      success: true,
      data: {
        message: '没有待翻译的资源',
        resourceCount: 0
      }
    });
  }
  
  // 获取系统状态
  const systemStatus = {
    activeTranslations: await prisma.translation.count({
      where: {
        status: 'translating',
        resource: { shopId }
      }
    }),
    cpuUsage: Math.random() * 100, // 模拟CPU使用率
    memoryUsage: Math.random() * 100 // 模拟内存使用率
  };
  
  // 获取调度建议
  const suggestions = await getTranslationScheduleSuggestions(
    pendingResources,
    systemStatus
  );
  
  return json({
    success: true,
    data: {
      shopId,
      pendingCount: pendingResources.length,
      systemStatus,
      ...suggestions
    }
  });
}

/**
 * 计算优化分数
 */
function calculateOptimizationScore(stats) {
  let score = 50; // 基础分数
  
  // 根据错误率调整
  if (stats.avgErrorRate < 0.05) score += 20;
  else if (stats.avgErrorRate < 0.1) score += 10;
  else if (stats.avgErrorRate > 0.2) score -= 20;
  
  // 根据完成率调整
  if (stats.avgCompletionRate > 0.9) score += 20;
  else if (stats.avgCompletionRate > 0.8) score += 10;
  else if (stats.avgCompletionRate < 0.5) score -= 20;
  
  return Math.max(0, Math.min(100, score));
}