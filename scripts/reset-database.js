#!/usr/bin/env node

/**
 * 完全重置和清理数据库
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('🗑️  开始清理和重置数据库...\n');
  
  try {
    // 1. 删除所有数据（按依赖顺序）
    console.log('📋 清理现有数据...');
    
    await prisma.translation.deleteMany({});
    console.log('✅ 清理翻译数据');
    
    await prisma.resource.deleteMany({});
    console.log('✅ 清理资源数据');
    
    await prisma.language.deleteMany({});
    console.log('✅ 清理语言数据');
    
    await prisma.shop.deleteMany({});
    console.log('✅ 清理店铺数据');
    
    await prisma.session.deleteMany({});
    console.log('✅ 清理会话数据');
    
    // 2. 验证清理结果
    console.log('\n📊 验证清理结果:');
    const counts = {
      sessions: await prisma.session.count(),
      shops: await prisma.shop.count(),
      languages: await prisma.language.count(),
      resources: await prisma.resource.count(),
      translations: await prisma.translation.count()
    };
    
    console.log('================================');
    Object.entries(counts).forEach(([table, count]) => {
      console.log(`${table.padEnd(15)}: ${count} 条记录`);
    });
    console.log('================================');
    
    if (Object.values(counts).every(count => count === 0)) {
      console.log('✅ 数据库清理完成！所有表已清空。\n');
    } else {
      console.log('⚠️  警告：某些表可能未完全清空。\n');
    }
    
  } catch (error) {
    console.error('❌ 数据库重置失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function showDatabaseInfo() {
  console.log('📊 数据库信息:');
  
  try {
    // 执行SQLite命令获取数据库大小
    const { stdout: sizeOutput } = await execAsync('ls -lh prisma/dev.sqlite');
    const sizeMatch = sizeOutput.match(/\s+(\d+[KMG]?)\s+/);
    const dbSize = sizeMatch ? sizeMatch[1] : '未知';
    
    console.log(`数据库文件: prisma/dev.sqlite`);
    console.log(`数据库大小: ${dbSize}`);
    console.log(`数据库类型: SQLite\n`);
    
  } catch (error) {
    console.log('无法获取数据库文件信息\n');
  }
}

// 运行重置
async function main() {
  await showDatabaseInfo();
  await resetDatabase();
  
  console.log('💡 提示:');
  console.log('- 数据库已清空，所有数据已删除');
  console.log('- 如需初始化测试数据，请运行相应的种子脚本');
  console.log('- 应用会在首次访问时自动创建必要的店铺和会话数据\n');
}

main();