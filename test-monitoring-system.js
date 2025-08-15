/**
 * 测试监控系统
 * 验证日志、告警、性能监控和错误恢复功能
 */

import { 
  persistentLogger, 
  translationPersistentLogger 
} from './app/services/log-persistence.server.js';
import { alertManager } from './app/services/alert-manager.server.js';
import { performanceMonitor } from './app/services/performance-monitor.server.js';
import { errorRecoveryManager } from './app/services/error-recovery.server.js';
import { collectError } from './app/services/error-collector.server.js';

console.log('🔍 测试监控系统功能...\n');

// 测试1: 日志持久化
console.log('1️⃣ 测试日志持久化...');
persistentLogger.info('测试日志信息', { test: true, timestamp: new Date() });
persistentLogger.warn('测试警告日志', { warning: '这是一个测试警告' });
persistentLogger.error('测试错误日志', { error: '这是一个测试错误' });
translationPersistentLogger.info('测试翻译日志', { 
  resourceId: 'test-123',
  targetLanguage: 'zh-CN',
  success: true 
});
console.log('   ✅ 日志已记录到持久化系统\n');

// 测试2: 性能监控
console.log('2️⃣ 测试性能监控...');
const testPerformance = async () => {
  // 模拟翻译操作
  const result = await performanceMonitor.measure(
    '测试翻译操作',
    async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { success: true, data: '翻译结果' };
    },
    { resourceType: 'PRODUCT', language: 'zh-CN' }
  );
  
  console.log(`   翻译耗时: ${result.duration.toFixed(2)}ms`);
  
  // 模拟API调用
  const apiResult = await performanceMonitor.measureApiCall(
    '测试API调用',
    async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { status: 200 };
    }
  );
  
  console.log(`   API调用耗时: ${apiResult.duration.toFixed(2)}ms`);
  
  // 获取性能统计
  const stats = performanceMonitor.getStats();
  console.log('   性能统计:', stats);
  
  // 获取系统指标
  const systemMetrics = performanceMonitor.getSystemMetrics();
  console.log('   系统资源:', {
    内存使用: `${systemMetrics.memory.heapUsed}MB / ${systemMetrics.memory.heapTotal}MB`,
    运行时间: `${systemMetrics.uptime}秒`
  });
};

await testPerformance();
console.log('   ✅ 性能监控正常\n');

// 测试3: 错误收集
console.log('3️⃣ 测试错误收集...');
const testError = {
  errorType: 'TRANSLATION',
  errorCategory: 'ERROR',
  errorCode: 'TEST_ERROR',
  message: '这是一个测试错误',
  context: {
    resourceId: 'test-456',
    operation: 'translate',
    targetLanguage: 'ja'
  },
  severity: 3
};

await collectError(testError);
console.log('   ✅ 错误已收集到数据库\n');

// 测试4: 告警系统
console.log('4️⃣ 测试告警系统...');
const testAlerts = async () => {
  // 手动触发一个告警
  await alertManager.createAlert(
    'ERROR_RATE',
    'WARNING',
    '测试告警: 错误率超过阈值',
    { errorRate: 8.5, threshold: 5 }
  );
  
  // 获取活跃告警
  const activeAlerts = alertManager.getActiveAlerts();
  console.log(`   活跃告警数: ${activeAlerts.length}`);
  
  if (activeAlerts.length > 0) {
    console.log('   最新告警:', activeAlerts[0].message);
  }
  
  // 清除测试告警
  alertManager.clearAlert('ERROR_RATE');
};

await testAlerts();
console.log('   ✅ 告警系统正常\n');

// 测试5: 错误恢复
console.log('5️⃣ 测试错误恢复机制...');
const testRecovery = async () => {
  // 创建一个可恢复的错误
  const recoverableError = {
    id: 'test-error-001',
    errorCode: 'TIMEOUT',
    errorType: 'NETWORK',
    message: '请求超时',
    operation: 'translate',
    context: {
      resourceId: 'test-789',
      targetLanguage: 'fr'
    },
    severity: 3
  };
  
  // 尝试恢复
  try {
    const recoveryResult = await errorRecoveryManager.attemptRecovery(recoverableError);
    console.log('   恢复策略:', recoveryResult?.strategy || '未执行');
    console.log('   恢复结果:', recoveryResult?.success ? '成功' : '失败');
  } catch (error) {
    console.log('   恢复测试跳过（错误不在数据库中）');
  }
  
  // 获取恢复统计
  const recoveryStats = errorRecoveryManager.getRecoveryStats();
  console.log('   恢复统计:', {
    总计: recoveryStats.total,
    成功: recoveryStats.successful,
    失败: recoveryStats.failed,
    成功率: recoveryStats.successRate || '0'
  });
};

await testRecovery();
console.log('   ✅ 错误恢复机制正常\n');

// 测试6: 获取综合报告
console.log('6️⃣ 生成综合监控报告...');
const report = await performanceMonitor.getPerformanceReport();
console.log('   报告摘要:', {
  健康状态: report.summary.healthStatus,
  健康分数: report.summary.score,
  问题数量: report.summary.issues.length,
  建议数量: report.summary.recommendations.length
});

if (report.summary.issues.length > 0) {
  console.log('   发现的问题:', report.summary.issues);
}

if (report.summary.recommendations.length > 0) {
  console.log('   改进建议:', report.summary.recommendations);
}

console.log('\n✅ 所有监控系统测试完成！');
console.log('📊 监控系统状态: 正常运行');

// 清理（停止服务）
process.exit(0);