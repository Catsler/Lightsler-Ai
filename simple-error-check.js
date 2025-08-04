#!/usr/bin/env node

/**
 * 简化的错误检测脚本
 * 检查应用的基本可用性和配置问题
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SimpleErrorChecker {
  constructor() {
    this.issues = [];
    this.fixes = [];
  }

  async checkAll() {
    console.log('🔍 开始简化错误检查...\n');
    
    await this.checkEnvironment();
    await this.checkFiles();
    await this.checkComponents();
    await this.checkConfiguration();
    
    this.generateReport();
    this.suggestFixes();
  }

  async checkEnvironment() {
    console.log('🌍 检查环境配置...');
    
    // 检查Node.js版本
    const nodeVersion = process.version;
    console.log(`Node.js版本: ${nodeVersion}`);
    
    // 检查环境变量
    const requiredEnvVars = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      this.issues.push({
        type: 'environment',
        severity: 'critical',
        message: `缺少环境变量: ${missingEnvVars.join(', ')}`,
        fix: '在.env文件或环境中设置这些变量'
      });
    }
    
    // 检查package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // 检查关键依赖
      const criticalDeps = [
        '@shopify/polaris',
        '@shopify/app-bridge-react',
        '@remix-run/react',
        'react'
      ];
      
      const missingDeps = criticalDeps.filter(dep => 
        !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
      );
      
      if (missingDeps.length > 0) {
        this.issues.push({
          type: 'dependencies',
          severity: 'high',
          message: `缺少关键依赖: ${missingDeps.join(', ')}`,
          fix: `运行 npm install ${missingDeps.join(' ')}`
        });
      }
      
      console.log(`✅ package.json检查完成`);
    } else {
      this.issues.push({
        type: 'files',
        severity: 'critical',
        message: 'package.json文件不存在',
        fix: '确保在正确的项目目录中运行'
      });
    }
  }

  async checkFiles() {
    console.log('📁 检查核心文件...');
    
    const criticalFiles = [
      'app/routes/app._index.jsx',
      'app/routes/app.jsx', 
      'app/routes/test.standalone.jsx',
      'app/routes/test.basic-ui.jsx',
      'app/components/ErrorBoundary.jsx'
    ];
    
    for (const filePath of criticalFiles) {
      const fullPath = path.join(process.cwd(), filePath);
      if (!fs.existsSync(fullPath)) {
        this.issues.push({
          type: 'files',
          severity: 'high',
          message: `关键文件缺失: ${filePath}`,
          fix: '检查文件是否存在或路径是否正确'
        });
      } else {
        console.log(`✅ ${filePath}`);
      }
    }
  }

  async checkComponents() {
    console.log('🧩 检查React组件...');
    
    const mainComponentPath = path.join(process.cwd(), 'app/routes/app._index.jsx');
    if (fs.existsSync(mainComponentPath)) {
      const content = fs.readFileSync(mainComponentPath, 'utf8');
      
      // 检查常见的React问题
      const checks = [
        {
          pattern: /useState\s*\(/g,
          name: 'useState使用',
          required: true
        },
        {
          pattern: /useCallback\s*\(/g,
          name: 'useCallback使用',
          required: false,
          suggestion: '考虑使用useCallback优化事件处理器'
        },
        {
          pattern: /<Select[\s\S]*?onChange=/g,
          name: 'Select组件事件处理',
          required: true
        },
        {
          pattern: /<Button[\s\S]*?onClick=/g,
          name: 'Button组件事件处理',
          required: true
        },
        {
          pattern: /ErrorBoundary/g,
          name: '错误边界',
          required: false,
          suggestion: '使用ErrorBoundary提高应用稳定性'
        }
      ];
      
      for (const check of checks) {
        const matches = content.match(check.pattern) || [];
        if (check.required && matches.length === 0) {
          this.issues.push({
            type: 'component',
            severity: 'medium',
            message: `缺少${check.name}`,
            fix: check.suggestion || `添加${check.name}`
          });
        } else if (matches.length > 0) {
          console.log(`✅ ${check.name}: ${matches.length}个`);
        }
        
        if (!check.required && matches.length === 0 && check.suggestion) {
          this.issues.push({
            type: 'suggestion',
            severity: 'low',
            message: check.suggestion,
            fix: '可选优化'
          });
        }
      }
      
      // 检查可能的错误模式
      const errorPatterns = [
        {
          pattern: /setSelectedLanguage\s*\(\s*value\s*\)/g,
          message: 'Select onChange处理正常'
        },
        {
          pattern: /onClick=\{[^}]*\}/g,
          message: 'Button onClick处理存在'
        }
      ];
      
      for (const errorPattern of errorPatterns) {
        const matches = content.match(errorPattern.pattern) || [];
        if (matches.length > 0) {
          console.log(`✅ ${errorPattern.message}`);
        }
      }
    }
  }

  async checkConfiguration() {
    console.log('⚙️ 检查配置文件...');
    
    // 检查vite.config.js
    const viteConfigPath = path.join(process.cwd(), 'vite.config.js');
    if (fs.existsSync(viteConfigPath)) {
      console.log('✅ vite.config.js存在');
    } else {
      this.issues.push({
        type: 'config',
        severity: 'medium',
        message: 'vite.config.js缺失',
        fix: '创建Vite配置文件'
      });
    }
    
    // 检查.env文件
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      console.log('✅ .env文件存在');
      
      const envContent = fs.readFileSync(envPath, 'utf8');
      const hasApiKey = envContent.includes('SHOPIFY_API_KEY');
      const hasApiSecret = envContent.includes('SHOPIFY_API_SECRET');
      
      if (!hasApiKey || !hasApiSecret) {
        this.issues.push({
          type: 'config',
          severity: 'high',
          message: '.env文件中缺少Shopify API配置',
          fix: '添加SHOPIFY_API_KEY和SHOPIFY_API_SECRET到.env文件'
        });
      }
    } else {
      this.issues.push({
        type: 'config',
        severity: 'medium',
        message: '.env文件不存在',
        fix: '创建.env文件并添加必要的环境变量'
      });
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📋 错误检查报告');
    console.log('='.repeat(50));
    
    const criticalIssues = this.issues.filter(issue => issue.severity === 'critical');
    const highIssues = this.issues.filter(issue => issue.severity === 'high');
    const mediumIssues = this.issues.filter(issue => issue.severity === 'medium');
    const lowIssues = this.issues.filter(issue => issue.severity === 'low');
    
    console.log(`总问题数: ${this.issues.length}`);
    console.log(`- 严重: ${criticalIssues.length}`);
    console.log(`- 高: ${highIssues.length}`);
    console.log(`- 中: ${mediumIssues.length}`);
    console.log(`- 低: ${lowIssues.length}\n`);
    
    if (criticalIssues.length > 0) {
      console.log('🚨 严重问题:');
      criticalIssues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.message}`);
        console.log(`   修复: ${issue.fix}\n`);
      });
    }
    
    if (highIssues.length > 0) {
      console.log('⚠️  高优先级问题:');
      highIssues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.message}`);
        console.log(`   修复: ${issue.fix}\n`);
      });
    }
    
    if (mediumIssues.length > 0 && mediumIssues.length <= 5) {
      console.log('📝 中等问题:');
      mediumIssues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.message}`);
        console.log(`   修复: ${issue.fix}\n`);
      });
    }
  }

  suggestFixes() {
    console.log('💡 修复建议:');
    
    if (this.issues.some(issue => issue.type === 'environment')) {
      console.log('\n1. 环境配置修复:');
      console.log('   创建.env文件并添加以下内容:');
      console.log('   SHOPIFY_API_KEY=your_api_key_here');
      console.log('   SHOPIFY_API_SECRET=your_api_secret_here');
      console.log('   GPT_API_URL=https://api-gpt-ge.apifox.cn');
      console.log('   GPT_API_KEY=your_gpt_api_key_here');
    }
    
    if (this.issues.some(issue => issue.type === 'dependencies')) {
      console.log('\n2. 依赖修复:');
      console.log('   运行: npm install');
      console.log('   如果仍有问题，运行: npm ci');
    }
    
    console.log('\n3. 快速测试步骤:');
    console.log('   1. 确保应用正在运行: npm run dev');
    console.log('   2. 访问: http://localhost:61423/test/standalone');
    console.log('   3. 测试选择框和按钮是否响应');
    console.log('   4. 检查浏览器控制台是否有错误');
    
    console.log('\n4. 调试指南:');
    console.log('   - 打开浏览器开发者工具 (F12)');
    console.log('   - 检查Console选项卡的错误信息');
    console.log('   - 检查Elements选项卡确认组件正确渲染');
    console.log('   - 在Network选项卡查看API请求状态');
    
    if (this.issues.length === 0) {
      console.log('\n🎉 所有检查都通过了！');
      console.log('如果按键和选择仍然无法工作，可能是以下原因:');
      console.log('1. 浏览器扩展程序干扰 (尝试隐身模式)');
      console.log('2. 缓存问题 (清除浏览器缓存)'); 
      console.log('3. JavaScript被禁用');
      console.log('4. 网络连接问题');
    }
  }
}

// 主函数
async function main() {
  const checker = new SimpleErrorChecker();
  
  try {
    await checker.checkAll();
  } catch (error) {
    console.error('❌ 检查过程中出错:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SimpleErrorChecker;