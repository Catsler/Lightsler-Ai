/**
 * 调试占位符恢复过程
 */

import 'dotenv/config';
import { translateText } from './app/services/translation.server.js';

// 简单测试内容
const testContent = `<div>
<h2>测试标题</h2>
<img src="test.jpg" alt="测试图片" />
<p>这是描述文字</p>
<iframe src="video.html"></iframe>
</div>`;

console.log('🔍 调试占位符恢复过程...\n');

console.log('📝 原始内容:');
console.log(testContent);
console.log(`\n原始长度: ${testContent.length} 字符`);

try {
  console.log('\n🔄 开始翻译过程...');
  const result = await translateText(testContent, 'en');
  
  console.log('\n✅ 翻译完成:');
  console.log(result);
  console.log(`\n翻译后长度: ${result.length} 字符`);
  
  // 检查是否还有占位符
  const hasPlaceholders = result.includes('__PROTECTED_');
  console.log(`\n占位符检查: ${hasPlaceholders ? '❌ 仍有未恢复的占位符' : '✅ 所有占位符已恢复'}`);
  
  if (hasPlaceholders) {
    const placeholders = result.match(/__PROTECTED_\w+_\d+__/g);
    console.log('未恢复的占位符:', placeholders);
  }
  
} catch (error) {
  console.error('❌ 翻译过程出错:', error);
}

console.log('\n🏁 调试完成');