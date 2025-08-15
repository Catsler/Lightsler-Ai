/**
 * 翻译智能服务
 * 提供基于Sequential Thinking的智能翻译功能
 */

import { 
  DecisionEngine, 
  TranslationScheduler,
  OptimizationAnalyzer
} from './sequential-thinking-core.server.js';
import { translateResourceWithLogging } from './translation.server.js';
import { TranslationError } from '../utils/error-handler.server.js';
import { logger } from '../utils/logger.server.js';

const translationLogger = {
  log: (level, message, data) => {
    logger.log(level, `[TranslationIntelligence] ${message}`, data);
  }
};

/**
 * 智能批量翻译函数
 * 使用Sequential Thinking优化翻译流程
 * @param {Array} resources - 资源数组
 * @param {string} targetLang - 目标语言
 * @param {Object} options - 选项配置
 * @returns {Promise<Object>} 翻译结果和统计信息
 */
export async function translateBatchWithIntelligence(resources, targetLang, options = {}) {
  const scheduler = new TranslationScheduler();
  
  translationLogger.log('info', '开始智能批量翻译', {
    totalResources: resources.length,
    targetLanguage: targetLang,
    options
  });
  
  try {
    // 使用智能调度器规划翻译任务
    const { schedule, batches, skipped, analysis } = await scheduler.scheduleTranslation(
      resources,
      {
        ...options,
        targetLanguage: targetLang
      }
    );
    
    translationLogger.log('info', '翻译调度完成', {
      schedule,
      skippedCount: skipped.length,
      batchCount: batches.length,
      analysis
    });
    
    // 执行翻译批次
    const results = {
      successful: [],
      failed: [],
      skipped: skipped,
      stats: {
        total: resources.length,
        translated: 0,
        failed: 0,
        skipped: skipped.length,
        startTime: Date.now(),
        endTime: null,
        duration: null
      }
    };
    
    // 处理每个批次
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      translationLogger.log('info', `处理批次 ${i + 1}/${batches.length}`, {
        batchSize: batch.length
      });
      
      try {
        // 使用现有的翻译函数处理批次中的每个资源
        const batchPromises = batch.map(async (resource) => {
          try {
            const translation = await translateResourceWithLogging(resource, targetLang);
            
            // 检查是否被智能跳过
            if (translation.skipped) {
              results.skipped.push({
                resource,
                reason: translation.reason,
                confidence: translation.confidence
              });
              return { resource, status: 'skipped', translation };
            }
            
            results.successful.push({ resource, translation });
            results.stats.translated++;
            return { resource, status: 'success', translation };
          } catch (error) {
            results.failed.push({ resource, error: error.message });
            results.stats.failed++;
            return { resource, status: 'failed', error: error.message };
          }
        });
        
        // 等待批次完成
        await Promise.all(batchPromises);
        
        // 批次间延迟，避免API限流
        if (i < batches.length - 1 && options.batchDelay) {
          await new Promise(resolve => setTimeout(resolve, options.batchDelay));
        }
      } catch (batchError) {
        translationLogger.log('error', `批次 ${i + 1} 处理失败`, {
          error: batchError.message
        });
      }
    }
    
    // 更新统计信息
    results.stats.endTime = Date.now();
    results.stats.duration = results.stats.endTime - results.stats.startTime;
    
    // 生成优化建议
    const optimizer = scheduler.optimizer;
    const metrics = {
      successRate: results.stats.translated / Math.max(1, results.stats.total - results.stats.skipped),
      avgTimePerResource: results.stats.duration / Math.max(1, results.stats.translated),
      errorPatterns: []
    };
    
    const suggestions = optimizer.generateOptimizationSuggestions(metrics);
    
    translationLogger.log('info', '批量翻译完成', {
      stats: results.stats,
      suggestions
    });
    
    return {
      ...results,
      schedule,
      analysis,
      suggestions,
      thinkingChain: schedule.thinkingChain
    };
    
  } catch (error) {
    translationLogger.log('error', '智能批量翻译失败', {
      error: error.message,
      stack: error.stack
    });
    
    throw new TranslationError(
      `智能批量翻译失败: ${error.message}`,
      'BATCH_TRANSLATION_FAILED',
      { 
        resourceCount: resources.length,
        targetLanguage: targetLang,
        originalError: error.message 
      }
    );
  }
}

/**
 * 获取翻译调度建议
 * @param {Array} resources - 资源数组
 * @param {Object} systemStatus - 系统状态
 * @returns {Promise<Object>} 调度建议
 */
export async function getTranslationScheduleSuggestions(resources, systemStatus = {}) {
  const decisionEngine = new DecisionEngine();
  const scheduler = new TranslationScheduler();
  
  // 分析资源集合
  const resourceAnalysis = scheduler.analyzeResources ? 
    await scheduler.analyzeResources(resources) : 
    { count: resources.length, complexity: 'medium' };
  
  // 获取批次优化建议
  const batchOptimization = await decisionEngine.optimizeBatchSize(resources, systemStatus);
  
  // 预测资源需求
  const optimizer = new OptimizationAnalyzer();
  const requirements = await optimizer.predictResourceRequirements(resources, []);
  
  return {
    resourceAnalysis,
    batchOptimization,
    requirements,
    recommendations: [
      {
        type: 'batch_size',
        value: batchOptimization.batchSize,
        reason: batchOptimization.reasoning
      },
      {
        type: 'concurrency',
        value: requirements.recommendedConcurrency,
        reason: `基于当前系统负载和资源复杂度`
      },
      {
        type: 'risk_level',
        value: requirements.riskLevel,
        reason: `${resources.length}个资源的风险评估`
      }
    ]
  };
}

/**
 * 分析翻译决策
 * 为单个资源提供详细的翻译决策分析
 */
export async function analyzeTranslationDecision(resource, context = {}) {
  const decisionEngine = new DecisionEngine();
  decisionEngine.startSession({
    resourceId: resource.id,
    resourceType: resource.resourceType,
    operation: 'decision_analysis'
  });
  
  const skipDecision = await decisionEngine.shouldSkipTranslation(resource, context);
  
  return {
    decision: skipDecision.decision,
    reasoning: skipDecision.reasoning,
    confidence: skipDecision.confidence,
    thinkingChain: skipDecision.thinkingChain,
    recommendations: generateRecommendations(skipDecision)
  };
}

/**
 * 生成决策建议
 */
function generateRecommendations(decision) {
  const recommendations = [];
  
  if (decision.decision === 'skip') {
    recommendations.push({
      type: 'action',
      priority: 'low',
      message: '建议跳过此资源的翻译',
      reason: decision.reasoning
    });
  } else if (decision.decision === 'defer') {
    recommendations.push({
      type: 'action',
      priority: 'medium',
      message: '建议延迟处理此资源',
      reason: decision.reasoning,
      suggestedDelay: '30分钟后重试'
    });
  } else {
    recommendations.push({
      type: 'action',
      priority: 'high',
      message: '建议立即翻译此资源',
      reason: `置信度: ${(decision.confidence * 100).toFixed(0)}%`
    });
  }
  
  // 基于置信度的额外建议
  if (decision.confidence < 0.5) {
    recommendations.push({
      type: 'warning',
      priority: 'medium',
      message: '决策置信度较低，建议人工复核',
      reason: '自动决策可能不够准确'
    });
  }
  
  return recommendations;
}

/**
 * 优化现有翻译会话
 */
export async function optimizeTranslationSession(sessionId) {
  const optimizer = new OptimizationAnalyzer();
  
  try {
    // 分析会话性能
    const metrics = await optimizer.analyzePerformance(sessionId);
    
    // 生成优化建议
    const suggestions = optimizer.generateOptimizationSuggestions(metrics);
    
    // 识别瓶颈
    const bottlenecks = metrics.bottlenecks || [];
    
    return {
      metrics,
      suggestions,
      bottlenecks,
      optimizationPlan: createOptimizationPlan(suggestions, bottlenecks)
    };
  } catch (error) {
    translationLogger.log('error', '会话优化失败', {
      sessionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * 创建优化计划
 */
function createOptimizationPlan(suggestions, bottlenecks) {
  const plan = {
    immediate: [],
    shortTerm: [],
    longTerm: []
  };
  
  // 根据优先级分类建议
  suggestions.forEach(suggestion => {
    if (suggestion.priority === 'high') {
      plan.immediate.push({
        action: suggestion.suggestion,
        expectedImpact: suggestion.impact,
        implementation: getImplementationSteps(suggestion)
      });
    } else if (suggestion.priority === 'medium') {
      plan.shortTerm.push({
        action: suggestion.suggestion,
        expectedImpact: suggestion.impact,
        timeline: '1-3天内实施'
      });
    } else {
      plan.longTerm.push({
        action: suggestion.suggestion,
        expectedImpact: suggestion.impact,
        timeline: '计划中'
      });
    }
  });
  
  // 添加瓶颈解决方案
  bottlenecks.forEach(bottleneck => {
    if (bottleneck.type === 'slow_translations') {
      plan.immediate.push({
        action: '优化慢速翻译',
        expectedImpact: 'high',
        implementation: [
          '减小批次大小',
          '增加并发限制',
          '优化API调用'
        ]
      });
    } else if (bottleneck.type === 'high_retry_rate') {
      plan.immediate.push({
        action: '降低重试率',
        expectedImpact: 'medium',
        implementation: [
          '改进错误处理',
          '增加延迟重试',
          '优化请求参数'
        ]
      });
    }
  });
  
  return plan;
}

/**
 * 获取实施步骤
 */
function getImplementationSteps(suggestion) {
  const steps = [];
  
  if (suggestion.type === 'quality') {
    steps.push('检查API配置');
    steps.push('验证翻译参数');
    steps.push('增加质量检查');
  } else if (suggestion.type === 'performance') {
    steps.push('调整批次大小');
    steps.push('优化并发设置');
    steps.push('实施缓存策略');
  } else if (suggestion.type === 'reliability') {
    steps.push('增强错误处理');
    steps.push('实施重试策略');
    steps.push('添加监控告警');
  }
  
  return steps;
}

// 导出服务
export const translationIntelligence = {
  translateBatchWithIntelligence,
  getTranslationScheduleSuggestions,
  analyzeTranslationDecision,
  optimizeTranslationSession
};

export default translationIntelligence;