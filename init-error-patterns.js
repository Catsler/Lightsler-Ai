#!/usr/bin/env node

/**
 * 错误模式初始化脚本
 * 
 * 功能：
 * - 初始化常见翻译错误模式到数据库
 * - 建立错误特征和模式映射关系
 * - 为错误预防系统提供基础数据
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 预定义的错误模式
const ERROR_PATTERNS = [
  // API相关错误
  {
    name: 'API_TIMEOUT',
    category: 'API',
    description: 'API请求超时错误',
    keywords: ['timeout', 'timed out', 'time out', 'ETIMEDOUT'],
    severity: 3,
    frequency: 0,
    impact: 0.6,
    isActive: true,
    suggestedFix: '增加请求超时时间，使用指数退避重试',
    preventionMeasures: ['增加超时时间', '实施重试机制', '监控API响应时间']
  },
  {
    name: 'API_RATE_LIMIT',
    category: 'API',
    description: 'API请求频率限制',
    keywords: ['rate limit', '429', 'too many requests', 'quota exceeded'],
    severity: 4,
    frequency: 0,
    impact: 0.8,
    isActive: true,
    suggestedFix: '实施请求频率控制，使用指数退避',
    preventionMeasures: ['控制请求频率', '实施队列机制', '监控API配额使用']
  },
  {
    name: 'API_AUTHENTICATION',
    category: 'API',
    description: 'API认证失败',
    keywords: ['unauthorized', '401', 'authentication failed', 'invalid token'],
    severity: 5,
    frequency: 0,
    impact: 0.9,
    isActive: true,
    suggestedFix: '检查并刷新API令牌',
    preventionMeasures: ['定期检查令牌有效性', '实施令牌自动刷新', '监控认证状态']
  },

  // 网络相关错误
  {
    name: 'NETWORK_CONNECTION',
    category: 'NETWORK',
    description: '网络连接错误',
    keywords: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'network error'],
    severity: 3,
    frequency: 0,
    impact: 0.7,
    isActive: true,
    suggestedFix: '检查网络连接，实施重试机制',
    preventionMeasures: ['检查网络稳定性', '实施连接重试', '使用备用网络路径']
  },

  // 翻译质量错误
  {
    name: 'TRANSLATION_INCOMPLETE',
    category: 'TRANSLATION',
    description: '翻译不完整',
    keywords: ['incomplete', 'partial translation', 'missing content'],
    severity: 3,
    frequency: 0,
    impact: 0.6,
    isActive: true,
    suggestedFix: '检查翻译参数，重新翻译',
    preventionMeasures: ['验证翻译完整性', '设置最小长度要求', '实施内容检查']
  },
  {
    name: 'TRANSLATION_QUALITY_LOW',
    category: 'TRANSLATION',
    description: '翻译质量过低',
    keywords: ['low quality', 'poor translation', 'quality check failed'],
    severity: 2,
    frequency: 0,
    impact: 0.5,
    isActive: true,
    suggestedFix: '调整翻译参数，启用人工审核',
    preventionMeasures: ['设置质量阈值', '启用多轮验证', '实施人工审核流程']
  },
  {
    name: 'HTML_STRUCTURE_BROKEN',
    category: 'TRANSLATION',
    description: 'HTML结构被破坏',
    keywords: ['HTML', 'tag mismatch', 'structure broken', 'invalid markup'],
    severity: 4,
    frequency: 0,
    impact: 0.8,
    isActive: true,
    suggestedFix: '修复HTML结构，重新翻译',
    preventionMeasures: ['保护HTML标签', '验证结构完整性', '使用HTML-aware翻译']
  },
  {
    name: 'BRAND_WORDS_ALTERED',
    category: 'TRANSLATION',
    description: '品牌词被错误翻译',
    keywords: ['brand word', 'trademark', 'brand altered', 'name changed'],
    severity: 4,
    frequency: 0,
    impact: 0.9,
    isActive: true,
    suggestedFix: '恢复正确的品牌词，更新保护词库',
    preventionMeasures: ['维护品牌词词库', '实施品牌词保护', '设置翻译规则']
  },

  // 数据库错误
  {
    name: 'DATABASE_CONNECTION',
    category: 'DATABASE',
    description: '数据库连接错误',
    keywords: ['database connection', 'connection pool', 'db error', 'ECONNREFUSED'],
    severity: 5,
    frequency: 0,
    impact: 0.9,
    isActive: true,
    suggestedFix: '检查数据库连接，重启服务',
    preventionMeasures: ['监控数据库连接', '设置连接池', '实施健康检查']
  },
  {
    name: 'DATABASE_TIMEOUT',
    category: 'DATABASE',
    description: '数据库查询超时',
    keywords: ['query timeout', 'database timeout', 'slow query'],
    severity: 3,
    frequency: 0,
    impact: 0.6,
    isActive: true,
    suggestedFix: '优化查询语句，增加超时时间',
    preventionMeasures: ['优化数据库查询', '添加索引', '监控查询性能']
  },

  // 内容处理错误
  {
    name: 'CONTENT_TOO_LONG',
    category: 'CONTENT',
    description: '内容长度超限',
    keywords: ['content too long', 'length limit', 'size exceeded'],
    severity: 2,
    frequency: 0,
    impact: 0.4,
    isActive: true,
    suggestedFix: '分割长内容，分批处理',
    preventionMeasures: ['检查内容长度', '实施自动分割', '设置长度限制']
  },
  {
    name: 'CONTENT_ENCODING',
    category: 'CONTENT',
    description: '内容编码错误',
    keywords: ['encoding error', 'charset', 'unicode', 'invalid characters'],
    severity: 3,
    frequency: 0,
    impact: 0.5,
    isActive: true,
    suggestedFix: '修正内容编码，清理无效字符',
    preventionMeasures: ['验证内容编码', '清理特殊字符', '统一字符集']
  },

  // 系统资源错误
  {
    name: 'MEMORY_OVERFLOW',
    category: 'SYSTEM',
    description: '内存溢出',
    keywords: ['out of memory', 'memory overflow', 'heap overflow'],
    severity: 5,
    frequency: 0,
    impact: 0.9,
    isActive: true,
    suggestedFix: '增加内存限制，优化内存使用',
    preventionMeasures: ['监控内存使用', '优化内存管理', '实施资源限制']
  },
  {
    name: 'RESOURCE_NOT_FOUND',
    category: 'SYSTEM',
    description: '资源不存在',
    keywords: ['not found', '404', 'resource missing', 'file not found'],
    severity: 2,
    frequency: 0,
    impact: 0.3,
    isActive: true,
    suggestedFix: '检查资源是否存在，更新资源路径',
    preventionMeasures: ['验证资源存在性', '维护资源索引', '实施资源检查']
  }
];

/**
 * 初始化错误模式
 */
async function initErrorPatterns() {
  console.log('开始初始化错误模式...');

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  for (const pattern of ERROR_PATTERNS) {
    try {
      // 检查是否已存在
      const existing = await prisma.errorPattern.findUnique({
        where: { name: pattern.name }
      });

      if (existing) {
        // 更新现有模式
        await prisma.errorPattern.update({
          where: { name: pattern.name },
          data: {
            ...pattern,
            keywords: JSON.stringify(pattern.keywords),
            preventionMeasures: JSON.stringify(pattern.preventionMeasures),
            updatedAt: new Date()
          }
        });
        results.updated++;
        console.log(`✅ 更新错误模式: ${pattern.name}`);
      } else {
        // 创建新模式
        await prisma.errorPattern.create({
          data: {
            ...pattern,
            keywords: JSON.stringify(pattern.keywords),
            preventionMeasures: JSON.stringify(pattern.preventionMeasures)
          }
        });
        results.created++;
        console.log(`🆕 创建错误模式: ${pattern.name}`);
      }
    } catch (error) {
      results.errors.push({
        pattern: pattern.name,
        error: error.message
      });
      console.error(`❌ 处理错误模式失败 ${pattern.name}:`, error.message);
    }
  }

  return results;
}

/**
 * 创建错误模式匹配索引
 */
async function createErrorPatternMatches() {
  console.log('\\n开始创建错误模式匹配关系...');

  try {
    // 获取最近的错误日志
    const recentErrors = await prisma.errorLog.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天内
        }
      },
      take: 1000,
      orderBy: { createdAt: 'desc' }
    });

    // 获取所有错误模式
    const patterns = await prisma.errorPattern.findMany({
      where: { isActive: true }
    });

    let matchCount = 0;

    for (const error of recentErrors) {
      const errorMessage = error.message?.toLowerCase() || '';
      const errorCode = error.errorCode?.toLowerCase() || '';
      const context = error.context ? JSON.stringify(error.context).toLowerCase() : '';
      const fullText = `${errorMessage} ${errorCode} ${context}`;

      for (const pattern of patterns) {
        const keywords = JSON.parse(pattern.keywords || '[]');
        const hasMatch = keywords.some(keyword => 
          fullText.includes(keyword.toLowerCase())
        );

        if (hasMatch) {
          // 检查是否已存在匹配记录
          const existingMatch = await prisma.errorPatternMatch.findUnique({
            where: {
              errorLogId_errorPatternId: {
                errorLogId: error.id,
                errorPatternId: pattern.id
              }
            }
          });

          if (!existingMatch) {
            await prisma.errorPatternMatch.create({
              data: {
                errorLogId: error.id,
                errorPatternId: pattern.id,
                matchedKeywords: JSON.stringify(
                  keywords.filter(keyword => fullText.includes(keyword.toLowerCase()))
                ),
                confidence: 0.8 // 简单匹配的默认置信度
              }
            });
            matchCount++;
          }

          // 更新模式频率
          await prisma.errorPattern.update({
            where: { id: pattern.id },
            data: {
              frequency: { increment: 1 },
              lastSeen: new Date()
            }
          });
        }
      }
    }

    console.log(`✅ 创建了 ${matchCount} 个错误模式匹配关系`);
    return matchCount;
  } catch (error) {
    console.error('❌ 创建错误模式匹配失败:', error);
    throw error;
  }
}

/**
 * 计算模式影响评分
 */
async function calculatePatternImpact() {
  console.log('\\n开始计算错误模式影响评分...');

  try {
    const patterns = await prisma.errorPattern.findMany({
      include: {
        matches: {
          include: {
            errorLog: true
          }
        }
      }
    });

    for (const pattern of patterns) {
      if (pattern.matches.length === 0) continue;

      // 计算影响评分
      const severitySum = pattern.matches.reduce((sum, match) => 
        sum + (match.errorLog.severity || 1), 0
      );
      const avgSeverity = severitySum / pattern.matches.length;
      const normalizedSeverity = avgSeverity / 5; // 归一化到0-1

      // 基于频率和严重性计算影响
      const frequencyScore = Math.min(pattern.frequency / 100, 1); // 频率评分
      const impactScore = (normalizedSeverity * 0.7) + (frequencyScore * 0.3);

      await prisma.errorPattern.update({
        where: { id: pattern.id },
        data: {
          impact: Math.round(impactScore * 100) / 100, // 保留2位小数
          updatedAt: new Date()
        }
      });
    }

    console.log('✅ 错误模式影响评分计算完成');
  } catch (error) {
    console.error('❌ 计算模式影响失败:', error);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 Sequential Thinking 错误模式初始化开始');
    console.log('='.repeat(50));

    // 1. 初始化错误模式
    const patternResults = await initErrorPatterns();
    
    console.log('\\n📊 错误模式初始化结果:');
    console.log(`   ✅ 创建: ${patternResults.created}`);
    console.log(`   🔄 更新: ${patternResults.updated}`);
    console.log(`   ⏭️  跳过: ${patternResults.skipped}`);
    console.log(`   ❌ 错误: ${patternResults.errors.length}`);

    if (patternResults.errors.length > 0) {
      console.log('\\n⚠️  错误详情:');
      patternResults.errors.forEach(err => {
        console.log(`   - ${err.pattern}: ${err.error}`);
      });
    }

    // 2. 创建模式匹配
    const matchCount = await createErrorPatternMatches();

    // 3. 计算影响评分
    await calculatePatternImpact();

    console.log('\\n🎉 初始化完成!');
    console.log('='.repeat(50));
    console.log(`📈 总计创建 ${matchCount} 个模式匹配关系`);
    console.log(`🔍 错误预防系统已可使用这些模式进行智能分析`);

  } catch (error) {
    console.error('💥 初始化过程发生错误:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  });
}

export { initErrorPatterns, createErrorPatternMatches, calculatePatternImpact };