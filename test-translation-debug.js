/**
 * 翻译问题诊断工具
 */

import 'dotenv/config';
import { translateText } from './app/services/translation.server.js';
import { config } from './app/utils/config.server.js';

async function debugTranslation() {
  console.log('🔍 开始翻译问题诊断...\n');

  // 1. 检查配置
  console.log('📋 配置检查:');
  console.log(`   API密钥: ${config.translation.apiKey ? '已配置 (' + config.translation.apiKey.substring(0, 10) + '...)' : '❌ 未配置'}`);
  console.log(`   API地址: ${config.translation.apiUrl}`);
  console.log(`   模型: ${config.translation.model}`);
  console.log(`   超时时间: ${config.translation.timeout}ms\n`);

  // 2. 测试简单文本翻译
  console.log('🧪 测试1: 简单文本翻译');
  const simpleText = "这是一个测试";
  try {
    const result1 = await translateText(simpleText, 'en');
    console.log(`   原文: ${simpleText}`);
    console.log(`   译文: ${result1}`);
    console.log(`   状态: ${result1 !== simpleText ? '✅ 翻译成功' : '❌ 返回原文'}\n`);
  } catch (error) {
    console.log(`   状态: ❌ 翻译失败 - ${error.message}\n`);
  }

  // 3. 测试HTML内容翻译
  console.log('🧪 测试2: 基础HTML翻译');
  const htmlText = "<p>这是一段HTML文本</p>";
  try {
    const result2 = await translateText(htmlText, 'en');
    console.log(`   原文: ${htmlText}`);
    console.log(`   译文: ${result2}`);
    console.log(`   HTML保留: ${result2.includes('<p>') && result2.includes('</p>') ? '✅' : '❌'}`);
    console.log(`   状态: ${result2 !== htmlText && result2.includes('HTML') ? '✅ 翻译成功' : '❌ 有问题'}\n`);
  } catch (error) {
    console.log(`   状态: ❌ 翻译失败 - ${error.message}\n`);
  }

  // 4. 测试图片标签翻译
  console.log('🧪 测试3: 图片标签翻译');
  const imgText = '<img src="test.jpg" alt="测试图片" /><p>图片描述文字</p>';
  try {
    const result3 = await translateText(imgText, 'en');
    console.log(`   原文: ${imgText}`);
    console.log(`   译文: ${result3}`);
    console.log(`   图片标签保留: ${result3.includes('<img') && result3.includes('src="test.jpg"') ? '✅' : '❌'}`);
    console.log(`   alt属性翻译: ${result3.includes('alt="') && !result3.includes('测试图片') ? '✅' : '❌'}`);
    console.log(`   状态: ${result3 !== imgText ? '✅ 有变化' : '❌ 无变化'}\n`);
  } catch (error) {
    console.log(`   状态: ❌ 翻译失败 - ${error.message}\n`);
  }

  // 5. 测试复杂富媒体内容
  console.log('🧪 测试4: 复杂富媒体内容');
  const richText = `<div>
<h2>产品介绍</h2>
<img src="product.jpg" alt="产品图片" width="300" />
<p>这是产品描述</p>
<iframe src="video.html" width="400" height="300"></iframe>
</div>`;
  
  try {
    const result4 = await translateText(richText, 'en');
    console.log(`   原文长度: ${richText.length} 字符`);
    console.log(`   译文长度: ${result4.length} 字符`);
    
    // 检查各种元素
    const checks = {
      'div标签': result4.includes('<div>') && result4.includes('</div>'),
      'h2标签': result4.includes('<h2>') && result4.includes('</h2>'),
      'img标签': result4.includes('<img') && result4.includes('src="product.jpg"'),
      'iframe标签': result4.includes('<iframe') && result4.includes('src="video.html"'),
      'p标签': result4.includes('<p>') && result4.includes('</p>'),
      '内容翻译': !result4.includes('产品介绍') && !result4.includes('产品描述')
    };
    
    for (const [check, passed] of Object.entries(checks)) {
      console.log(`   ${check}: ${passed ? '✅' : '❌'}`);
    }
    
    console.log(`\n   完整译文:\n${result4}\n`);
    
  } catch (error) {
    console.log(`   状态: ❌ 翻译失败 - ${error.message}\n`);
  }

  console.log('🏁 诊断完成');
}

debugTranslation().catch(console.error);