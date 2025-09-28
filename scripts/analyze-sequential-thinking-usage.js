#!/usr/bin/env node

/**
 * Sequential Thinking 使用情况分析工具
 * 基于KISS原则，分析复杂系统的实际使用价值
 */

import { prisma } from '../app/db.server.js';
import { logger } from '../app/utils/logger.server.js';

// 分析时间范围
const ANALYSIS_DAYS = 30;
const since = new Date(Date.now() - ANALYSIS_DAYS * 24 * 60 * 60 * 1000);

async function analyzeSequentialThinkingUsage() {
  console.log(`🔍 分析过去 ${ANALYSIS_DAYS} 天的 Sequential Thinking 使用情况...\n`);

  try {
    // 1. 分析翻译成功率
    const translationStats = await prisma.translation.groupBy({
      by: ['syncStatus'],
      where: {
        createdAt: { gte: since }
      },
      _count: {
        id: true
      }
    });

    console.log('📊 翻译成功率统计：');
    let totalTranslations = 0;
    const statusBreakdown = {};
    
    translationStats.forEach(stat => {
      totalTranslations += stat._count.id;
      statusBreakdown[stat.syncStatus] = stat._count.id;
      console.log(`   ${stat.syncStatus}: ${stat._count.id} 个翻译`);
    });

    const successRate = statusBreakdown.synced ? 
      ((statusBreakdown.synced / totalTranslations) * 100).toFixed(2) : 0;
    console.log(`   成功率: ${successRate}%\n`);

    // 2. 分析错误类型分布
    const errorStats = await prisma.errorLog.groupBy({
      by: ['errorType', 'errorCategory'],
      where: {
        createdAt: { gte: since }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    console.log('⚠️  错误类型分布（Top 10）：');
    errorStats.slice(0, 10).forEach(error => {
      console.log(`   ${error.errorType}/${error.errorCategory}: ${error._count.id} 次`);
    });
    console.log();

    // 3. 分析资源类型翻译情况
    const resourceStats = await prisma.resource.groupBy({
      by: ['resourceType'],
      where: {
        updatedAt: { gte: since }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    console.log('📁 资源类型翻译分布：');
    resourceStats.forEach(resource => {
      console.log(`   ${resource.resourceType}: ${resource._count.id} 个资源`);
    });
    console.log();

    // 4. 分析翻译会话使用情况
    const sessionStats = await prisma.translationSession.findMany({
      where: {
        createdAt: { gte: since }
      },
      select: {
        id: true,
        sessionName: true,
        status: true,
        totalResources: true,
        processedCount: true,
        succeededCount: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    console.log('📋 近期翻译会话（最近10个）：');
    sessionStats.forEach(session => {
      const completionRate = session.totalResources > 0 ? 
        ((session.processedCount / session.totalResources) * 100).toFixed(1) : 0;
      const successRate = session.processedCount > 0 ?
        ((session.succeededCount / session.processedCount) * 100).toFixed(1) : 0;
      console.log(`   ${session.sessionName}: ${session.status} (${completionRate}% 处理, ${successRate}% 成功, ${session.createdAt.toISOString().split('T')[0]})`);
    });
    console.log();

    // 5. 分析 Sequential Thinking 决策影响
    console.log('🤖 Sequential Thinking 系统影响分析：');
    
    // 查找包含 'sequential' 或 'thinking' 关键词的错误日志
    const sequentialErrors = await prisma.errorLog.count({
      where: {
        createdAt: { gte: since },
        OR: [
          { message: { contains: 'sequential' } },
          { message: { contains: 'thinking' } },
          { message: { contains: 'decision' } },
          { message: { contains: 'skip' } },
          { message: { contains: 'Sequential' } },
          { message: { contains: 'Thinking' } },
          { message: { contains: 'Decision' } },
          { message: { contains: 'Skip' } }
        ]
      }
    });

    console.log(`   相关错误日志: ${sequentialErrors} 条`);

    // 查找跳过的翻译
    const skippedTranslations = await prisma.translation.count({
      where: {
        createdAt: { gte: since },
        OR: [
          { skipReason: { not: null } },
          { status: 'skipped' },
          { syncStatus: 'skipped' }
        ]
      }
    });

    console.log(`   跳过的翻译: ${skippedTranslations} 个`);
    console.log();

    // 6. 性能指标分析
    console.log('⚡ 性能指标建议：');
    
    const avgResourcesPerSession = sessionStats.length > 0 ? 
      (sessionStats.reduce((sum, s) => sum + s.totalResources, 0) / sessionStats.length).toFixed(1) : 0;
    
    const avgCompletionRate = sessionStats.length > 0 ?
      (sessionStats.reduce((sum, s) => sum + (s.totalResources > 0 ? (s.processedCount / s.totalResources * 100) : 0), 0) / sessionStats.length).toFixed(1) : 0;

    console.log(`   平均每会话资源数: ${avgResourcesPerSession}`);
    console.log(`   平均完成率: ${avgCompletionRate}%`);
    
    if (parseFloat(avgCompletionRate) < 80) {
      console.log('   ⚠️  建议: 完成率偏低，可能需要优化翻译流程');
    }
    
    if (errorStats.length > 50) {
      console.log('   ⚠️  建议: 错误类型较多，建议简化错误处理逻辑');
    }
    
    if (sequentialErrors > totalTranslations * 0.1) {
      console.log('   ⚠️  建议: Sequential Thinking 相关错误较多，考虑简化决策逻辑');
    }
    
    console.log();

    // 7. KISS 原则评估
    console.log('🎯 KISS 原则评估：');
    
    const complexityScore = calculateComplexityScore({
      errorTypeCount: errorStats.length,
      sequentialErrorRate: sequentialErrors / Math.max(totalTranslations, 1),
      avgCompletionRate: parseFloat(avgCompletionRate),
      successRate: parseFloat(successRate)
    });
    
    console.log(`   系统复杂度评分: ${complexityScore}/100 (越低越好)`);
    
    if (complexityScore > 70) {
      console.log('   🔴 建议: 系统过于复杂，强烈建议进行 KISS 重构');
    } else if (complexityScore > 50) {
      console.log('   🟡 建议: 系统中等复杂，可考虑适度简化');
    } else {
      console.log('   🟢 评估: 系统复杂度适中，维持当前架构');
    }

    // 8. 具体优化建议
    console.log('\n💡 具体优化建议：');
    
    if (errorStats.length > 20) {
      console.log('   1. 错误类型过多，建议合并相似错误类型');
    }
    
    if (sequentialErrors > 10) {
      console.log('   2. Sequential Thinking 错误频发，建议启用 hooks 机制替代');
    }
    
    if (parseFloat(successRate) < 90) {
      console.log('   3. 翻译成功率偏低，建议优化核心翻译逻辑');
    }
    
    const resourceTypeCount = resourceStats.length;
    if (resourceTypeCount > 15) {
      console.log('   4. 资源类型过多，建议按相似性归类处理');
    }

    console.log('\n✅ 分析完成！建议基于以上数据进行架构优化决策。');

  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 计算系统复杂度评分
 * @param {Object} metrics 系统指标
 * @returns {number} 复杂度评分 (0-100)
 */
function calculateComplexityScore(metrics) {
  let score = 0;
  
  // 错误类型复杂度 (0-30分)
  score += Math.min(metrics.errorTypeCount * 1.5, 30);
  
  // Sequential Thinking 错误率 (0-25分) 
  score += metrics.sequentialErrorRate * 250;
  
  // 完成率影响 (0-25分，完成率越低复杂度越高)
  score += Math.max(0, (100 - metrics.avgCompletionRate) * 0.25);
  
  // 成功率影响 (0-20分，成功率越低复杂度越高)
  score += Math.max(0, (100 - metrics.successRate) * 0.2);
  
  return Math.min(Math.round(score), 100);
}

// 执行分析
analyzeSequentialThinkingUsage();