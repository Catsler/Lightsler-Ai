#!/usr/bin/env node

/**
 * 翻译日志查看工具
 * 用于查看和分析翻译系统的日志记录
 */

import { PrismaClient } from '@prisma/client';
import { translationLogger } from './app/services/translation.server.js';

const prisma = new PrismaClient();

// 命令行参数解析
const args = process.argv.slice(2);
const command = args[0] || 'recent';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
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

function formatLogLevel(level) {
  switch (level.toLowerCase()) {
    case 'error':
      return `${colors.red}[ERROR]${colors.reset}`;
    case 'warn':
    case 'warning':
      return `${colors.yellow}[WARN]${colors.reset}`;
    case 'info':
      return `${colors.blue}[INFO]${colors.reset}`;
    default:
      return `${colors.gray}[${level.toUpperCase()}]${colors.reset}`;
  }
}

async function showRecentLogs(count = 20) {
  console.log(`\n${colors.cyan}📋 最近的翻译日志（内存）${colors.reset}\n`);
  
  const logs = translationLogger.getRecentLogs(count);
  
  if (logs.length === 0) {
    console.log('暂无日志记录（服务可能刚启动）');
    return;
  }
  
  logs.forEach((log, index) => {
    console.log(`${colors.gray}${index + 1}.${colors.reset} ${formatDate(log.timestamp)} ${formatLogLevel(log.level)}`);
    console.log(`   ${log.message}`);
    if (log.data) {
      try {
        const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data;
        if (data.resourceType) console.log(`   ${colors.gray}资源类型:${colors.reset} ${data.resourceType}`);
        if (data.language) console.log(`   ${colors.gray}语言:${colors.reset} ${data.language}`);
        if (data.error) console.log(`   ${colors.red}错误:${colors.reset} ${data.error}`);
      } catch (e) {
        // 忽略解析错误
      }
    }
    console.log('');
  });
}

async function showDatabaseLogs(hours = 24) {
  console.log(`\n${colors.cyan}📊 数据库中的翻译错误日志（最近${hours}小时）${colors.reset}\n`);
  
  const since = new Date();
  since.setHours(since.getHours() - hours);
  
  try {
    const logs = await prisma.errorLog.findMany({
      where: {
        errorType: 'TRANSLATION',
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    if (logs.length === 0) {
      console.log(`最近${hours}小时内没有翻译错误记录`);
      return;
    }
    
    console.log(`找到 ${colors.yellow}${logs.length}${colors.reset} 条错误记录\n`);
    
    logs.forEach((log, index) => {
      console.log(`${colors.gray}${index + 1}.${colors.reset} ${formatDate(log.createdAt)} ${formatLogLevel(log.errorCategory)}`);
      console.log(`   ${colors.red}错误:${colors.reset} ${log.message}`);
      console.log(`   ${colors.gray}指纹:${colors.reset} ${log.fingerprint}`);
      if (log.resourceType) console.log(`   ${colors.gray}资源:${colors.reset} ${log.resourceType}`);
      if (log.occurrences > 1) console.log(`   ${colors.yellow}发生次数:${colors.reset} ${log.occurrences}`);
      console.log('');
    });
    
  } catch (error) {
    console.error(`${colors.red}查询数据库失败:${colors.reset}`, error.message);
  }
}

async function showErrorStats() {
  console.log(`\n${colors.cyan}📈 翻译错误统计${colors.reset}\n`);
  
  try {
    // 24小时统计
    const last24h = new Date();
    last24h.setHours(last24h.getHours() - 24);
    
    // 7天统计
    const last7d = new Date();
    last7d.setDate(last7d.getDate() - 7);
    
    // 按类型统计
    const statsByType = await prisma.errorLog.groupBy({
      by: ['errorCategory', 'resourceType'],
      where: {
        errorType: 'TRANSLATION',
        createdAt: { gte: last24h }
      },
      _count: true
    });
    
    // 按指纹统计（找出最频繁的错误）
    const statsByFingerprint = await prisma.errorLog.groupBy({
      by: ['fingerprint', 'message'],
      where: {
        errorType: 'TRANSLATION',
        createdAt: { gte: last7d }
      },
      _count: true,
      orderBy: {
        _count: {
          fingerprint: 'desc'
        }
      },
      take: 10
    });
    
    // 总计
    const totalErrors = await prisma.errorLog.count({
      where: {
        errorType: 'TRANSLATION',
        createdAt: { gte: last24h }
      }
    });
    
    console.log(`${colors.yellow}过去24小时错误总数:${colors.reset} ${totalErrors}\n`);
    
    if (statsByType.length > 0) {
      console.log(`${colors.blue}按类型分组:${colors.reset}`);
      statsByType.forEach(stat => {
        const resourceType = stat.resourceType || '未知';
        console.log(`  ${stat.errorCategory} - ${resourceType}: ${stat._count}`);
      });
    }
    
    if (statsByFingerprint.length > 0) {
      console.log(`\n${colors.blue}最频繁的错误（过去7天）:${colors.reset}`);
      statsByFingerprint.forEach((stat, index) => {
        console.log(`  ${index + 1}. ${stat.message.substring(0, 60)}...`);
        console.log(`     ${colors.gray}指纹: ${stat.fingerprint} | 次数: ${stat._count}${colors.reset}`);
      });
    }
    
  } catch (error) {
    console.error(`${colors.red}统计失败:${colors.reset}`, error.message);
  }
}

async function searchLogs(keyword) {
  console.log(`\n${colors.cyan}🔍 搜索包含 "${keyword}" 的日志${colors.reset}\n`);
  
  try {
    const logs = await prisma.errorLog.findMany({
      where: {
        errorType: 'TRANSLATION',
        OR: [
          { message: { contains: keyword } },
          { resourceType: { contains: keyword } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    
    if (logs.length === 0) {
      console.log(`没有找到包含 "${keyword}" 的日志`);
      return;
    }
    
    console.log(`找到 ${colors.yellow}${logs.length}${colors.reset} 条相关记录\n`);
    
    logs.forEach((log, index) => {
      console.log(`${colors.gray}${index + 1}.${colors.reset} ${formatDate(log.createdAt)}`);
      console.log(`   ${log.message}`);
      console.log('');
    });
    
  } catch (error) {
    console.error(`${colors.red}搜索失败:${colors.reset}`, error.message);
  }
}

async function clearOldLogs(days = 30) {
  console.log(`\n${colors.cyan}🗑️  清理超过${days}天的旧日志${colors.reset}\n`);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  try {
    const result = await prisma.errorLog.deleteMany({
      where: {
        errorType: 'TRANSLATION',
        createdAt: { lt: cutoffDate }
      }
    });
    
    console.log(`${colors.green}成功删除 ${result.count} 条旧日志${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}清理失败:${colors.reset}`, error.message);
  }
}

async function showHelp() {
  console.log(`
${colors.cyan}翻译日志查看工具${colors.reset}

使用方法:
  node view-translation-logs.js [命令] [参数]

命令:
  recent [count]       - 显示最近的内存日志（默认20条）
  db [hours]          - 显示数据库中的错误日志（默认24小时）
  stats               - 显示错误统计信息
  search <keyword>    - 搜索包含关键词的日志
  clear [days]        - 清理旧日志（默认30天）
  help                - 显示帮助信息

示例:
  node view-translation-logs.js recent 50
  node view-translation-logs.js db 48
  node view-translation-logs.js search "API"
  node view-translation-logs.js clear 7
`);
}

// 主函数
async function main() {
  try {
    switch (command) {
      case 'recent':
        const count = parseInt(args[1]) || 20;
        await showRecentLogs(count);
        break;
        
      case 'db':
      case 'database':
        const hours = parseInt(args[1]) || 24;
        await showDatabaseLogs(hours);
        break;
        
      case 'stats':
      case 'statistics':
        await showErrorStats();
        break;
        
      case 'search':
        if (!args[1]) {
          console.error(`${colors.red}请提供搜索关键词${colors.reset}`);
          process.exit(1);
        }
        await searchLogs(args[1]);
        break;
        
      case 'clear':
      case 'clean':
        const days = parseInt(args[1]) || 30;
        await clearOldLogs(days);
        break;
        
      case 'help':
      case '--help':
      case '-h':
        await showHelp();
        break;
        
      default:
        console.log(`${colors.yellow}未知命令: ${command}${colors.reset}`);
        await showHelp();
    }
    
    // 强制刷新日志到数据库
    await translationLogger.forceFlush();
    
  } catch (error) {
    console.error(`${colors.red}错误:${colors.reset}`, error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行主函数
main().catch(console.error);