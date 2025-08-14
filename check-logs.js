#!/usr/bin/env node

/**
 * 简化版日志查看工具
 * 直接查询数据库中的错误日志
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function formatDate(date) {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function main() {
  const args = process.argv.slice(2);
  const hours = parseInt(args[0]) || 24;
  
  console.log(`\n${colors.cyan}📊 翻译系统错误日志（最近${hours}小时）${colors.reset}\n`);
  
  try {
    const since = new Date();
    since.setHours(since.getHours() - hours);
    
    // 查询所有翻译相关的错误
    const logs = await prisma.errorLog.findMany({
      where: {
        OR: [
          { errorType: 'TRANSLATION' },
          { isTranslationError: true }
        ],
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    if (logs.length === 0) {
      console.log(`${colors.gray}最近${hours}小时内没有翻译错误记录${colors.reset}`);
      return;
    }
    
    console.log(`找到 ${colors.yellow}${logs.length}${colors.reset} 条错误记录\n`);
    
    // 按错误类型分组统计
    const stats = {};
    logs.forEach(log => {
      const key = `${log.errorCategory}_${log.resourceType || 'UNKNOWN'}`;
      stats[key] = (stats[key] || 0) + 1;
    });
    
    console.log(`${colors.blue}错误分布:${colors.reset}`);
    Object.entries(stats).forEach(([key, count]) => {
      const [category, resource] = key.split('_');
      const color = category === 'ERROR' ? colors.red : colors.yellow;
      console.log(`  ${color}${category}${colors.reset} - ${resource}: ${count}次`);
    });
    console.log('');
    
    // 显示最近的错误详情
    console.log(`${colors.blue}最近的错误详情:${colors.reset}\n`);
    
    logs.slice(0, 10).forEach((log, index) => {
      const color = log.errorCategory === 'ERROR' ? colors.red : colors.yellow;
      
      console.log(`${colors.gray}${index + 1}.${colors.reset} ${formatDate(log.createdAt)}`);
      console.log(`   ${color}[${log.errorCategory}]${colors.reset} ${log.message}`);
      
      if (log.resourceType) {
        console.log(`   ${colors.gray}资源类型:${colors.reset} ${log.resourceType}`);
      }
      
      if (log.resourceId) {
        console.log(`   ${colors.gray}资源ID:${colors.reset} ${log.resourceId}`);
      }
      
      console.log(`   ${colors.gray}指纹:${colors.reset} ${log.fingerprint}`);
      
      // 显示翻译上下文（如果有）
      if (log.translationContext) {
        try {
          const context = typeof log.translationContext === 'string' 
            ? JSON.parse(log.translationContext) 
            : log.translationContext;
          
          if (context.language) {
            console.log(`   ${colors.gray}目标语言:${colors.reset} ${context.language}`);
          }
          if (context.error) {
            console.log(`   ${colors.gray}错误详情:${colors.reset} ${context.error}`);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
      
      console.log('');
    });
    
    // 显示最频繁的错误
    const frequentErrors = await prisma.errorLog.groupBy({
      by: ['fingerprint', 'message'],
      where: {
        OR: [
          { errorType: 'TRANSLATION' },
          { isTranslationError: true }
        ],
        createdAt: { gte: since }
      },
      _count: true,
      orderBy: {
        _count: {
          fingerprint: 'desc'
        }
      },
      take: 5
    });
    
    if (frequentErrors.length > 0) {
      console.log(`${colors.blue}最频繁的错误:${colors.reset}\n`);
      frequentErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.message}`);
        console.log(`   ${colors.gray}指纹: ${error.fingerprint}${colors.reset}`);
        console.log(`   ${colors.yellow}出现次数: ${error._count}${colors.reset}\n`);
      });
    }
    
  } catch (error) {
    console.error(`${colors.red}查询失败:${colors.reset}`, error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// 显示使用说明
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
${colors.cyan}日志查看工具${colors.reset}

使用方法:
  node check-logs.js [小时数]

参数:
  小时数 - 查看最近N小时的日志（默认24小时）

示例:
  node check-logs.js        # 查看最近24小时的日志
  node check-logs.js 48     # 查看最近48小时的日志
  node check-logs.js 1      # 查看最近1小时的日志
`);
  process.exit(0);
}

// 运行主函数
main().catch(console.error);