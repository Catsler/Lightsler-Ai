#!/usr/bin/env node

/**
 * Bug Detective Agent - 智能错误检测和修复专家
 * 
 * 专门用于检测JavaScript运行时错误、组件问题和性能异常
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BugDetectiveAgent {
  constructor() {
    this.errorPatterns = {
      // 常见的React/Remix错误模式
      react_hydration: {
        signature: /hydration|hydrating|expected server HTML|client.*server/i,
        severity: 'high',
        description: 'React hydration 不匹配错误',
        solution: '检查服务端和客户端渲染差异'
      },
      
      // Shopify Polaris组件错误
      polaris_components: {
        signature: /Select.*onChange|Button.*onClick|AppProvider/i,
        severity: 'medium',
        description: 'Shopify Polaris 组件事件处理问题',
        solution: '验证组件属性和事件处理函数'
      },
      
      // App Bridge错误
      app_bridge_error: {
        signature: /app.bridge|useAppBridge|AppProvider.*apiKey/i,
        severity: 'high',
        description: 'Shopify App Bridge 初始化错误',
        solution: '检查API密钥配置和嵌入模式设置'
      },
      
      // 网络和API错误
      network_errors: {
        signature: /fetch.*failed|NetworkError|CORS|Failed to fetch/i,
        severity: 'critical',
        description: '网络请求失败',
        solution: '检查API端点、网络连接和CORS配置'
      },
      
      // JavaScript运行时错误
      runtime_errors: {
        signature: /TypeError|ReferenceError|Cannot read property|undefined is not a function/i,
        severity: 'high',
        description: 'JavaScript运行时错误',
        solution: '检查变量定义和对象属性访问'
      }
    };
    
    this.diagnosticTests = [
      'testComponentRendering',
      'testEventHandlers', 
      'testStateManagement',
      'testApiCalls',
      'testPolarisDependencies'
    ];
  }

  /**
   * 执行全面的错误检测
   */
  async performFullDiagnosis() {
    console.log('🔬 Bug Detective Agent 开始全面诊断...\n');
    
    const results = {
      timestamp: new Date().toISOString(),
      criticalIssues: [],
      warnings: [],
      recommendations: [],
      codeAnalysis: {}
    };

    // 1. 静态代码分析
    console.log('📊 1. 执行静态代码分析...');
    results.codeAnalysis = await this.analyzeCodeBase();
    
    // 2. 组件完整性检查
    console.log('🧩 2. 检查组件完整性...');
    const componentIssues = await this.checkComponentIntegrity();
    results.criticalIssues.push(...componentIssues.critical);
    results.warnings.push(...componentIssues.warnings);
    
    // 3. 依赖关系验证
    console.log('📦 3. 验证依赖关系...');
    const dependencyIssues = await this.validateDependencies();
    results.warnings.push(...dependencyIssues);
    
    // 4. 配置检查
    console.log('⚙️ 4. 检查配置文件...');
    const configIssues = await this.checkConfiguration();
    results.warnings.push(...configIssues);
    
    // 5. 生成修复建议
    console.log('💡 5. 生成修复建议...');
    results.recommendations = this.generateRecommendations(results);
    
    return results;
  }

  /**
   * 分析代码库中的潜在问题
   */
  async analyzeCodeBase() {
    const analysis = {
      totalFiles: 0,
      reactComponents: 0,
      potentialIssues: [],
      unusedImports: [],
      eventHandlerIssues: []
    };

    const routesDir = path.join(process.cwd(), 'app/routes');
    
    if (!fs.existsSync(routesDir)) {
      analysis.potentialIssues.push('app/routes 目录不存在');
      return analysis;
    }

    const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.jsx') || f.endsWith('.tsx'));
    analysis.totalFiles = files.length;

    for (const file of files) {
      const filePath = path.join(routesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 检查React组件
      if (content.includes('export default function') || content.includes('export default class')) {
        analysis.reactComponents++;
      }
      
      // 检查事件处理器问题
      const eventHandlerRegex = /onClick=\{([^}]+)\}|onChange=\{([^}]+)\}/g;
      let match;
      while ((match = eventHandlerRegex.exec(content)) !== null) {
        const handler = match[1] || match[2];
        if (handler && !handler.includes('(') && !handler.includes('useCallback')) {
          analysis.eventHandlerIssues.push({
            file,
            issue: `可能的事件处理器问题: ${handler}`,
            line: content.substring(0, match.index).split('\n').length
          });
        }
      }
      
      // 检查未使用的导入
      const importRegex = /import\s+\{([^}]+)\}\s+from/g;
      while ((match = importRegex.exec(content)) !== null) {
        const imports = match[1].split(',').map(s => s.trim());
        for (const imp of imports) {
          if (!content.includes(imp.replace(/\s+as\s+\w+/, ''))) {
            analysis.unusedImports.push({ file, import: imp });
          }
        }
      }
    }

    return analysis;
  }

  /**
   * 检查组件完整性
   */
  async checkComponentIntegrity() {
    const issues = { critical: [], warnings: [] };
    
    // 检查主应用组件
    const mainComponentPath = path.join(process.cwd(), 'app/routes/app._index.jsx');
    if (fs.existsSync(mainComponentPath)) {
      const content = fs.readFileSync(mainComponentPath, 'utf8');
      
      // 检查Select组件使用
      if (content.includes('<Select')) {
        const selectRegex = /<Select[\s\S]*?\/>/g;
        const selectMatches = content.match(selectRegex);
        
        if (selectMatches) {
          for (const match of selectMatches) {
            if (!match.includes('onChange=')) {
              issues.critical.push({
                component: 'Select',
                issue: '缺少onChange事件处理器',
                fix: '添加onChange={handleChange}属性'
              });
            }
            if (!match.includes('value=')) {
              issues.warnings.push({
                component: 'Select', 
                issue: '缺少value属性，可能导致组件不受控',
                fix: '添加value={selectedValue}属性'
              });
            }
          }
        }
      }
      
      // 检查Button组件使用
      if (content.includes('<Button')) {
        const buttonRegex = /<Button[\s\S]*?>/g;
        const buttonMatches = content.match(buttonRegex);
        
        if (buttonMatches) {
          for (const match of buttonMatches) {
            if (!match.includes('onClick=') && !match.includes('type="submit"')) {
              issues.warnings.push({
                component: 'Button',
                issue: '缺少onClick事件处理器或type属性',
                fix: '添加onClick={handleClick}或type="submit"'
              });
            }
          }
        }
      }
      
      // 检查useState使用
      const stateRegex = /const\s+\[(\w+),\s*set\w+\]\s*=\s*useState/g;
      let stateMatch;
      const stateVariables = [];
      while ((stateMatch = stateRegex.exec(content)) !== null) {
        stateVariables.push(stateMatch[1]);
      }
      
      // 检查状态是否被使用
      for (const stateVar of stateVariables) {
        const usageCount = (content.match(new RegExp(`\\b${stateVar}\\b`, 'g')) || []).length;
        if (usageCount <= 1) { // 只在声明时使用一次
          issues.warnings.push({
            component: 'State',
            issue: `状态变量 ${stateVar} 可能未被使用`,
            fix: `确保 ${stateVar} 在组件中被正确使用`
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * 验证依赖关系
   */
  async validateDependencies() {
    const issues = [];
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      issues.push('package.json 文件不存在');
      return issues;
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    // 检查关键依赖
    const criticalDeps = [
      '@shopify/polaris',
      '@shopify/app-bridge-react', 
      '@remix-run/react',
      'react',
      'react-dom'
    ];
    
    for (const dep of criticalDeps) {
      if (!dependencies[dep]) {
        issues.push(`缺少关键依赖: ${dep}`);
      }
    }
    
    // 检查版本兼容性
    if (dependencies['@shopify/polaris']) {
      const polarisVersion = dependencies['@shopify/polaris'];
      if (!polarisVersion.includes('12.')) {
        issues.push(`Polaris版本可能过旧: ${polarisVersion}, 建议使用v12.x`);
      }
    }
    
    return issues;
  }

  /**
   * 检查配置文件
   */
  async checkConfiguration() {
    const issues = [];
    
    // 检查环境变量
    const requiredEnvVars = [
      'SHOPIFY_API_KEY',
      'SHOPIFY_API_SECRET'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        issues.push(`缺少环境变量: ${envVar}`);
      }
    }
    
    // 检查 vite.config.js
    const viteConfigPath = path.join(process.cwd(), 'vite.config.js');
    if (!fs.existsSync(viteConfigPath)) {
      issues.push('vite.config.js 文件不存在');
    }
    
    return issues;
  }

  /**
   * 生成修复建议
   */
  generateRecommendations(results) {
    const recommendations = [];
    
    // 基于发现的问题生成建议
    if (results.criticalIssues.length > 0) {
      recommendations.push({
        priority: 'high',
        title: '修复关键组件问题',
        description: '发现了影响用户交互的关键问题',
        actions: [
          '检查Select和Button组件的事件处理器',
          '验证组件属性是否正确传递',
          '确保状态更新触发重新渲染'
        ]
      });
    }
    
    if (results.codeAnalysis.eventHandlerIssues.length > 0) {
      recommendations.push({
        priority: 'medium',
        title: '优化事件处理器',
        description: '发现可能的事件处理器性能问题',
        actions: [
          '使用useCallback包装事件处理函数',
          '避免在渲染时创建新的函数引用',
          '考虑使用事件委托模式'
        ]
      });
    }
    
    if (results.warnings.some(w => typeof w === 'string' && w.includes('依赖'))) {
      recommendations.push({
        priority: 'medium',
        title: '更新依赖包',
        description: '发现过时或不兼容的依赖包',
        actions: [
          'npm update 更新依赖包',
          '检查breaking changes',
          '运行测试确保兼容性'
        ]
      });
    }
    
    // 通用建议
    recommendations.push({
      priority: 'low',
      title: '开发者体验优化',
      description: '提升开发效率的建议',
      actions: [
        '启用React DevTools进行调试',
        '使用浏览器开发者工具检查控制台错误',
        '配置ESLint自动修复简单问题',
        '添加错误边界捕获运行时错误'
      ]
    });
    
    return recommendations;
  }

  /**
   * 生成详细的诊断报告
   */
  generateReport(results) {
    const report = [];
    
    report.push('🔬 Bug Detective Agent 诊断报告');
    report.push('=' .repeat(50));
    report.push(`时间: ${new Date(results.timestamp).toLocaleString('zh-CN')}`);
    report.push('');
    
    // 总体状态
    const totalIssues = results.criticalIssues.length + results.warnings.length;
    if (totalIssues === 0) {
      report.push('✅ 未发现严重问题！应用状态良好。');
    } else {
      report.push(`⚠️  发现 ${totalIssues} 个潜在问题 (${results.criticalIssues.length} 个关键, ${results.warnings.length} 个警告)`);
    }
    report.push('');
    
    // 关键问题
    if (results.criticalIssues.length > 0) {
      report.push('🚨 关键问题:');
      results.criticalIssues.forEach((issue, i) => {
        report.push(`${i + 1}. ${issue.component || '组件'}: ${issue.issue}`);
        if (issue.fix) {
          report.push(`   修复方案: ${issue.fix}`);
        }
      });
      report.push('');
    }
    
    // 警告
    if (results.warnings.length > 0) {
      report.push('⚠️  警告信息:');
      results.warnings.slice(0, 10).forEach((warning, i) => {
        if (typeof warning === 'string') {
          report.push(`${i + 1}. ${warning}`);
        } else {
          report.push(`${i + 1}. ${warning.component || '组件'}: ${warning.issue}`);
        }
      });
      if (results.warnings.length > 10) {
        report.push(`   ... 还有 ${results.warnings.length - 10} 个警告`);
      }
      report.push('');
    }
    
    // 代码分析
    if (results.codeAnalysis) {
      report.push('📊 代码分析结果:');
      report.push(`- 扫描文件: ${results.codeAnalysis.totalFiles}`);
      report.push(`- React组件: ${results.codeAnalysis.reactComponents}`);
      report.push(`- 事件处理器问题: ${results.codeAnalysis.eventHandlerIssues.length}`);
      report.push(`- 未使用导入: ${results.codeAnalysis.unusedImports.length}`);
      report.push('');
    }
    
    // 修复建议
    if (results.recommendations.length > 0) {
      report.push('💡 修复建议:');
      results.recommendations.forEach((rec, i) => {
        report.push(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
        report.push(`   ${rec.description}`);
        rec.actions.forEach(action => {
          report.push(`   • ${action}`);
        });
        report.push('');
      });
    }
    
    return report.join('\n');
  }

  /**
   * 自动修复简单问题
   */
  async autoFix(results) {
    const fixes = [];
    
    // 移除未使用的导入
    if (results.codeAnalysis.unusedImports.length > 0) {
      for (const { file, import: unusedImport } of results.codeAnalysis.unusedImports.slice(0, 5)) {
        try {
          const filePath = path.join(process.cwd(), 'app/routes', file);
          let content = fs.readFileSync(filePath, 'utf8');
          
          // 简单的未使用导入移除
          const regex = new RegExp(`\\s*,?\\s*${unusedImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,?`, 'g');
          content = content.replace(regex, '');
          
          fs.writeFileSync(filePath, content);
          fixes.push(`移除了 ${file} 中未使用的导入: ${unusedImport}`);
        } catch (error) {
          console.error(`自动修复失败 (${file}):`, error.message);
        }
      }
    }
    
    return fixes;
  }
}

// 命令行接口
async function main() {
  const detective = new BugDetectiveAgent();
  
  try {
    const results = await detective.performFullDiagnosis();
    const report = detective.generateReport(results);
    
    console.log(report);
    
    // 询问是否执行自动修复
    if (process.argv.includes('--auto-fix')) {
      console.log('\n🛠️  执行自动修复...');
      const fixes = await detective.autoFix(results);
      if (fixes.length > 0) {
        console.log('✅ 自动修复完成:');
        fixes.forEach(fix => console.log(`  • ${fix}`));
      } else {
        console.log('ℹ️  没有可以自动修复的问题');
      }
    } else {
      console.log('\n💡 提示: 使用 --auto-fix 参数执行自动修复');
    }
    
    // 保存报告到文件
    const reportPath = path.join(process.cwd(), 'bug-detective-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`\n📄 诊断报告已保存到: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Bug Detective Agent 执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default BugDetectiveAgent;