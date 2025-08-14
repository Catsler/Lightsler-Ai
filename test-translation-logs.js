#!/usr/bin/env node

/**
 * 测试翻译日志系统
 */

import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function testTranslationWithError() {
  console.log(`\n${colors.cyan}🧪 测试1: 触发翻译错误${colors.reset}\n`);
  
  try {
    // 故意触发错误：使用无效的资源类型
    const response = await fetch(`${API_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resources: [{
          id: "test-error-1",
          resourceType: "INVALID_TYPE", // 无效类型
          title: "Test Product",
          description: "This will cause an error"
        }],
        language: 'zh-CN'
      })
    });
    
    const result = await response.json();
    console.log('响应状态:', response.status);
    console.log('响应结果:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error(`${colors.red}请求失败:${colors.reset}`, error.message);
  }
}

async function testValidTranslation() {
  console.log(`\n${colors.cyan}🧪 测试2: 正常翻译${colors.reset}\n`);
  
  try {
    const response = await fetch(`${API_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resources: [{
          id: "test-success-1",
          resourceType: "product",
          title: "Organic Coffee",
          description: "Premium organic coffee beans from Colombia"
        }],
        language: 'zh-CN'
      })
    });
    
    const result = await response.json();
    console.log('响应状态:', response.status);
    if (result.success) {
      console.log(`${colors.green}翻译成功！${colors.reset}`);
      if (result.recentLogs) {
        console.log('\n最近的日志:');
        result.recentLogs.forEach((log, i) => {
          console.log(`  ${i + 1}. [${log.level}] ${log.message}`);
        });
      }
    }
    
  } catch (error) {
    console.error(`${colors.red}请求失败:${colors.reset}`, error.message);
  }
}

async function checkDatabaseLogs() {
  console.log(`\n${colors.cyan}📊 检查数据库中的错误日志${colors.reset}\n`);
  
  try {
    const logs = await prisma.errorLog.findMany({
      where: {
        errorType: 'TRANSLATION'
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    if (logs.length === 0) {
      console.log('数据库中暂无翻译错误日志');
    } else {
      console.log(`找到 ${colors.yellow}${logs.length}${colors.reset} 条错误日志:\n`);
      logs.forEach((log, i) => {
        console.log(`${i + 1}. ${log.createdAt.toLocaleString('zh-CN')}`);
        console.log(`   类型: ${log.errorCategory}`);
        console.log(`   消息: ${log.message}`);
        console.log(`   指纹: ${log.fingerprint}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error(`${colors.red}查询数据库失败:${colors.reset}`, error.message);
  }
}

async function testTranslationStats() {
  console.log(`\n${colors.cyan}📈 获取翻译统计${colors.reset}\n`);
  
  try {
    const response = await fetch(`${API_URL}/api/translation-logs?count=10`);
    
    if (response.ok) {
      const result = await response.json();
      
      if (result.data?.stats) {
        console.log('翻译统计:');
        console.log(`  总调用次数: ${result.data.stats.totalCalls}`);
        console.log(`  成功次数: ${result.data.stats.successCount}`);
        console.log(`  失败次数: ${result.data.stats.failureCount}`);
        console.log(`  警告次数: ${result.data.stats.warningCount}`);
        
        if (result.data.stats.successRate) {
          console.log(`  成功率: ${(result.data.stats.successRate * 100).toFixed(1)}%`);
        }
      }
      
      if (result.data?.logs && result.data.logs.length > 0) {
        console.log('\n最近的日志:');
        result.data.logs.slice(0, 5).forEach((log, i) => {
          console.log(`  ${i + 1}. [${log.level}] ${log.message}`);
        });
      }
    } else {
      console.log(`响应状态: ${response.status}`);
      const text = await response.text();
      console.log('响应内容:', text);
    }
    
  } catch (error) {
    console.error(`${colors.red}获取统计失败:${colors.reset}`, error.message);
  }
}

async function createTestErrorLog() {
  console.log(`\n${colors.cyan}💾 直接创建测试错误日志${colors.reset}\n`);
  
  try {
    const errorLog = await prisma.errorLog.create({
      data: {
        errorType: 'TRANSLATION',
        errorCategory: 'ERROR',
        errorCode: 'TEST_ERROR',
        message: '这是一个测试错误日志',
        fingerprint: `FP_TEST_${Date.now()}`,
        context: {
          test: true,
          timestamp: new Date().toISOString(),
          source: 'test-script'
        },
        environment: 'test',
        isTranslationError: true,
        resourceType: 'product',
        operation: 'translate'
      }
    });
    
    console.log(`${colors.green}成功创建测试错误日志:${colors.reset}`);
    console.log(`  ID: ${errorLog.id}`);
    console.log(`  指纹: ${errorLog.fingerprint}`);
    console.log(`  时间: ${errorLog.createdAt.toLocaleString('zh-CN')}`);
    
  } catch (error) {
    console.error(`${colors.red}创建错误日志失败:${colors.reset}`, error.message);
  }
}

async function main() {
  console.log(`${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}     翻译日志系统测试${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}`);
  
  try {
    // 1. 创建测试错误日志
    await createTestErrorLog();
    
    // 2. 测试翻译API（如果服务在运行）
    const checkResponse = await fetch(`${API_URL}/api/status`).catch(() => null);
    if (checkResponse && checkResponse.ok) {
      console.log(`\n${colors.green}开发服务器正在运行，执行API测试...${colors.reset}`);
      
      // await testTranslationWithError();
      await testValidTranslation();
      await testTranslationStats();
    } else {
      console.log(`\n${colors.yellow}开发服务器未运行，跳过API测试${colors.reset}`);
    }
    
    // 3. 检查数据库日志
    await checkDatabaseLogs();
    
    console.log(`\n${colors.green}✅ 测试完成！${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}测试失败:${colors.reset}`, error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
main().catch(console.error);