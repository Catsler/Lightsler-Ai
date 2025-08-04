/**
 * 测试长文本翻译功能
 */
import { translateText, translateTextEnhanced } from './app/services/translation.server.js';

// 模拟长文本（类似配送政策页面）
const testText = `Shipping Policy

We typically process orders within 1 business day, often shipping on the same day the order is placed.

Orders placed over weekends or after our daily mail pickup will be processed on the next business day whenever possible.

Taxes & Duties

Shipping fees include all applicable taxes and import duties—no extra charges at delivery.

Summary

At Onewind® Outdoors, we're committed to providing clear, transparent, and reliable shipping information.

Our goal is to get your gear to you as quickly and affordably as possible. If you have any questions regarding our shipping methods, costs, or the status of your order, our friendly Customer Support team is here to help.

Feel confident knowing that we'll do everything we can to ensure a smooth delivery experience.`;

async function testTranslation() {
  console.log('开始测试长文本翻译...\n');
  console.log(`原文长度: ${testText.length} 字符`);
  console.log('原文内容:');
  console.log('='.repeat(50));
  console.log(testText);
  console.log('='.repeat(50));
  
  const targetLang = 'ko'; // 测试翻译成韩语
  
  console.log(`\n开始翻译到 ${targetLang}...\n`);
  
  try {
    // 使用增强版翻译函数获取详细信息
    const result = await translateTextEnhanced(testText, targetLang);
    
    console.log('\n翻译结果:');
    console.log('='.repeat(50));
    console.log(`成功: ${result.success}`);
    console.log(`是原文: ${result.isOriginal}`);
    console.log(`错误: ${result.error || '无'}`);
    console.log(`译文长度: ${result.text.length} 字符`);
    console.log('\n译文内容:');
    console.log(result.text);
    console.log('='.repeat(50));
    
    // 检查每个段落是否都被翻译
    const paragraphs = result.text.split(/\n\n+/);
    console.log(`\n译文包含 ${paragraphs.length} 个段落`);
    
    paragraphs.forEach((para, index) => {
      const hasEnglish = /[a-zA-Z]{3,}/.test(para);
      const hasKorean = /[\uac00-\ud7af]/.test(para);
      console.log(`段落 ${index + 1}: ${hasKorean ? '✅ 包含韩文' : '❌ 无韩文'} ${hasEnglish ? '(包含英文)' : ''}`);
      console.log(`  内容预览: ${para.substring(0, 50)}...`);
    });
    
  } catch (error) {
    console.error('翻译失败:', error);
  }
}

// 执行测试
testTranslation();