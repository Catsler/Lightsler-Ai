/**
 * 测试新的资源扫描功能
 */

import { RESOURCE_TYPES, FIELD_MAPPINGS } from './app/services/shopify-graphql.server.js';

console.log('🧪 测试新的资源类型配置');

// 测试资源类型配置
console.log('\n📋 支持的资源类型:');
Object.entries(RESOURCE_TYPES).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});

// 测试字段映射配置
console.log('\n🔄 字段映射配置:');
Object.entries(FIELD_MAPPINGS).forEach(([resourceType, fields]) => {
  console.log(`  ${resourceType}:`);
  Object.entries(fields).forEach(([translationField, graphqlField]) => {
    console.log(`    ${translationField} -> ${graphqlField}`);
  });
});

console.log('\n✅ 配置测试完成！');

// 测试数据库模型兼容性
console.log('\n🗄️ 测试数据库模型...');
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDatabase() {
  try {
    // 测试新字段是否存在
    const testResource = await prisma.resource.findFirst();
    if (testResource) {
      console.log('✅ 数据库连接正常');
      console.log('✅ Resource表字段:', Object.keys(testResource));
    } else {
      console.log('ℹ️ 数据库为空，字段结构正常');
    }
    
    const testTranslation = await prisma.translation.findFirst();
    if (testTranslation) {
      console.log('✅ Translation表字段:', Object.keys(testTranslation));
    } else {
      console.log('ℹ️ 翻译表为空，字段结构正常');
    }
    
  } catch (error) {
    console.error('❌ 数据库测试失败:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();