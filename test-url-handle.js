// 测试 URL handle 翻译功能
import { translateUrlHandle } from './app/services/translation.server.js';

async function testUrlHandleTranslation() {
  console.log('开始测试 URL handle 翻译功能...\n');
  
  const testCases = [
    // 测试品牌词保护
    { handle: 'apple-iphone-15-pro-max-case', targetLang: 'zh-CN', expected: '包含Apple品牌词和手机壳' },
    { handle: 'nike-running-shoes-for-men', targetLang: 'zh-CN', expected: '包含Nike品牌词和跑鞋' },
    
    // 测试语义单元分词
    { handle: 'wireless-bluetooth-headphones', targetLang: 'zh-CN', expected: '无线蓝牙耳机作为完整语义单元' },
    { handle: 'smart-home-security-camera', targetLang: 'zh-CN', expected: '智能家居和安防摄像头' },
    
    // 测试冗余词清理
    { handle: 'new-latest-premium-quality-product', targetLang: 'zh-CN', expected: '去除冗余修饰词' },
    { handle: 'the-best-organic-green-tea', targetLang: 'zh-CN', expected: '保留核心词：有机绿茶' },
    
    // 测试其他语言
    { handle: 'portable-power-bank', targetLang: 'ja', expected: '日文翻译' },
    { handle: 'gaming-mechanical-keyboard', targetLang: 'ko', expected: '韩文翻译' },
    { handle: 'vintage-leather-wallet', targetLang: 'es', expected: '西班牙语翻译' },
    { handle: 'professional-camera-lens', targetLang: 'fr', expected: '法语翻译' },
  ];
  
  for (const testCase of testCases) {
    console.log(`\n测试用例: ${testCase.handle}`);
    console.log(`目标语言: ${testCase.targetLang}`);
    console.log(`期望结果: ${testCase.expected}`);
    
    try {
      const result = await translateUrlHandle(testCase.handle, testCase.targetLang);
      console.log(`翻译结果: ${result}`);
      
      // 验证结果格式
      if (result.includes('-')) {
        console.log('✅ 使用连字符分词');
      } else {
        console.log('❌ 未使用连字符分词');
      }
      
      // 验证品牌词保护（如果原文包含品牌词）
      const brands = ['apple', 'iphone', 'nike', 'samsung', 'sony'];
      for (const brand of brands) {
        if (testCase.handle.toLowerCase().includes(brand)) {
          if (result.toLowerCase().includes(brand)) {
            console.log(`✅ 品牌词 "${brand}" 被保护`);
          } else {
            console.log(`❌ 品牌词 "${brand}" 未被保护`);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ 测试失败: ${error.message}`);
    }
    
    console.log('-'.repeat(50));
  }
  
  console.log('\n测试完成！');
}

// 运行测试
testUrlHandleTranslation().catch(console.error);