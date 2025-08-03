/**
 * 直接测试翻译功能
 */

import 'dotenv/config';
import { translateText } from './app/services/translation.server.js';
import { config } from './app/utils/config.server.js';

console.log('🔧 配置检查:');
console.log(`   GPT_API_KEY: ${config.translation.apiKey ? '已配置' : '未配置'}`);
console.log(`   GPT_API_URL: ${config.translation.apiUrl}`);
console.log(`   GPT_MODEL: ${config.translation.model}\n`);

const testContent = `<div class="product-description">
<h2>产品介绍</h2>
<p>这是一款革新性的智能产品。</p>
<img src="https://cdn.shopify.com/image.jpg" alt="产品图片" width="400" height="300" />
<p>更多信息请访问我们的网站。</p>
</div>`;

console.log('🧪 开始测试翻译功能...\n');

console.log('📝 原始内容:');
console.log(testContent);
console.log(`\n📊 原始长度: ${testContent.length} 字符\n`);

try {
  console.log('🔄 正在翻译到英语...');
  const translated = await translateText(testContent, 'en');
  
  console.log('\n✅ 翻译完成!');
  console.log('📝 翻译结果:');
  console.log(translated);
  console.log(`\n📊 翻译后长度: ${translated.length} 字符`);
  
  // 检查HTML标签是否保留
  const originalTags = (testContent.match(/<[^>]+>/g) || []).length;
  const translatedTags = (translated.match(/<[^>]+>/g) || []).length;
  
  console.log(`\n🏷️ HTML标签检查:`);
  console.log(`   原始标签数: ${originalTags}`);
  console.log(`   翻译后标签数: ${translatedTags}`);
  console.log(`   标签保留: ${originalTags === translatedTags ? '✅ 成功' : '❌ 失败'}`);
  
  // 检查img标签
  const hasOriginalImg = testContent.includes('<img');
  const hasTranslatedImg = translated.includes('<img');
  console.log(`   图片标签保留: ${hasOriginalImg && hasTranslatedImg ? '✅ 成功' : '❌ 失败'}`);
  
} catch (error) {
  console.error('❌ 翻译失败:', error.message);
  console.error('错误详情:', error);
}

console.log('\n🏁 测试完成');