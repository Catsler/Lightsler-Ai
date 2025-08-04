#!/usr/bin/env node

/**
 * 快速诊断工具 - 一键检查应用状态和常见问题
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

class QuickDiagnosis {
  constructor() {
    this.results = {
      server: { status: 'unknown', issues: [] },
      components: { status: 'unknown', issues: [] },
      configuration: { status: 'unknown', issues: [] },
      dependencies: { status: 'unknown', issues: [] }
    };
  }

  async runDiagnosis() {
    console.log('🔬 开始快速诊断...\n');
    
    await this.checkServer();
    await this.checkDependencies();
    await this.checkConfiguration();
    await this.checkComponents();
    
    this.generateReport();
    this.provideSolutions();
  }

  async checkServer() {
    console.log('🖥️  检查服务器状态...');
    
    try {
      // 检查端口占用
      const portCheckResult = await this.runCommand('lsof -i :61423 | grep LISTEN');
      if (portCheckResult.trim()) {
        console.log('✅ 服务器运行在端口 61423');
        this.results.server.status = 'running';
      } else {
        console.log('❌ 端口 61423 未被占用');
        this.results.server.status = 'not_running';
        this.results.server.issues.push('应用服务器未运行');
      }
    } catch (error) {
      console.log('⚠️  无法检查端口状态');
      this.results.server.issues.push('端口检查失败');
    }

    // 检查进程
    try {
      const processResult = await this.runCommand('ps aux | grep "npm run dev\\|shopify app dev" | grep -v grep');
      if (processResult.trim()) {
        console.log('✅ 发现开发服务器进程');
      } else {
        console.log('❌ 未发现开发服务器进程');
        this.results.server.issues.push('开发服务器进程未运行');
      }
    } catch (error) {
      console.log('⚠️  无法检查进程状态');
    }
  }

  async checkDependencies() {
    console.log('📦 检查依赖项...');
    
    try {
      // 检查node_modules
      if (fs.existsSync('node_modules')) {
        console.log('✅ node_modules 目录存在');
        
        // 检查关键依赖
        const criticalDeps = [
          '@shopify/polaris',
          '@shopify/app-bridge-react',
          '@remix-run/react',
          'react'
        ];
        
        for (const dep of criticalDeps) {
          if (fs.existsSync(`node_modules/${dep}`)) {
            console.log(`✅ ${dep}`);
          } else {
            console.log(`❌ ${dep} 缺失`);
            this.results.dependencies.issues.push(`缺少依赖: ${dep}`);
          }
        }
        
        if (this.results.dependencies.issues.length === 0) {
          this.results.dependencies.status = 'ok';
        } else {
          this.results.dependencies.status = 'missing';
        }
      } else {
        console.log('❌ node_modules 目录不存在');
        this.results.dependencies.status = 'not_installed';
        this.results.dependencies.issues.push('依赖包未安装');
      }
    } catch (error) {
      console.log('⚠️  依赖检查失败:', error.message);
      this.results.dependencies.status = 'error';
    }
  }

  async checkConfiguration() {
    console.log('⚙️ 检查配置...');
    
    // 检查环境变量
    const requiredEnvVars = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
    const missingEnvVars = [];
    
    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(`✅ ${envVar} 已配置`);
      } else {
        console.log(`❌ ${envVar} 未配置`);
        missingEnvVars.push(envVar);
      }
    }
    
    if (missingEnvVars.length > 0) {
      this.results.configuration.status = 'incomplete';
      this.results.configuration.issues.push(`缺少环境变量: ${missingEnvVars.join(', ')}`);
    }
    
    // 检查.env文件
    if (fs.existsSync('.env')) {
      console.log('✅ .env 文件存在');
      
      const envContent = fs.readFileSync('.env', 'utf8');
      if (envContent.includes('SHOPIFY_API_KEY=') && envContent.includes('SHOPIFY_API_SECRET=')) {
        console.log('✅ .env 文件包含必要配置');
        if (this.results.configuration.status !== 'incomplete') {
          this.results.configuration.status = 'ok';
        }
      }
    } else {
      console.log('❌ .env 文件不存在');
      this.results.configuration.issues.push('.env 文件缺失');
    }
    
    // 检查关键配置文件
    const configFiles = ['package.json', 'vite.config.js'];
    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        console.log(`✅ ${configFile}`);
      } else {
        console.log(`❌ ${configFile} 缺失`);
        this.results.configuration.issues.push(`配置文件缺失: ${configFile}`);
      }
    }
  }

  async checkComponents() {
    console.log('🧩 检查组件文件...');
    
    const componentFiles = [
      'app/routes/app._index.jsx',
      'app/routes/app.jsx',
      'app/routes/test.standalone.jsx',
      'app/routes/test.basic-ui.jsx',
      'app/components/ErrorBoundary.jsx'
    ];
    
    let missingFiles = 0;
    
    for (const filePath of componentFiles) {
      if (fs.existsSync(filePath)) {
        console.log(`✅ ${filePath}`);
        
        // 简单的语法检查
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.includes('export default')) {
            // 基本结构正常
          }
        } catch (error) {
          this.results.components.issues.push(`文件读取错误: ${filePath}`);
        }
      } else {
        console.log(`❌ ${filePath} 缺失`);
        this.results.components.issues.push(`组件文件缺失: ${filePath}`);
        missingFiles++;
      }
    }
    
    if (missingFiles === 0) {
      this.results.components.status = 'ok';
    } else {
      this.results.components.status = 'incomplete';
    }
  }

  async runCommand(command) {
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

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 快速诊断报告');
    console.log('='.repeat(60));
    
    const categories = [
      { name: '服务器', key: 'server', icon: '🖥️' },
      { name: '依赖项', key: 'dependencies', icon: '📦' },
      { name: '配置', key: 'configuration', icon: '⚙️' },
      { name: '组件', key: 'components', icon: '🧩' }
    ];
    
    let overallHealth = 'healthy';
    
    for (const category of categories) {
      const result = this.results[category.key];
      const statusIcon = this.getStatusIcon(result.status);
      
      console.log(`${category.icon} ${category.name}: ${statusIcon} ${result.status}`);
      
      if (result.issues.length > 0) {
        result.issues.forEach(issue => {
          console.log(`   • ${issue}`);
        });
        overallHealth = 'issues';
      }
      console.log('');
    }
    
    console.log(`🎯 总体状态: ${overallHealth === 'healthy' ? '✅ 健康' : '⚠️ 存在问题'}`);
  }

  getStatusIcon(status) {
    switch (status) {
      case 'ok':
      case 'running':
        return '✅';
      case 'not_running':
      case 'not_installed':
      case 'incomplete':
      case 'missing':
        return '❌';
      case 'error':
      case 'unknown':
        return '⚠️';
      default:
        return '❓';
    }
  }

  provideSolutions() {
    console.log('💡 解决方案建议:\n');
    
    // 服务器问题
    if (this.results.server.status === 'not_running') {
      console.log('🖥️ 启动开发服务器:');
      console.log('   npm run dev');
      console.log('   或: shopify app dev\n');
    }
    
    // 依赖问题
    if (this.results.dependencies.status !== 'ok') {
      console.log('📦 安装依赖项:');
      console.log('   npm install');
      console.log('   或: npm ci (如果有package-lock.json)\n');
    }
    
    // 配置问题
    if (this.results.configuration.status !== 'ok') {
      console.log('⚙️ 配置修复:');
      console.log('   1. 创建.env文件');
      console.log('   2. 添加必要的环境变量:');
      console.log('      SHOPIFY_API_KEY=your_api_key');
      console.log('      SHOPIFY_API_SECRET=your_api_secret\n');
    }
    
    // 组件问题
    if (this.results.components.status !== 'ok') {
      console.log('🧩 检查组件文件:');
      console.log('   确保所有必要的组件文件存在');
      console.log('   检查文件语法是否正确\n');
    }
    
    // 通用测试步骤
    console.log('🧪 测试步骤:');
    console.log('   1. 访问: http://localhost:61423/test/interactive');
    console.log('   2. 测试各种组件交互');
    console.log('   3. 检查浏览器控制台错误');
    console.log('   4. 在控制台运行: ');
    console.log('      fetch("/error-monitor.js").then(r=>r.text()).then(eval)');
    console.log('      然后使用 errorMonitor.testComponents()');
  }
}

// 主函数
async function main() {
  const diagnosis = new QuickDiagnosis();
  
  try {
    await diagnosis.runDiagnosis();
  } catch (error) {
    console.error('❌ 诊断过程中出错:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default QuickDiagnosis;