#!/usr/bin/env node

/**
 * Translation Hooks 性能评估工具
 * 评估hooks机制在生产环境的表现和影响
 */

import { config } from '../app/utils/config.server.js';
import { translationHooksManager } from '../app/services/translation-hooks-manager.server.js';
import { logger } from '../app/utils/logger.server.js';

async function evaluateHooksPerformance() {
  console.log('🔧 评估 Translation Hooks 机制性能表现...\n');

  try {
    // 1. 获取当前hooks配置状态
    const hooksStatus = translationHooksManager.getStatus();
    console.log('⚙️  Hooks 配置状态：');
    console.log(`   启用状态: ${hooksStatus.config.enabled ? '✅ 已启用' : '❌ 未启用'}`);
    console.log(`   灰度百分比: ${hooksStatus.config.rolloutPercentage}%`);
    console.log(`   支持的资源类型: ${hooksStatus.config.enabledResourceTypes.length > 0 ? hooksStatus.config.enabledResourceTypes.join(', ') : '全部'}`);
    console.log(`   Shop过滤: ${hooksStatus.config.enableShopIdFilter.length > 0 ? hooksStatus.config.enableShopIdFilter.join(', ') : '无'}`);
    console.log(`   超时设置: ${hooksStatus.config.timeoutMs}ms`);
    console.log(`   监控启用: ${hooksStatus.config.monitoringEnabled ? '✅' : '❌'}`);
    console.log(`   自定义hooks: ${hooksStatus.hasCustomHooks ? '✅' : '❌'}`);
    console.log();

    // 2. 测试hooks执行性能
    console.log('⚡ Hooks 性能测试：');

    const testContext = {
      text: 'Test translation text',
      targetLang: 'zh-CN',
      resourceType: 'PRODUCT',
      shopId: 'test-shop',
      resourceId: 'test-resource',
      sessionId: 'test-session',
      metadata: { test: true }
    };

    // 测试 shouldTranslate hook
    const shouldTranslateStart = Date.now();
    const shouldTranslateResult = await translationHooksManager.shouldTranslate(testContext);
    const shouldTranslateDuration = Date.now() - shouldTranslateStart;
    console.log(`   shouldTranslate: ${shouldTranslateDuration}ms (结果: ${shouldTranslateResult})`);

    // 测试 schedule hook
    const scheduleStart = Date.now();
    const testTask = async () => ({ success: true, text: 'Test result' });
    const scheduleResult = await translationHooksManager.schedule(testTask, { metadata: testContext.metadata });
    const scheduleDuration = Date.now() - scheduleStart;
    console.log(`   schedule: ${scheduleDuration}ms (成功: ${scheduleResult.success})`);

    // 测试 validate hook
    const validateStart = Date.now();
    const testResult = { success: true, text: 'Translated text' };
    const validationResult = await translationHooksManager.validate(testResult, testContext);
    const validateDuration = Date.now() - validateStart;
    console.log(`   validate: ${validateDuration}ms (通过: ${validationResult.success})`);
    console.log();

    // 3. 分析性能影响
    console.log('📈 性能影响分析：');
    const totalHooksOverhead = shouldTranslateDuration + scheduleDuration + validateDuration;
    console.log(`   总开销: ${totalHooksOverhead}ms`);

    const performanceRating = analyzePerformanceImpact(totalHooksOverhead, hooksStatus.config.timeoutMs);
    console.log(`   性能评级: ${performanceRating.rating} ${performanceRating.emoji}`);
    console.log(`   影响评估: ${performanceRating.description}`);
    console.log();

    // 4. 灰度发布策略评估
    console.log('🎯 灰度发布策略评估：');
    if (hooksStatus.config.enabled) {
      if (hooksStatus.config.rolloutPercentage === 0) {
        console.log('   🔴 当前状态: hooks已启用但灰度为0%，建议设置小百分比测试');
      } else if (hooksStatus.config.rolloutPercentage < 10) {
        console.log('   🟡 当前状态: 小范围灰度测试阶段，适合初期验证');
      } else if (hooksStatus.config.rolloutPercentage < 50) {
        console.log('   🟠 当前状态: 中等规模灰度，建议监控指标稳定后扩大');
      } else if (hooksStatus.config.rolloutPercentage < 100) {
        console.log('   🟢 当前状态: 大规模灰度，接近全量部署');
      } else {
        console.log('   ✅ 当前状态: 全量部署，hooks已完全替代原逻辑');
      }
    } else {
      console.log('   ⚪ 当前状态: hooks未启用，系统使用原始逻辑');
    }
    console.log();

    // 5. 环境变量配置建议
    console.log('💡 配置建议：');

    if (!hooksStatus.config.enabled) {
      console.log('   🚀 启动建议:');
      console.log('     export TRANSLATION_HOOKS_ENABLED=true');
      console.log('     export TRANSLATION_HOOKS_ROLLOUT_PERCENTAGE=5');
      console.log('     export TRANSLATION_HOOKS_RESOURCE_TYPES=PRODUCT,COLLECTION');
      console.log('     export TRANSLATION_HOOKS_MONITORING=true');
    } else {
      const nextRolloutPercentage = Math.min(hooksStatus.config.rolloutPercentage * 2, 100);
      if (hooksStatus.config.rolloutPercentage < 100) {
        console.log('   📈 扩容建议:');
        console.log(`     export TRANSLATION_HOOKS_ROLLOUT_PERCENTAGE=${nextRolloutPercentage}`);
      }

      if (hooksStatus.config.enabledResourceTypes.length > 0) {
        console.log('   🔓 放开限制:');
        console.log('     export TRANSLATION_HOOKS_RESOURCE_TYPES=""  # 支持所有资源类型');
      }
    }
    console.log();

    console.log('\n✅ Hooks性能评估完成！');

  } catch (error) {
    console.error('❌ 评估失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 分析性能影响
 */
function analyzePerformanceImpact(overhead, timeout) {
  if (overhead < 10) {
    return {
      rating: 'A+',
      emoji: '🚀',
      description: '性能影响极小，几乎无感知'
    };
  } else if (overhead < 50) {
    return {
      rating: 'A',
      emoji: '✅',
      description: '性能影响很小，完全可接受'
    };
  } else if (overhead < 200) {
    return {
      rating: 'B',
      emoji: '🟢',
      description: '性能影响较小，在合理范围内'
    };
  } else if (overhead < 500) {
    return {
      rating: 'C',
      emoji: '🟡',
      description: '性能影响中等，需要关注'
    };
  } else if (overhead < 1000) {
    return {
      rating: 'D',
      emoji: '🟠',
      description: '性能影响较大，建议优化'
    };
  } else {
    return {
      rating: 'F',
      emoji: '🔴',
      description: '性能影响严重，必须优化'
    };
  }
}

// 执行评估
evaluateHooksPerformance();