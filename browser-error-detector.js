#!/usr/bin/env node

/**
 * 浏览器错误检测器 - 实时监控JavaScript运行时错误
 * 
 * 使用 browser-tools-mcp 检测前端错误和性能问题
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

class BrowserErrorDetector {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.performanceMetrics = {};
    this.isMonitoring = false;
  }

  /**
   * 启动浏览器错误监控
   */
  async startMonitoring(url = 'http://localhost:61423') {
    console.log(`🌐 启动浏览器错误监控: ${url}`);
    
    const testPages = [
      `${url}/app`,
      `${url}/test/standalone`, 
      `${url}/test/basic-ui`
    ];

    for (const pageUrl of testPages) {
      console.log(`\n🔍 检测页面: ${pageUrl}`);
      await this.detectPageErrors(pageUrl);
    }

    this.generateErrorReport();
  }

  /**
   * 检测单个页面的错误
   */
  async detectPageErrors(url) {
    try {
      // 使用简单的fetch测试API可达性
      console.log(`📡 测试页面可达性...`);
      
      const puppeteerScript = `
        const puppeteer = require('puppeteer');
        
        (async () => {
          let browser;
          try {
            browser = await puppeteer.launch({ 
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            
            // 收集控制台错误
            const errors = [];
            const warnings = [];
            
            page.on('console', msg => {
              const type = msg.type();
              const text = msg.text();
              if (type === 'error') {
                errors.push({ type, text, url: page.url() });
              } else if (type === 'warning') {
                warnings.push({ type, text, url: page.url() });
              }
            });
            
            page.on('pageerror', error => {
              errors.push({ 
                type: 'pageerror', 
                text: error.message, 
                stack: error.stack,
                url: page.url() 
              });
            });
            
            // 导航到页面
            await page.goto('${url}', { 
              waitUntil: 'networkidle2',
              timeout: 30000
            });
            
            // 等待页面完全加载
            await page.waitForTimeout(5000);
            
            // 测试基本交互
            await this.testInteractions(page);
            
            // 获取性能指标
            const metrics = await page.metrics();
            
            console.log(JSON.stringify({
              errors,
              warnings, 
              metrics,
              url: page.url(),
              title: await page.title()
            }));
            
          } catch (error) {
            console.log(JSON.stringify({
              errors: [{ type: 'navigation', text: error.message }],
              warnings: [],
              metrics: {},
              url: '${url}'
            }));
          } finally {
            if (browser) await browser.close();
          }
        })();
        
        async function testInteractions(page) {
          try {
            // 测试选择框
            const selects = await page.$$('select');
            for (const select of selects) {
              try {
                await select.select('zh-CN');
                await page.waitForTimeout(1000);
              } catch (e) {
                console.error('Select interaction failed:', e.message);
              }
            }
            
            // 测试按钮点击
            const buttons = await page.$$('button');
            for (let i = 0; i < Math.min(buttons.length, 3); i++) {
              try {
                await buttons[i].click();
                await page.waitForTimeout(1000);
              } catch (e) {
                console.error('Button click failed:', e.message);
              }
            }
            
            // 测试Polaris Select组件
            const polarisSelects = await page.$$('[data-polaris-select]');
            for (const select of polarisSelects) {
              try {
                await select.click();
                await page.waitForTimeout(500);
                
                const options = await page.$$('[data-polaris-option]');
                if (options.length > 0) {
                  await options[0].click();
                  await page.waitForTimeout(1000);
                }
              } catch (e) {
                console.error('Polaris Select interaction failed:', e.message);
              }
            }
          } catch (error) {
            console.error('Interaction testing failed:', error.message);
          }
        }
      `;

      // 创建临时的Puppeteer脚本
      const scriptPath = path.join(process.cwd(), 'temp-browser-test.js');
      fs.writeFileSync(scriptPath, puppeteerScript);

      try {
        // 检查是否安装了puppeteer
        const result = await this.runCommand('npm list puppeteer');
        if (!result.includes('puppeteer@')) {
          console.log('📦 安装 Puppeteer...');
          await this.runCommand('npm install puppeteer --no-save');
        }
      } catch (error) {
        console.log('📦 安装 Puppeteer...');
        await this.runCommand('npm install puppeteer --no-save');
      }

      // 运行Puppeteer脚本
      const output = await this.runCommand(`node ${scriptPath}`);
      
      try {
        const result = JSON.parse(output);
        
        console.log(`✅ 页面标题: ${result.title}`);
        console.log(`🔗 URL: ${result.url}`);
        
        if (result.errors.length > 0) {
          console.log(`❌ 发现 ${result.errors.length} 个错误:`);
          result.errors.forEach((error, i) => {
            console.log(`  ${i + 1}. [${error.type}] ${error.text}`);
            if (error.stack) {
              console.log(`     堆栈: ${error.stack.split('\n')[0]}`);
            }
          });
          this.errors.push(...result.errors.map(e => ({ ...e, pageUrl: url })));
        } else {
          console.log(`✅ 无JavaScript错误`);
        }
        
        if (result.warnings.length > 0) {
          console.log(`⚠️  发现 ${result.warnings.length} 个警告`);
          this.warnings.push(...result.warnings.map(w => ({ ...w, pageUrl: url })));
        }
        
        // 记录性能指标
        if (result.metrics) {
          this.performanceMetrics[url] = result.metrics;
          console.log(`📊 性能指标: ${Object.keys(result.metrics).length} 项`);
        }
        
      } catch (parseError) {
        console.log(`❌ 页面加载失败或解析错误: ${parseError.message}`);
        this.errors.push({
          type: 'parse_error',
          text: `页面测试失败: ${parseError.message}`,
          pageUrl: url
        });
      }
      
      // 清理临时文件
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // 忽略清理错误
      }
      
    } catch (error) {
      console.log(`❌ 检测页面错误: ${error.message}`);
      this.errors.push({
        type: 'detector_error',
        text: error.message,
        pageUrl: url
      });
    }
  }

  /**
   * 运行命令并返回输出
   */
  runCommand(command) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, { stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 生成错误报告
   */
  generateErrorReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🔬 浏览器错误检测报告');
    console.log('='.repeat(60));
    
    const totalErrors = this.errors.length;
    const totalWarnings = this.warnings.length;
    
    if (totalErrors === 0 && totalWarnings === 0) {
      console.log('✅ 恭喜！未发现JavaScript运行时错误');
      console.log('🎉 按键和选择功能应该正常工作');
    } else {
      console.log(`❌ 发现 ${totalErrors} 个错误, ${totalWarnings} 个警告`);
    }
    
    // 错误详情
    if (totalErrors > 0) {
      console.log('\n🚨 错误详情:');
      this.errors.forEach((error, i) => {
        console.log(`${i + 1}. [${error.type}] ${error.text}`);
        console.log(`   页面: ${error.pageUrl}`);
        if (error.stack) {
          console.log(`   堆栈: ${error.stack.split('\n').slice(0, 2).join(' -> ')}`);
        }
        console.log('');
      });
    }
    
    // 警告详情  
    if (totalWarnings > 0 && totalWarnings <= 10) {
      console.log('\n⚠️  警告详情:');
      this.warnings.forEach((warning, i) => {
        console.log(`${i + 1}. ${warning.text}`);
        console.log(`   页面: ${warning.pageUrl}`);
      });
      console.log('');
    }
    
    // 修复建议
    console.log('\n💡 修复建议:');
    
    if (this.errors.some(e => e.text.includes('Cannot read') || e.text.includes('undefined'))) {
      console.log('1. 检查变量和对象属性是否正确初始化');
      console.log('   - 使用可选链操作符 (?.) 避免访问未定义属性');
      console.log('   - 添加条件检查确保对象存在');
    }
    
    if (this.errors.some(e => e.text.includes('fetch') || e.text.includes('Network'))) {
      console.log('2. 网络请求错误');
      console.log('   - 检查API端点是否可达');
      console.log('   - 确认服务器正在运行');
      console.log('   - 检查CORS配置');
    }
    
    if (this.errors.some(e => e.text.includes('AppProvider') || e.text.includes('app-bridge'))) {
      console.log('3. Shopify App Bridge 问题');
      console.log('   - 检查SHOPIFY_API_KEY环境变量');
      console.log('   - 确认应用在Shopify管理后台正确配置');
      console.log('   - 验证AppProvider组件配置');
    }
    
    console.log('\n4. 通用调试步骤:');
    console.log('   - 打开浏览器开发者工具 (F12)');
    console.log('   - 查看Console选项卡的错误信息');
    console.log('   - 检查Network选项卡的网络请求');
    console.log('   - 使用React DevTools检查组件状态');
    
    // 性能报告
    if (Object.keys(this.performanceMetrics).length > 0) {
      console.log('\n📊 性能概况:');
      Object.entries(this.performanceMetrics).forEach(([url, metrics]) => {
        console.log(`${url}:`);
        console.log(`  - JS执行时间: ${Math.round(metrics.ScriptDuration || 0)}ms`);
        console.log(`  - 任务持续时间: ${Math.round(metrics.TaskDuration || 0)}ms`);
      });
    }
    
    // 保存详细报告
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors,
        totalWarnings,
        pagesChecked: [...new Set([...this.errors, ...this.warnings].map(item => item.pageUrl))]
      },
      errors: this.errors,
      warnings: this.warnings,
      performanceMetrics: this.performanceMetrics
    };
    
    const reportPath = path.join(process.cwd(), 'browser-error-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 详细报告已保存到: ${reportPath}`);
  }
}

// 命令行接口
async function main() {
  const detector = new BrowserErrorDetector();
  
  // 从命令行参数获取URL
  const url = process.argv[2] || 'http://localhost:61423';
  
  try {
    await detector.startMonitoring(url);
  } catch (error) {
    console.error('❌ 浏览器错误检测失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default BrowserErrorDetector;