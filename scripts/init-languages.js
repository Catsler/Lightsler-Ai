#!/usr/bin/env node

/**
 * 初始化支持的语言列表
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const supportedLanguages = [
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'it', name: 'Italian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' }
];

async function initLanguages() {
  console.log('🌐 初始化支持的语言列表...\n');
  
  try {
    // 清空现有语言（如果有）
    await prisma.language.deleteMany({});
    console.log('✅ 清空现有语言数据');
    
    // 批量创建语言
    const result = await prisma.language.createMany({
      data: supportedLanguages
    });
    
    console.log(`✅ 成功创建 ${result.count} 种语言`);
    
    // 显示所有语言
    const languages = await prisma.language.findMany({
      orderBy: { code: 'asc' }
    });
    
    console.log('\n📋 当前支持的语言:');
    console.log('================================');
    languages.forEach(lang => {
      console.log(`${lang.code.padEnd(8)} - ${lang.name}`);
    });
    console.log('================================');
    console.log(`总计: ${languages.length} 种语言\n`);
    
  } catch (error) {
    console.error('❌ 初始化语言失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行初始化
initLanguages();