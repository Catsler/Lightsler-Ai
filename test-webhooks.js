/**
 * 测试Webhook功能
 */

import { processWebhookEvent } from './app/services/webhook-manager.server.js';
import prisma from './app/db.server.js';

console.log('🔍 测试Webhook功能\n');

async function testWebhooks() {
  try {
    // 获取或创建测试店铺
    let shop = await prisma.shop.findFirst({
      where: { domain: 'test-shop.myshopify.com' }
    });
    
    if (!shop) {
      shop = await prisma.shop.create({
        data: {
          id: 'test-shop-id',
          domain: 'test-shop.myshopify.com',
          accessToken: 'test-token',
          autoTranslateEnabled: true
        }
      });
      console.log('✅ 创建测试店铺');
    }
    
    // 确保有目标语言
    const language = await prisma.language.findFirst({
      where: { 
        shopId: shop.id,
        code: 'zh-CN'
      }
    });
    
    if (!language) {
      await prisma.language.create({
        data: {
          shopId: shop.id,
          code: 'zh-CN',
          name: '简体中文',
          enabled: true
        }
      });
      console.log('✅ 创建测试语言');
    }
    
    // 测试产品创建webhook
    console.log('\n📦 测试产品创建webhook...');
    const productPayload = {
      id: 123456789,
      admin_graphql_api_id: 'gid://shopify/Product/123456789',
      title: 'Test Product',
      body_html: '<p>This is a test product description</p>',
      vendor: 'Test Vendor',
      product_type: 'Test Type',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const productResult = await processWebhookEvent(
      shop.domain,
      'products/create',
      productPayload
    );
    console.log('产品创建webhook结果:', productResult);
    
    // 测试集合创建webhook
    console.log('\n📚 测试集合创建webhook...');
    const collectionPayload = {
      id: 987654321,
      admin_graphql_api_id: 'gid://shopify/Collection/987654321',
      title: 'Test Collection',
      body_html: '<p>This is a test collection</p>',
      handle: 'test-collection',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const collectionResult = await processWebhookEvent(
      shop.domain,
      'collections/create',
      collectionPayload
    );
    console.log('集合创建webhook结果:', collectionResult);
    
    // 测试产品更新webhook
    console.log('\n🔄 测试产品更新webhook...');
    productPayload.title = 'Updated Test Product';
    productPayload.updated_at = new Date().toISOString();
    
    const updateResult = await processWebhookEvent(
      shop.domain,
      'products/update',
      productPayload
    );
    console.log('产品更新webhook结果:', updateResult);
    
    // 查看webhook事件记录
    console.log('\n📊 查看webhook事件记录...');
    const events = await prisma.webhookEvent.findMany({
      where: { shop: shop.domain },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log(`找到 ${events.length} 个webhook事件:`);
    events.forEach(event => {
      console.log(`  - ${event.topic}: ${event.resourceType} ${event.resourceId}`);
      console.log(`    处理状态: ${event.processed ? '✅ 已处理' : '⏳ 待处理'}`);
    });
    
    // 查看创建的资源
    console.log('\n📋 查看创建的资源...');
    const resources = await prisma.resource.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log(`找到 ${resources.length} 个资源:`);
    resources.forEach(resource => {
      console.log(`  - ${resource.resourceType}: ${resource.title}`);
      console.log(`    ID: ${resource.originalResourceId}`);
    });
    
    console.log('\n✅ Webhook测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
testWebhooks();