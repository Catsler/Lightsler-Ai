#!/usr/bin/env node

/**
 * Sequential Thinking 系统集成测试演示脚本
 * 
 * 这个脚本演示了完整的sequential thinking功能协作：
 * - 翻译会话管理与断点续传
 * - 智能跳过引擎的资源评估
 * - 版本检测与增量更新
 * - 错误预防与质量分析
 * - 自动恢复机制
 */

import { PrismaClient } from '@prisma/client';
import { translationSessionManager } from './app/services/translation-session-manager.server.js';
import { intelligentSkipEngine } from './app/services/intelligent-skip-engine.server.js';
import { versionDetectionService } from './app/services/version-detection.server.js';
import { errorPreventionGuard } from './app/services/error-prevention-guard.server.js';
import { qualityErrorAnalyzer } from './app/services/quality-error-analyzer.server.js';
import { autoRecoveryService } from './app/services/auto-recovery.server.js';

const prisma = new PrismaClient();

/**
 * 模拟店铺数据
 */
const MOCK_SHOP_ID = 'test-shop-sequential-thinking';

/**
 * 创建测试数据
 */
async function setupTestData() {
  console.log('🔧 创建测试数据...');

  // 清理之前的测试数据
  await prisma.translation.deleteMany({ where: { shopId: MOCK_SHOP_ID } });
  await prisma.resource.deleteMany({ where: { shopId: MOCK_SHOP_ID } });
  await prisma.translationSession.deleteMany({ where: { shopId: MOCK_SHOP_ID } });

  // 创建模拟资源
  const resources = [];
  for (let i = 1; i <= 10; i++) {
    const resource = await prisma.resource.create({
      data: {
        shopId: MOCK_SHOP_ID,
        resourceType: i <= 3 ? 'PRODUCT' : i <= 6 ? 'COLLECTION' : 'PAGE',
        gid: `gid://shopify/Product/${1000 + i}`,
        resourceId: `resource-${i}`,
        originalResourceId: `${1000 + i}`,
        title: `测试资源 ${i}`,
        description: `这是测试资源${i}的详细描述，包含丰富的内容供翻译测试使用。`,
        handle: `test-resource-${i}`,
        status: 'pending',
        tags: JSON.stringify(['test', 'sequential-thinking']),
        contentHash: `hash-${i}-${Date.now()}`,
        contentVersion: 1,
        lastScannedAt: new Date(),
        errorCount: 0
      }
    });
    resources.push(resource);
  }

  console.log(`✅ 创建了 ${resources.length} 个测试资源`);
  return resources;
}

/**
 * 演示1: 翻译会话管理与断点续传
 */
async function demonstrateSessionManagement(resources) {
  console.log('\\n📋 演示1: 翻译会话管理与断点续传');
  console.log('-'.repeat(50));

  try {
    // 创建翻译会话
    const session = await translationSessionManager.createSession({
      shopId: MOCK_SHOP_ID,
      sessionName: 'Sequential Thinking 测试会话',
      sessionType: 'BATCH',
      resourceIds: resources.slice(0, 5).map(r => r.id),
      languages: ['zh-CN', 'ja', 'ko'],
      translationConfig: {
        quality: 'high',
        enableBrandProtection: true
      },
      batchSize: 2,
      qualityThreshold: 0.7
    });

    console.log(`✅ 创建会话: ${session.id}`);
    console.log(`   - 名称: ${session.sessionName}`);
    console.log(`   - 资源数量: ${session.totalResources}`);
    console.log(`   - 目标语言: ${session.languages.join(', ')}`);

    // 启动会话
    const startResult = await translationSessionManager.startSession(session.id);
    console.log(`🚀 启动会话: ${startResult.success ? '成功' : '失败'}`);

    // 模拟处理一些任务后暂停
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await translationSessionManager.updateProgress(session.id, {
      processedResources: 2,
      completedTranslations: 4,
      errorCount: 0
    });

    const pauseResult = await translationSessionManager.pauseSession(session.id, 'DEMO_PAUSE');
    console.log(`⏸️  暂停会话: ${pauseResult.success ? '成功' : '失败'}`);

    // 演示断点续传
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const resumeResult = await translationSessionManager.resumeSession(session.id);
    console.log(`▶️  恢复会话: ${resumeResult.success ? '成功' : '失败'}`);

    // 获取会话状态
    const status = await translationSessionManager.getSessionStatus(session.id);
    console.log(`📊 会话状态: ${status.status}`);
    console.log(`   - 进度: ${status.progressPercentage}%`);
    console.log(`   - 检查点: ${status.checkpoints.length} 个`);

    return session;
  } catch (error) {
    console.error('❌ 会话管理演示失败:', error.message);
    throw error;
  }
}

/**
 * 演示2: 智能跳过引擎
 */
async function demonstrateIntelligentSkip(resources, session) {
  console.log('\\n🧠 演示2: 智能跳过引擎');
  console.log('-'.repeat(50));

  try {
    const testResource = resources[0];
    const targetLanguage = 'zh-CN';

    // 创建一些历史翻译数据模拟
    await prisma.translation.create({
      data: {
        resourceId: testResource.id,
        shopId: MOCK_SHOP_ID,
        language: targetLanguage,
        status: 'completed',
        qualityScore: 0.85,
        titleTrans: '测试产品标题',
        descTrans: '这是一个高质量的翻译结果',
        translationSessionId: session.id
      }
    });

    // 评估是否应该跳过
    const skipEvaluation = await intelligentSkipEngine.evaluateSkip(
      testResource,
      targetLanguage,
      {
        sessionId: session.id,
        qualityThreshold: 0.7,
        checkContentChange: true
      }
    );

    console.log(`🔍 跳过评估结果:`);
    console.log(`   - 建议跳过: ${skipEvaluation.shouldSkip ? '是' : '否'}`);
    console.log(`   - 跳过原因: ${skipEvaluation.reason || '无'}`);
    console.log(`   - 置信度: ${Math.round(skipEvaluation.confidence * 100)}%`);
    console.log(`   - 风险评分: ${skipEvaluation.riskScore}`);

    // 批量评估演示
    const batchResults = await intelligentSkipEngine.batchEvaluate(
      resources.slice(0, 3),
      ['zh-CN', 'ja'],
      {
        sessionId: session.id,
        concurrency: 2,
        qualityThreshold: 0.6
      }
    );

    const evaluations = Array.from(batchResults.values());
    const skipCount = evaluations.filter(e => e.shouldSkip).length;
    
    console.log(`📊 批量评估完成:`);
    console.log(`   - 总评估数: ${evaluations.length}`);
    console.log(`   - 建议跳过: ${skipCount} 个`);
    console.log(`   - 跳过率: ${Math.round((skipCount / evaluations.length) * 100)}%`);

    return batchResults;
  } catch (error) {
    console.error('❌ 智能跳过演示失败:', error.message);
    throw error;
  }
}

/**
 * 演示3: 版本检测与增量更新
 */
async function demonstrateVersionDetection(resources) {
  console.log('\\n🔄 演示3: 版本检测与增量更新');
  console.log('-'.repeat(50));

  try {
    // 模拟资源内容变更
    const testResource = resources[0];
    
    // 更新资源内容
    await prisma.resource.update({
      where: { id: testResource.id },
      data: {
        title: testResource.title + ' (已更新)',
        description: testResource.description + ' 这是新增的内容。',
        contentVersion: 2,
        lastScannedAt: new Date()
      }
    });

    // 检测版本变更
    const versionInfo = await versionDetectionService.getResourceVersionInfo(
      MOCK_SHOP_ID,
      testResource.resourceType,
      testResource.resourceId
    );

    console.log(`📋 版本信息:`);
    console.log(`   - 当前版本: ${versionInfo.currentVersion}`);
    console.log(`   - 有待处理变更: ${versionInfo.hasPendingChanges ? '是' : '否'}`);
    console.log(`   - 最后更新: ${versionInfo.lastUpdated}`);

    // 执行增量检测
    const incrementalResults = await versionDetectionService.detectIncrementalChanges(MOCK_SHOP_ID, {
      since: new Date(Date.now() - 60 * 60 * 1000), // 1小时前
      resourceTypes: ['PRODUCT', 'COLLECTION']
    });

    console.log(`🔍 增量检测结果:`);
    console.log(`   - 检查的资源: ${incrementalResults.summary.totalProcessed}`);
    console.log(`   - 发现变更: ${incrementalResults.summary.totalChanges}`);
    console.log(`   - 新增资源: ${incrementalResults.summary.newResources}`);
    console.log(`   - 修改资源: ${incrementalResults.summary.modifiedResources}`);

    return incrementalResults;
  } catch (error) {
    console.error('❌ 版本检测演示失败:', error.message);
    throw error;
  }
}

/**
 * 演示4: 错误预防与质量分析
 */
async function demonstrateQualityAnalysis(resources) {
  console.log('\\n🛡️ 演示4: 错误预防与质量分析');
  console.log('-'.repeat(50));

  try {
    const testResource = resources[0];
    
    // 模拟翻译上下文
    const translationContext = {
      shopId: MOCK_SHOP_ID,
      resourceId: testResource.id,
      resourceType: testResource.resourceType,
      language: 'zh-CN',
      content: testResource.description,
      translationConfig: {
        quality: 'high',
        preserveBrands: true
      }
    };

    // 风险评估
    const riskAssessment = await errorPreventionGuard.assessTranslationRisk(translationContext);
    
    console.log(`⚠️ 风险评估:`);
    console.log(`   - 总体风险: ${riskAssessment.overallRisk}`);
    console.log(`   - 风险等级: ${riskAssessment.riskLevel}`);
    console.log(`   - 可以继续: ${riskAssessment.canProceed ? '是' : '否'}`);
    console.log(`   - 建议措施: ${riskAssessment.recommendations.length} 项`);

    // 质量分析
    const qualityAssessment = await qualityErrorAnalyzer.assessTranslationQuality({
      resourceId: testResource.id,
      language: 'zh-CN',
      originalText: testResource.description,
      translatedText: '这是一个优质的中文翻译结果，保持了原文的完整性和准确性。',
      resourceType: testResource.resourceType,
      shopId: MOCK_SHOP_ID
    });

    console.log(`📊 质量评估:`);
    console.log(`   - 总体评分: ${Math.round(qualityAssessment.overallScore * 100)}/100`);
    console.log(`   - 质量等级: ${qualityAssessment.qualityLevel}`);
    console.log(`   - 发现问题: ${qualityAssessment.issues.length} 个`);
    console.log(`   - 改进建议: ${qualityAssessment.recommendations.length} 项`);

    // 质量风险预测
    const riskPrediction = await qualityErrorAnalyzer.predictQualityRisk({
      shopId: MOCK_SHOP_ID,
      resourceType: testResource.resourceType,
      language: 'zh-CN',
      contentLength: testResource.description.length
    });

    console.log(`🔮 风险预测:`);
    console.log(`   - 风险等级: ${riskPrediction.riskLevel}`);
    console.log(`   - 风险分值: ${Math.round(riskPrediction.riskScore * 100)}/100`);
    console.log(`   - 预测置信度: ${Math.round(riskPrediction.confidence * 100)}%`);

    return { riskAssessment, qualityAssessment, riskPrediction };
  } catch (error) {
    console.error('❌ 质量分析演示失败:', error.message);
    throw error;
  }
}

/**
 * 演示5: 自动恢复机制
 */
async function demonstrateAutoRecovery() {
  console.log('\\n🔧 演示5: 自动恢复机制');
  console.log('-'.repeat(50));

  try {
    // 模拟一个翻译错误
    const mockError = {
      message: 'Translation API timeout occurred',
      code: 'API_TIMEOUT'
    };

    const errorContext = {
      shopId: MOCK_SHOP_ID,
      resourceId: 'test-resource-1',
      operation: 'translate',
      resourceType: 'PRODUCT',
      language: 'zh-CN'
    };

    // 执行自动诊断和恢复
    const recoveryResult = await autoRecoveryService.diagnoseAndRecover(mockError, errorContext);

    console.log(`🔧 自动恢复结果:`);
    console.log(`   - 恢复成功: ${recoveryResult.success ? '是' : '否'}`);
    console.log(`   - 执行策略: ${recoveryResult.strategy || '无'}`);
    console.log(`   - 恢复操作: ${recoveryResult.action || '无'}`);
    console.log(`   - 处理时间: ${recoveryResult.recoveryTime || 0}ms`);

    // 系统健康检查
    const healthCheck = await autoRecoveryService.performSystemHealthCheck(MOCK_SHOP_ID);

    console.log(`🏥 系统健康检查:`);
    console.log(`   - 整体健康: ${healthCheck.overallHealth}`);
    console.log(`   - 发现问题: ${healthCheck.issues.length} 个`);
    console.log(`   - 维护操作: ${healthCheck.maintenanceActions.length} 个`);
    console.log(`   - 改进建议: ${healthCheck.recommendations.length} 项`);

    return { recoveryResult, healthCheck };
  } catch (error) {
    console.error('❌ 自动恢复演示失败:', error.message);
    throw error;
  }
}

/**
 * 综合演示所有功能协作
 */
async function demonstrateFullWorkflow(resources) {
  console.log('\\n🎯 演示6: 完整工作流程协作');
  console.log('-'.repeat(50));

  try {
    // 1. 创建完整的翻译会话
    const session = await translationSessionManager.createSession({
      shopId: MOCK_SHOP_ID,
      sessionName: 'Sequential Thinking 完整流程演示',
      sessionType: 'SMART_BATCH',
      resourceIds: resources.map(r => r.id),
      languages: ['zh-CN', 'ja'],
      translationConfig: {
        enableIntelligentSkip: true,
        enableQualityAnalysis: true,
        enableAutoRecovery: true,
        qualityThreshold: 0.7
      }
    });

    console.log(`🎬 开始完整流程演示:`);
    console.log(`   - 会话ID: ${session.id}`);
    console.log(`   - 总资源数: ${session.totalResources}`);

    // 2. 启动会话并模拟处理流程
    await translationSessionManager.startSession(session.id);
    
    // 3. 逐个处理资源（模拟真实流程）
    let processedCount = 0;
    let skippedCount = 0;
    let qualityIssues = 0;
    
    for (const resource of resources.slice(0, 3)) { // 只处理前3个资源作为演示
      console.log(`\\n   处理资源: ${resource.title}`);
      
      // Step 1: 智能跳过评估
      const skipEval = await intelligentSkipEngine.evaluateSkip(resource, 'zh-CN');
      if (skipEval.shouldSkip) {
        console.log(`     ⏭️ 智能跳过: ${skipEval.reason}`);
        skippedCount++;
        continue;
      }
      
      // Step 2: 风险预防评估
      const riskAssessment = await errorPreventionGuard.assessTranslationRisk({
        shopId: MOCK_SHOP_ID,
        resourceId: resource.id,
        resourceType: resource.resourceType,
        language: 'zh-CN',
        content: resource.description
      });
      
      if (riskAssessment.overallRisk > 0.7) {
        console.log(`     ⚠️ 高风险，暂停处理`);
        continue;
      }
      
      // Step 3: 模拟翻译过程
      console.log(`     🔄 执行翻译...`);
      
      // Step 4: 质量评估
      const qualityResult = await qualityErrorAnalyzer.assessTranslationQuality({
        resourceId: resource.id,
        language: 'zh-CN',
        originalText: resource.description,
        translatedText: `${resource.description} 的中文翻译版本`,
        resourceType: resource.resourceType,
        shopId: MOCK_SHOP_ID,
        sessionId: session.id
      });
      
      if (qualityResult.overallScore < 0.6) {
        console.log(`     ❌ 质量不达标: ${qualityResult.qualityLevel}`);
        qualityIssues++;
      } else {
        console.log(`     ✅ 质量良好: ${qualityResult.qualityLevel}`);
      }
      
      processedCount++;
      
      // 更新进度
      await translationSessionManager.updateProgress(session.id, {
        processedResources: processedCount,
        completedTranslations: processedCount,
        skippedCount,
        qualityIssues
      });
    }
    
    // 5. 完成会话
    await translationSessionManager.completeSession(session.id, {
      processedResources: processedCount,
      completedTranslations: processedCount,
      skippedCount,
      qualityIssues,
      totalDuration: 5000
    });

    console.log(`\\n🎊 流程演示完成:`);
    console.log(`   - 处理资源: ${processedCount} 个`);
    console.log(`   - 智能跳过: ${skippedCount} 个`);
    console.log(`   - 质量问题: ${qualityIssues} 个`);
    console.log(`   - 整体效率: ${Math.round((1 - (skippedCount + qualityIssues) / resources.slice(0, 3).length) * 100)}%`);

    return session;
  } catch (error) {
    console.error('❌ 完整流程演示失败:', error.message);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 Sequential Thinking 系统集成演示');
    console.log('='.repeat(60));
    console.log('');
    console.log('这个演示展示了完整的sequential thinking功能协作：');
    console.log('• 断点续传的翻译会话管理');
    console.log('• 基于AI的智能跳过决策');
    console.log('• 实时版本检测与增量更新');
    console.log('• 预防式错误检测与处理');
    console.log('• 多维度翻译质量分析');
    console.log('• 自适应的自动恢复机制');
    console.log('');

    // 设置测试数据
    const resources = await setupTestData();

    // 演示各个功能模块
    const session1 = await demonstrateSessionManagement(resources);
    const skipResults = await demonstrateIntelligentSkip(resources, session1);
    const versionResults = await demonstrateVersionDetection(resources);
    const qualityResults = await demonstrateQualityAnalysis(resources);
    const recoveryResults = await demonstrateAutoRecovery();

    // 综合演示
    const fullSession = await demonstrateFullWorkflow(resources);

    console.log('\\n🎉 演示完成！');
    console.log('='.repeat(60));
    console.log('Sequential Thinking 系统已成功展示以下能力：');
    console.log('');
    console.log('✅ 智能会话管理 - 支持断点续传和状态恢复');
    console.log('✅ 智能跳过引擎 - 基于内容变化和质量历史的智能决策');
    console.log('✅ 版本检测系统 - 增量更新和内容同步');
    console.log('✅ 错误预防机制 - 事前风险评估和预防措施');
    console.log('✅ 质量分析系统 - 多维度质量评估和预测');
    console.log('✅ 自动恢复能力 - 错误诊断和自动修复');
    console.log('');
    console.log('🚀 系统已准备好处理大规模翻译任务！');
    
  } catch (error) {
    console.error('💥 演示过程发生错误:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 演示脚本执行失败:', error);
    process.exit(1);
  });
}

export { setupTestData, demonstrateSessionManagement, demonstrateIntelligentSkip };