/**
 * UI交互测试脚本
 * 用于测试页面的选择框和按钮交互功能
 */

const puppeteer = require('puppeteer');

async function testUIInteraction() {
  let browser;
  
  try {
    console.log('🚀 启动浏览器...');
    browser = await puppeteer.launch({
      headless: false, // 显示浏览器窗口以便观察
      devtools: true,  // 打开开发者工具
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // 监听控制台日志和错误
    page.on('console', msg => {
      const type = msg.type();
      if (['error', 'warning'].includes(type)) {
        console.log(`❌ 浏览器${type.toUpperCase()}: ${msg.text()}`);
      } else {
        console.log(`💬 浏览器LOG: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', error => {
      console.log(`❌ 页面错误: ${error.message}`);
    });
    
    // 设置视口
    await page.setViewport({ width: 1200, height: 800 });
    
    const baseUrl = 'http://localhost:65521';
    const testPages = [
      {
        name: '独立测试页面',
        url: `${baseUrl}/test/standalone`,
        tests: testStandalonePage
      },
      {
        name: 'Polaris组件测试页面',
        url: `${baseUrl}/test/basic-ui`,
        tests: testBasicUIPage
      }
    ];
    
    // 逐个测试页面
    for (const testPage of testPages) {
      console.log(`\n📋 测试 ${testPage.name}...`);
      console.log(`🔗 URL: ${testPage.url}`);
      
      try {
        await page.goto(testPage.url, { waitUntil: 'networkidle2', timeout: 10000 });
        console.log('✅ 页面加载成功');
        
        // 截图
        const screenshotPath = `/Users/Administrator/translate/test-screenshot-${testPage.name.replace(/\s+/g, '-')}.png`;
        await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true 
        });
        console.log(`📸 截图保存到: ${screenshotPath}`);
        
        // 执行特定测试
        await testPage.tests(page);
        
      } catch (error) {
        console.log(`❌ 测试 ${testPage.name} 失败: ${error.message}`);
      }
      
      // 等待观察
      console.log('⏸️  等待3秒以观察页面...');
      await page.waitForTimeout(3000);
    }
    
    // 测试主应用页面（需要特殊处理，因为需要Shopify认证）
    console.log(`\n📋 测试主应用页面...`);
    try {
      await page.goto(`${baseUrl}/app`, { waitUntil: 'networkidle2', timeout: 10000 });
      console.log('✅ 主应用页面访问成功');
      
      const screenshotPath = `/Users/Administrator/translate/test-screenshot-main-app.png`;
      await page.screenshot({ 
        path: screenshotPath, 
        fullPage: true 
      });
      console.log(`📸 主应用截图保存到: ${screenshotPath}`);
      
    } catch (error) {
      console.log(`❌ 主应用页面测试失败: ${error.message}`);
      console.log('💡 这可能是因为需要Shopify认证');
    }
    
  } catch (error) {
    console.log(`❌ 测试过程中发生错误: ${error.message}`);
  } finally {
    if (browser) {
      console.log('🔚 关闭浏览器...');
      await browser.close();
    }
  }
}

/**
 * 测试独立页面功能
 */
async function testStandalonePage(page) {
  console.log('  🔍 测试独立页面交互...');
  
  try {
    // 等待页面元素加载
    await page.waitForSelector('h1', { timeout: 5000 });
    
    // 检查页面标题
    const title = await page.textContent('h1');
    console.log(`  📄 页面标题: ${title}`);
    
    // 测试语言选择框
    console.log('  🔧 测试语言选择框...');
    const languageSelect = await page.$('select[value="zh-CN"]');
    if (languageSelect) {
      await languageSelect.selectOption('en');
      console.log('  ✅ 语言选择框切换成功');
      await page.waitForTimeout(1000);
      
      // 检查日志是否更新
      const logElements = await page.$$('.translation-grid div[style*="margin-bottom"]');
      if (logElements.length > 0) {
        console.log('  ✅ 选择框交互日志已更新');
      }
    } else {
      console.log('  ❌ 找不到语言选择框');
    }
    
    // 测试资源类型选择框
    console.log('  🔧 测试资源类型选择框...');
    const typeSelectors = await page.$$('select');
    if (typeSelectors.length >= 2) {
      await typeSelectors[1].selectOption('COLLECTION');
      console.log('  ✅ 资源类型选择框切换成功');
      await page.waitForTimeout(1000);
    }
    
    // 测试按钮点击
    console.log('  🔧 测试按钮点击...');
    const testButton = await page.$('button');
    if (testButton) {
      const buttonText = await testButton.textContent();
      console.log(`  🔘 找到按钮: ${buttonText}`);
      
      await testButton.click();
      console.log('  ✅ 按钮点击成功');
      await page.waitForTimeout(1000);
      
      // 检查点击次数是否更新
      const updatedButtonText = await testButton.textContent();
      console.log(`  🔘 点击后按钮文本: ${updatedButtonText}`);
      
      if (updatedButtonText.includes('1')) {
        console.log('  ✅ 按钮点击计数器工作正常');
      }
    } else {
      console.log('  ❌ 找不到测试按钮');
    }
    
    // 测试清空日志按钮
    const clearButton = await page.$('button:nth-of-type(2)');
    if (clearButton) {
      await clearButton.click();
      console.log('  ✅ 清空日志按钮点击成功');
      await page.waitForTimeout(1000);
    }
    
  } catch (error) {
    console.log(`  ❌ 独立页面测试失败: ${error.message}`);
  }
}

/**
 * 测试Polaris组件页面功能
 */
async function testBasicUIPage(page) {
  console.log('  🔍 测试Polaris组件页面交互...');
  
  try {
    // 等待页面加载
    await page.waitForSelector('[data-polaris-surface]', { timeout: 10000 });
    console.log('  ✅ Polaris组件已加载');
    
    // 检查Polaris Select组件
    console.log('  🔧 测试Polaris Select组件...');
    const selectButtons = await page.$$('[aria-expanded]');
    
    for (let i = 0; i < Math.min(selectButtons.length, 2); i++) {
      try {
        console.log(`  🔧 测试第${i + 1}个Select组件...`);
        await selectButtons[i].click();
        await page.waitForTimeout(500);
        
        // 查找选项
        const options = await page.$$('[role="option"]');
        if (options.length > 1) {
          await options[1].click(); // 选择第二个选项
          console.log(`  ✅ 第${i + 1}个Select切换成功`);
          await page.waitForTimeout(1000);
        }
      } catch (selectError) {
        console.log(`  ❌ 第${i + 1}个Select测试失败: ${selectError.message}`);
      }
    }
    
    // 测试Polaris Button组件
    console.log('  🔧 测试Polaris Button组件...');
    const buttons = await page.$$('button[data-polaris-button]');
    
    if (buttons.length > 0) {
      const primaryButton = buttons[0];
      const buttonText = await primaryButton.textContent();
      console.log(`  🔘 找到Polaris按钮: ${buttonText}`);
      
      await primaryButton.click();
      console.log('  ✅ Polaris按钮点击成功');
      await page.waitForTimeout(1000);
    } else {
      console.log('  ❌ 找不到Polaris按钮');
    }
    
  } catch (error) {
    console.log(`  ❌ Polaris组件页面测试失败: ${error.message}`);
  }
}

// 运行测试
testUIInteraction().catch(console.error);