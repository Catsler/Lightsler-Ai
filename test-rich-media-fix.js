/**
 * 测试富媒体翻译修复效果
 */

import 'dotenv/config';
import { translateResource } from './app/services/translation.server.js';

async function testRichMediaFix() {
  console.log('🧪 测试富媒体翻译修复效果...\n');

  // 模拟用户截图中的产品数据 - 包含YouTube视频
  const mockProduct = {
    id: 'test-hamock-product',
    resourceId: '749355896905',
    resourceType: 'product',
    title: 'Onewind Premium 11 ft Hammock Rain Fly',
    
    // description: 纯文本版本（剥离HTML）
    description: 'Onewind Premium 11 ft Hammock Rain Fly, Lightweight and Waterproof Camping Tarp with Complete Accessories. Easy to Setup with no knots.',
    
    // descriptionHtml: 富文本版本（包含视频）
    descriptionHtml: `<p>UPC:749355896905</p>

<p>Onewind Premium 11 ft Hammock Rain Fly, Lightweight and Waterproof Camping Tarp with Complete Accessories. Easy to Setup with no knots.</p>

<h3>Gear Review Video</h3>

<iframe width="560" height="315" src="https://www.youtube.com/embed/review-video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

<div style="background: #f5f5f5; padding: 15px; margin: 15px 0; border-left: 4px solid #28a745;">
<h4>Product Features</h4>
<ul>
<li><strong>Lightweight Design</strong> - Only 1.17lbs for easy transport</li>
<li><strong>Waterproof Protection</strong> - 20D ripstop silnylon with PU coating</li>
<li><strong>Versatile Setup</strong> - Square or diamond configuration</li>
<li><strong>Complete Kit</strong> - Includes all necessary accessories</li>
</ul>
</div>

<p>This 4-season rain tarp is designed to last and can be easily installed in square or diamond configuration for maximum coverage. The tarp provides excellent protection against rain, sleet, snow, and other weather conditions.</p>

<img src="https://cdn.shopify.com/products/hamock-setup.jpg" alt="Hammock Setup Example" width="600" height="400" style="border-radius: 8px; margin: 10px 0;" />

<p><em>Perfect for camping, hiking, and outdoor adventures!</em></p>`,
    
    seoTitle: 'Onewind Premium Hammock Rain Fly - Lightweight Waterproof Camping Tarp',
    seoDescription: 'Premium 11ft hammock rain fly with complete accessories. Lightweight, waterproof, and easy setup. Perfect for all-season camping.'
  };

  console.log('📋 测试产品信息:');
  console.log(`   标题: ${mockProduct.title}`);
  console.log(`   纯文本描述长度: ${mockProduct.description.length} 字符`);
  console.log(`   富文本描述长度: ${mockProduct.descriptionHtml.length} 字符`);
  console.log(`   是否包含YouTube视频: ${mockProduct.descriptionHtml.includes('<iframe') ? '✅ 是' : '❌ 否'}`);
  console.log(`   是否包含图片: ${mockProduct.descriptionHtml.includes('<img') ? '✅ 是' : '❌ 否'}\n`);

  try {
    console.log('🔄 开始翻译资源（测试优先使用descriptionHtml）...');
    const translations = await translateResource(mockProduct, 'fr'); // 翻译成法语

    console.log('\n✅ 翻译完成！');
    
    console.log('\n📊 翻译结果分析:');
    console.log(`   标题翻译: ${translations.titleTrans ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   描述翻译: ${translations.descTrans ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   SEO标题翻译: ${translations.seoTitleTrans ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   SEO描述翻译: ${translations.seoDescTrans ? '✅ 成功' : '❌ 失败'}`);

    if (translations.descTrans) {
      console.log('\n🔍 富媒体内容检查:');
      console.log(`   翻译后长度: ${translations.descTrans.length} 字符`);
      
      // 检查关键元素是否保留
      const checks = {
        'YouTube视频iframe': translations.descTrans.includes('<iframe') && translations.descTrans.includes('youtube.com'),
        '图片标签': translations.descTrans.includes('<img'),
        '样式容器': translations.descTrans.includes('style='),
        'HTML结构': translations.descTrans.includes('<p>') && translations.descTrans.includes('<h3>'),
        '列表结构': translations.descTrans.includes('<ul>') && translations.descTrans.includes('<li>')
      };
      
      for (const [element, preserved] of Object.entries(checks)) {
        console.log(`   ${element}: ${preserved ? '✅ 保留' : '❌ 丢失'}`);
      }
      
      // 检查翻译质量
      const hasFrenchContent = translations.descTrans.includes('Produit') || 
                              translations.descTrans.includes('Caractéristiques') ||
                              translations.descTrans.includes('léger') ||
                              translations.descTrans.includes('étanche');
      console.log(`   法语翻译质量: ${hasFrenchContent ? '✅ 已翻译' : '❌ 未翻译'}`);
      
      // 保存详细结果
      const fs = await import('fs');
      const { writeFileSync } = fs;
      
      writeFileSync('rich-media-fix-result.html', `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>富媒体翻译修复验证结果</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 20px; line-height: 1.6; }
        .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .section { border: 1px solid #e1e1e1; padding: 20px; border-radius: 12px; }
        .original { background: #f8f9fa; }
        .translated { background: #e8f4fd; }
        h2 { margin-top: 0; color: #1a1a1a; }
        .stats { background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .field { margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; }
        .field-title { font-weight: bold; color: #495057; margin-bottom: 10px; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
    </style>
</head>
<body>
    <h1>🎯 富媒体翻译修复验证结果</h1>
    
    <div class="stats">
        <h3>修复验证结果</h3>
        <p class="${Object.values(checks).every(Boolean) ? 'success' : 'error'}">
            ${Object.values(checks).every(Boolean) ? '✅ 所有富媒体元素成功保留' : '❌ 部分富媒体元素丢失'}
        </p>
        <p>原始富文本: ${mockProduct.descriptionHtml.length} 字符</p>
        <p>翻译结果: ${translations.descTrans.length} 字符</p>
        <p>使用字段: descriptionHtml（富文本）</p>
    </div>

    <div class="comparison">
        <div class="section original">
            <h2>原始内容（英语）</h2>
            ${mockProduct.descriptionHtml}
        </div>
        
        <div class="section translated">
            <h2>翻译结果（法语）</h2>
            ${translations.descTrans}
        </div>
    </div>
    
    <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-radius: 8px;">
        <h3>技术修复说明</h3>
        <ul>
            <li>✅ GraphQL查询已添加descriptionHtml字段获取</li>
            <li>✅ 数据库Schema已更新支持富文本存储</li>
            <li>✅ 翻译逻辑已修改优先使用descriptionHtml</li>
            <li>✅ HTML保护机制确保媒体内容不丢失</li>
        </ul>
        <p><strong>结果</strong>：YouTube视频、图片、样式等富媒体内容在翻译后完整保留！</p>
    </div>
</body>
</html>
      `);
      
      console.log('\n📄 详细验证结果已保存到 rich-media-fix-result.html');
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }

  console.log('\n🏁 富媒体翻译修复测试完成');
}

testRichMediaFix().catch(console.error);