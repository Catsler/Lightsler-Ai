/**
 * 调试真实的Shopify翻译流程
 */

import 'dotenv/config';
import { translateResource } from './app/services/translation.server.js';

async function debugRealTranslation() {
  console.log('🔍 调试真实的Shopify翻译流程...\n');

  // 模拟真实的Shopify产品数据
  const mockProduct = {
    id: 'test-1',
    resourceId: '123456789',
    resourceType: 'product',
    title: '智能蓝牙耳机',
    description: `<div class="product-description">
<h2>产品介绍</h2>
<p>这款革命性的蓝牙耳机采用最新的降噪技术，为您带来无与伦比的音质体验。</p>

<img src="https://cdn.shopify.com/s/files/1/0123/4567/products/headphones-main.jpg" alt="智能蓝牙耳机主图" width="600" height="400" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />

<h3>核心特性</h3>
<ul>
<li><strong>主动降噪</strong> - 先进的ANC技术，屏蔽环境噪音</li>
<li><strong>长续航</strong> - 单次充电可连续播放30小时</li>
<li><strong>快速充电</strong> - 15分钟充电可使用3小时</li>
<li><strong>高品质音频</strong> - 支持高解析度音频格式</li>
</ul>

<p>观看产品演示视频，了解更多功能：</p>
<iframe width="560" height="315" src="https://www.youtube.com/embed/product-demo" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></iframe>

<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 15px; margin: 25px 0; text-align: center;">
<h4 style="margin-top: 0; font-size: 1.2em;">限时特价</h4>
<p style="font-size: 1.1em; margin-bottom: 0;">现在购买享受<strong>7折优惠</strong>，还可获得免费保护套！</p>
</div>

<p>更多产品图片展示：</p>
<div class="gallery" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
<img src="https://cdn.shopify.com/s/files/1/0123/4567/products/headphones-detail-1.jpg" alt="耳机细节图1" width="200" height="200" style="border-radius: 8px; border: 2px solid #f0f0f0;" />
<img src="https://cdn.shopify.com/s/files/1/0123/4567/products/headphones-detail-2.jpg" alt="耳机细节图2" width="200" height="200" style="border-radius: 8px; border: 2px solid #f0f0f0;" />
<img src="https://cdn.shopify.com/s/files/1/0123/4567/products/headphones-detail-3.jpg" alt="耳机细节图3" width="200" height="200" style="border-radius: 8px; border: 2px solid #f0f0f0;" />
</div>

<video width="100%" height="auto" controls style="border-radius: 12px; margin: 20px 0;">
<source src="https://cdn.shopify.com/videos/headphones-360view.mp4" type="video/mp4">
您的浏览器不支持视频播放。
</video>

<p style="text-align: center; font-style: italic; color: #666; margin-top: 30px;">
<em>体验未来音频科技，享受纯净音质生活！</em>
</p>
</div>`,
    seoTitle: '智能蓝牙耳机 - 降噪技术 长续航 高音质',
    seoDescription: '领先的主动降噪蓝牙耳机，30小时超长续航，支持高解析度音频，为您带来完美的音乐体验。现在购买享受特价优惠！'
  };

  try {
    console.log('📋 模拟产品信息:');
    console.log(`   标题: ${mockProduct.title}`);
    console.log(`   描述长度: ${mockProduct.description.length} 字符`);
    console.log(`   SEO标题: ${mockProduct.seoTitle}`);
    console.log(`   SEO描述: ${mockProduct.seoDescription}\n`);

    console.log('🔄 开始翻译资源...');
    const translations = await translateResource(mockProduct, 'en');

    console.log('\n✅ 翻译完成！');
    console.log('\n📊 翻译结果统计:');
    console.log(`   标题: ${translations.titleTrans ? '✅ 已翻译' : '❌ 未翻译'}`);
    console.log(`   描述: ${translations.descTrans ? '✅ 已翻译' : '❌ 未翻译'}`);
    console.log(`   SEO标题: ${translations.seoTitleTrans ? '✅ 已翻译' : '❌ 未翻译'}`);
    console.log(`   SEO描述: ${translations.seoDescTrans ? '✅ 已翻译' : '❌ 未翻译'}`);

    if (translations.descTrans) {
      console.log('\n🔍 描述翻译质量检查:');
      console.log(`   原始长度: ${mockProduct.description.length} 字符`);
      console.log(`   翻译长度: ${translations.descTrans.length} 字符`);
      
      // 检查HTML元素保留
      const originalElements = {
        images: (mockProduct.description.match(/<img[^>]*>/g) || []).length,
        iframe: mockProduct.description.includes('<iframe') ? 1 : 0,
        video: mockProduct.description.includes('<video') ? 1 : 0,
        divs: (mockProduct.description.match(/<div[^>]*>/g) || []).length
      };
      
      const translatedElements = {
        images: (translations.descTrans.match(/<img[^>]*>/g) || []).length,
        iframe: translations.descTrans.includes('<iframe') ? 1 : 0,
        video: translations.descTrans.includes('<video') ? 1 : 0,
        divs: (translations.descTrans.match(/<div[^>]*>/g) || []).length
      };
      
      console.log('   富媒体元素保留:');
      console.log(`      图片: ${originalElements.images} → ${translatedElements.images} ${originalElements.images === translatedElements.images ? '✅' : '❌'}`);
      console.log(`      视频iframe: ${originalElements.iframe} → ${translatedElements.iframe} ${originalElements.iframe === translatedElements.iframe ? '✅' : '❌'}`);
      console.log(`      视频标签: ${originalElements.video} → ${translatedElements.video} ${originalElements.video === translatedElements.video ? '✅' : '❌'}`);
      console.log(`      容器div: ${originalElements.divs} → ${translatedElements.divs} ${originalElements.divs === translatedElements.divs ? '✅' : '❌'}`);

      // 保存详细结果
      const fs = await import('fs');
      const { writeFileSync } = fs;
      
      writeFileSync('real-translation-result.html', `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>真实Shopify产品翻译结果</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 20px; line-height: 1.6; }
        .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .section { border: 1px solid #e1e1e1; padding: 20px; border-radius: 12px; }
        .original { background: #f8f9fa; }
        .translated { background: #e8f4fd; }
        h2 { margin-top: 0; color: #1a1a1a; }
        .stats { background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .field { margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; }
        .field-title { font-weight: bold; color: #495057; margin-bottom: 10px; }
    </style>
</head>
<body>
    <h1>真实Shopify产品翻译结果对比</h1>
    
    <div class="stats">
        <h3>翻译统计</h3>
        <p>原始描述: ${mockProduct.description.length} 字符</p>
        <p>翻译描述: ${translations.descTrans.length} 字符</p>
        <p>图片保留: ${originalElements.images}/${translatedElements.images}</p>
        <p>视频保留: ${originalElements.iframe + originalElements.video}/${translatedElements.iframe + translatedElements.video}</p>
    </div>

    <div class="comparison">
        <div class="section original">
            <h2>原始内容</h2>
            
            <div class="field">
                <div class="field-title">标题</div>
                ${mockProduct.title}
            </div>
            
            <div class="field">
                <div class="field-title">描述</div>
                ${mockProduct.description}
            </div>
            
            <div class="field">
                <div class="field-title">SEO标题</div>
                ${mockProduct.seoTitle}
            </div>
            
            <div class="field">
                <div class="field-title">SEO描述</div>
                ${mockProduct.seoDescription}
            </div>
        </div>
        
        <div class="section translated">
            <h2>翻译结果</h2>
            
            <div class="field">
                <div class="field-title">标题翻译</div>
                ${translations.titleTrans || '<em>未翻译</em>'}
            </div>
            
            <div class="field">
                <div class="field-title">描述翻译</div>
                ${translations.descTrans || '<em>未翻译</em>'}
            </div>
            
            <div class="field">
                <div class="field-title">SEO标题翻译</div>
                ${translations.seoTitleTrans || '<em>未翻译</em>'}
            </div>
            
            <div class="field">
                <div class="field-title">SEO描述翻译</div>
                ${translations.seoDescTrans || '<em>未翻译</em>'}
            </div>
        </div>
    </div>
</body>
</html>
      `);
      
      console.log('\n📄 详细对比结果已保存到 real-translation-result.html');
    }

  } catch (error) {
    console.error('❌ 翻译过程出错:', error.message);
    console.error('错误详情:', error);
  }

  console.log('\n🏁 真实翻译流程调试完成');
}

debugRealTranslation().catch(console.error);