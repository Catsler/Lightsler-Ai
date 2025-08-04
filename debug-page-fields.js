#!/usr/bin/env node

// 调试工具：查看Page资源的实际可翻译字段
const { authenticate } = require('./app/shopify.server.js');

const DEBUG_QUERY = `
  query getTranslatablePages($first: Int) {
    translatableResources(resourceType: PAGE, first: $first) {
      edges {
        node {
          resourceId
          translatableContent {
            key
            value
            digest
            locale
          }
        }
      }
    }
  }
`;

async function debugPageFields() {
  try {
    console.log('🔍 开始调试Page资源的可翻译字段...');
    
    // 这里需要实际的session，在实际环境中运行
    console.log('请在实际的Shopify应用环境中运行此查询：');
    console.log(DEBUG_QUERY);
    
    console.log('\n📋 预期的字段映射:');
    console.log('- titleTrans -> title');
    console.log('- descTrans -> body');
    console.log('- handleTrans -> handle'); 
    console.log('- seoTitleTrans -> meta_title');
    console.log('- seoDescTrans -> meta_description');
    
    console.log('\n🎯 需要检查的问题:');
    console.log('1. Page资源的translatableContent中实际包含哪些key?');
    console.log('2. body字段是否存在且有内容?');
    console.log('3. 是否有其他命名的content字段?');
    
  } catch (error) {
    console.error('❌ 调试失败:', error);
  }
}

debugPageFields();