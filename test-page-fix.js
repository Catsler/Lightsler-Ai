/**
 * 测试Page资源翻译修复
 */
import fetch from 'node-fetch';

const PORT = 61234;
const BASE_URL = `http://localhost:${PORT}`;

async function testPageTranslation() {
  console.log('=== 测试Page资源翻译修复 ===\n');

  try {
    // 1. 扫描Page资源
    console.log('1. 扫描Page资源...');
    const scanResponse = await fetch(`${BASE_URL}/api/scan-resources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resourceType: 'page'
      })
    });

    const scanData = await scanResponse.json();
    console.log('扫描结果:', JSON.stringify(scanData, null, 2));

    if (!scanData.success) {
      console.error('扫描失败:', scanData.error);
      return;
    }

    // 2. 等待一下让数据保存
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. 执行翻译
    console.log('\n2. 执行Page资源翻译...');
    const translateResponse = await fetch(`${BASE_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetLang: 'ja',
        resourceTypes: ['page']
      })
    });

    const translateData = await translateResponse.json();
    console.log('翻译结果:', JSON.stringify(translateData, null, 2));

    // 4. 检查翻译详情
    if (translateData.results && translateData.results.length > 0) {
      console.log('\n=== 翻译详情 ===');
      translateData.results.forEach((result, index) => {
        console.log(`\n资源 ${index + 1}:`);
        console.log(`- 标题: ${result.title}`);
        console.log(`- 翻译状态: ${result.status}`);
        if (result.status === 'success') {
          console.log(`- 标题翻译: ${result.translations?.titleTrans || '无'}`);
          console.log(`- 内容翻译预览: ${result.translations?.descTrans?.substring(0, 200) || '无'}...`);
        } else {
          console.log(`- 错误: ${result.error}`);
        }
      });
    }

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 运行测试
testPageTranslation();