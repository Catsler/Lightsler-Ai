#!/usr/bin/env node

/**
 * 测试新资源类型功能
 */

import { RESOURCE_TYPES, EXTENDED_FIELD_MAPPINGS } from './app/services/shopify-graphql.server.js';
import { translateThemeResource } from './app/services/translation.server.js';

console.log('🧪 测试新资源类型功能\n');

// 1. 验证资源类型是否正确添加
console.log('✅ 新添加的资源类型:');
const newResourceTypes = [
  'ONLINE_STORE_THEME',
  'ONLINE_STORE_THEME_APP_EMBED',
  'ONLINE_STORE_THEME_JSON_TEMPLATE',
  'ONLINE_STORE_THEME_LOCALE_CONTENT',
  'ONLINE_STORE_THEME_SECTION_GROUP',
  'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
  'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS',
  'PRODUCT_OPTION',
  'PRODUCT_OPTION_VALUE',
  'SELLING_PLAN',
  'SELLING_PLAN_GROUP',
  'SHOP',
  'SHOP_POLICY'
];

newResourceTypes.forEach(type => {
  if (RESOURCE_TYPES[type]) {
    console.log(`  ✅ ${type}`);
  } else {
    console.log(`  ❌ ${type} - 未找到`);
  }
});

// 2. 验证字段映射配置
console.log('\n✅ 扩展字段映射配置:');
Object.entries(EXTENDED_FIELD_MAPPINGS).forEach(([type, mapping]) => {
  console.log(`  ${type}:`, mapping);
});

// 3. 测试Theme资源翻译功能
console.log('\n🧪 测试Theme资源翻译功能:');

const testThemeResource = {
  id: 'test-theme-1',
  resourceType: 'ONLINE_STORE_THEME',
  title: 'Dawn Theme',
  handle: 'dawn-theme',
  contentFields: {
    themeData: JSON.stringify({
      name: 'Dawn',
      title: 'Welcome to our store',
      description: 'High quality products for you',
      sections: {
        header: {
          title: 'Header Section',
          menu_text: 'Shop Now'
        }
      }
    })
  }
};

console.log('测试资源:', testThemeResource);

// 测试翻译函数
translateThemeResource(testThemeResource, 'zh-CN')
  .then(result => {
    console.log('\n✅ 翻译结果:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('\n❌ 翻译失败:', error.message);
  });

// 4. 测试产品选项资源
const testProductOption = {
  id: 'test-option-1',
  resourceType: 'PRODUCT_OPTION',
  title: 'Size Options',
  contentFields: {
    name: 'Size',
    values: ['Small', 'Medium', 'Large']
  }
};

console.log('\n🧪 测试产品选项翻译:');
translateThemeResource(testProductOption, 'zh-CN')
  .then(result => {
    console.log('✅ 产品选项翻译结果:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('❌ 产品选项翻译失败:', error.message);
  });

// 5. 测试店铺信息资源
const testShopInfo = {
  id: 'test-shop-1',
  resourceType: 'SHOP',
  title: 'My Shop',
  contentFields: {
    name: 'My Awesome Shop',
    description: 'We sell the best products',
    announcement: 'Free shipping on orders over $50'
  }
};

console.log('\n🧪 测试店铺信息翻译:');
translateThemeResource(testShopInfo, 'zh-CN')
  .then(result => {
    console.log('✅ 店铺信息翻译结果:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('❌ 店铺信息翻译失败:', error.message);
  });

console.log('\n✅ 测试脚本执行完成');