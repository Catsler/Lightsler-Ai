/**
 * 测试富媒体内容翻译
 */

import 'dotenv/config';
import { translateText } from './app/services/translation.server.js';

const richMediaContent = `<div class="rich-text">
<h2>产品特性</h2>
<p>这是一个优质产品，具有以下特点：</p>
<img src="https://cdn.shopify.com/image1.jpg" alt="产品图片" width="500" height="300" style="border-radius: 8px; margin: 10px 0;" />
<ul>
<li>高品质材料</li>
<li>精湛工艺</li>
<li>持久耐用</li>
</ul>
<p>观看产品演示视频：</p>
<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
<div style="background: #f5f5f5; padding: 15px; margin: 10px 0; border-left: 4px solid #007ace;">
<p><strong>重要提示：</strong>此产品需要专业安装。</p>
</div>
<p>更多产品图片：</p>
<div class="image-gallery" style="display: flex; gap: 10px; flex-wrap: wrap;">
<img src="https://cdn.shopify.com/image2.jpg" alt="产品细节1" width="200" height="200" style="border: 1px solid #ddd;" />
<img src="https://cdn.shopify.com/image3.jpg" alt="产品细节2" width="200" height="200" style="border: 1px solid #ddd;" />
<img src="https://cdn.shopify.com/image4.jpg" alt="产品细节3" width="200" height="200" style="border: 1px solid #ddd;" />
</div>
</div>`;

console.log('🧪 开始测试富媒体翻译功能...\n');

console.log('📝 原始内容 (前200字符):');
console.log(richMediaContent.substring(0, 200) + '...');
console.log(`\n📊 原始长度: ${richMediaContent.length} 字符\n`);

try {
  console.log('🔄 正在翻译到英语...');
  const translated = await translateText(richMediaContent, 'en');
  
  console.log('\n✅ 翻译完成!');
  console.log('📝 翻译结果 (前300字符):');
  console.log(translated.substring(0, 300) + '...');
  console.log(`\n📊 翻译后长度: ${translated.length} 字符`);
  
  // 检查关键元素
  console.log(`\n🔍 富媒体元素检查:`);
  
  // 检查图片
  const originalImages = (richMediaContent.match(/<img[^>]*>/g) || []).length;
  const translatedImages = (translated.match(/<img[^>]*>/g) || []).length;
  console.log(`   图片标签: ${originalImages} → ${translatedImages} ${originalImages === translatedImages ? '✅' : '❌'}`);
  
  // 检查iframe
  const originalIframe = richMediaContent.includes('<iframe');
  const translatedIframe = translated.includes('<iframe');
  console.log(`   视频iframe: ${originalIframe ? '有' : '无'} → ${translatedIframe ? '有' : '无'} ${originalIframe === translatedIframe ? '✅' : '❌'}`);
  
  // 检查样式div
  const originalStyledDiv = richMediaContent.includes('style="background:');
  const translatedStyledDiv = translated.includes('style="background:');
  console.log(`   样式容器: ${originalStyledDiv ? '有' : '无'} → ${translatedStyledDiv ? '有' : '无'} ${originalStyledDiv === translatedStyledDiv ? '✅' : '❌'}`);
  
  // 检查列表
  const originalList = richMediaContent.includes('<ul>');
  const translatedList = translated.includes('<ul>');
  console.log(`   列表结构: ${originalList ? '有' : '无'} → ${translatedList ? '有' : '无'} ${originalList === translatedList ? '✅' : '❌'}`);
  
  // 写入文件用于详细检查
  const fs = await import('fs');
  const { writeFileSync } = fs;
  writeFileSync('translation-result.html', `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>富媒体翻译结果对比</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .section { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
        .original { background: #f9f9f9; }
        .translated { background: #f0f8ff; }
        h2 { margin-top: 0; }
    </style>
</head>
<body>
    <h1>富媒体翻译结果对比</h1>
    <div class="comparison">
        <div class="section original">
            <h2>原始内容</h2>
            ${richMediaContent}
        </div>
        <div class="section translated">
            <h2>翻译结果</h2>
            ${translated}
        </div>
    </div>
</body>
</html>
  `);
  
  console.log('\n📄 详细对比已保存到 translation-result.html');
  
} catch (error) {
  console.error('❌ 翻译失败:', error.message);
  console.error('错误详情:', error);
}

console.log('\n🏁 测试完成');