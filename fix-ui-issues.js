#!/usr/bin/env node

/**
 * 一键修复UI交互问题
 * 自动检测和修复常见的按键和选择框问题
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

class UIFixerAgent {
  constructor() {
    this.fixes = [];
    this.errors = [];
  }

  async autoFix() {
    console.log('🛠️ 开始自动修复UI交互问题...\n');

    await this.fixEventHandlers();
    await this.fixSelectComponents();
    await this.fixButtonComponents();
    await this.fixImports();
    await this.optimizePerformance();

    this.generateReport();
  }

  async fixEventHandlers() {
    console.log('🔧 修复事件处理器...');
    
    const componentPath = 'app/routes/app._index.jsx';
    if (!fs.existsSync(componentPath)) {
      this.errors.push('主组件文件不存在');
      return;
    }

    let content = fs.readFileSync(componentPath, 'utf8');
    let modified = false;

    // 检查并修复Select组件的onChange
    const selectPattern = /<Select[\s\S]*?onChange=\{([^}]+)\}/g;
    let match;
    while ((match = selectPattern.exec(content)) !== null) {
      const handler = match[1];
      if (!handler.includes('useCallback') && !handler.includes('setSelected')) {
        console.log(`⚠️ 发现可能有问题的Select处理器: ${handler}`);
        // 这里可以添加自动修复逻辑
      }
    }

    // 检查useState和useCallback的正确使用
    if (!content.includes('useCallback') && content.includes('onChange=')) {
      console.log('💡 建议使用useCallback优化事件处理器');
      this.fixes.push('考虑使用useCallback包装事件处理函数以提升性能');
    }

    if (modified) {
      fs.writeFileSync(componentPath, content);
      this.fixes.push('修复了事件处理器问题');
    }
  }

  async fixSelectComponents() {
    console.log('🔧 检查Select组件配置...');
    
    const testFiles = [
      'app/routes/test.basic-ui.jsx',
      'app/routes/test.standalone.jsx'
    ];

    for (const filePath of testFiles) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // 检查Select组件是否有value和onChange
        const selectMatches = content.match(/<Select[\s\S]*?\/>/g) || [];
        
        for (const selectMatch of selectMatches) {
          if (!selectMatch.includes('value=')) {
            console.log(`⚠️ ${filePath}: Select缺少value属性`);
            this.fixes.push(`${filePath}: 添加value属性到Select组件`);
          }
          
          if (!selectMatch.includes('onChange=')) {
            console.log(`⚠️ ${filePath}: Select缺少onChange属性`);
            this.fixes.push(`${filePath}: 添加onChange属性到Select组件`);
          }
        }
      }
    }
  }

  async fixButtonComponents() {
    console.log('🔧 检查Button组件配置...');
    
    const componentPath = 'app/routes/app._index.jsx';
    if (fs.existsSync(componentPath)) {
      const content = fs.readFileSync(componentPath, 'utf8');
      
      // 检查Button组件是否有onClick
      const buttonMatches = content.match(/<Button[\s\S]*?>/g) || [];
      
      for (const buttonMatch of buttonMatches) {
        if (!buttonMatch.includes('onClick=') && !buttonMatch.includes('type="submit"')) {
          console.log('⚠️ 发现可能缺少onClick的Button');
          this.fixes.push('检查Button组件的onClick事件处理');
        }
      }
    }
  }

  async fixImports() {
    console.log('🔧 优化组件导入...');
    
    const componentPath = 'app/routes/app._index.jsx';
    if (fs.existsSync(componentPath)) {
      let content = fs.readFileSync(componentPath, 'utf8');
      let modified = false;

      // 确保导入了必要的React hooks
      if (content.includes('useState') && !content.includes('import { useState')) {
        if (content.includes('import { useEffect, useState')) {
          // 已经正确导入
        } else if (content.includes('import {') && content.includes('} from "react"')) {
          // 需要添加useState到现有导入
          content = content.replace(
            /import \{([^}]+)\} from "react"/,
            (match, imports) => {
              if (!imports.includes('useState')) {
                return `import { ${imports}, useState } from "react"`;
              }
              return match;
            }
          );
          modified = true;
        }
      }

      // 确保导入了useCallback
      if (content.includes('useCallback') && !content.includes('import { useCallback') && !content.includes(', useCallback')) {
        content = content.replace(
          /import \{([^}]+)\} from "react"/,
          (match, imports) => {
            if (!imports.includes('useCallback')) {
              return `import { ${imports}, useCallback } from "react"`;
            }
            return match;
          }
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(componentPath, content);
        this.fixes.push('优化了React hooks导入');
      }
    }
  }

  async optimizePerformance() {
    console.log('🔧 性能优化建议...');
    
    // 检查是否有性能问题的模式
    const componentPath = 'app/routes/app._index.jsx';
    if (fs.existsSync(componentPath)) {
      const content = fs.readFileSync(componentPath, 'utf8');
      
      // 检查是否在render中创建函数
      const inlineHandlerPattern = /onClick=\{[^}]*=>[^}]*\}/g;
      const inlineHandlers = content.match(inlineHandlerPattern) || [];
      
      if (inlineHandlers.length > 0) {
        console.log(`⚠️ 发现 ${inlineHandlers.length} 个内联事件处理器`);
        this.fixes.push('将内联事件处理器提取为useCallback函数以提升性能');
      }
      
      // 检查依赖数组
      const useCallbackPattern = /useCallback\([^,]+,\s*\[([^\]]*)\]/g;
      let callbackMatch;
      while ((callbackMatch = useCallbackPattern.exec(content)) !== null) {
        const deps = callbackMatch[1].trim();
        if (deps === '') {
          console.log('💡 发现空的useCallback依赖数组');
        }
      }
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
    });
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('🛠️ UI修复报告');
    console.log('='.repeat(50));
    
    if (this.fixes.length === 0 && this.errors.length === 0) {
      console.log('✅ 没有发现需要修复的问题');
      console.log('🎉 您的UI组件配置看起来很好！');
    } else {
      if (this.fixes.length > 0) {
        console.log('🔧 修复和建议:');
        this.fixes.forEach((fix, i) => {
          console.log(`${i + 1}. ${fix}`);
        });
        console.log('');
      }
      
      if (this.errors.length > 0) {
        console.log('❌ 遇到的错误:');
        this.errors.forEach((error, i) => {
          console.log(`${i + 1}. ${error}`);
        });
        console.log('');
      }
    }
    
    console.log('🧪 下一步测试建议:');
    console.log('1. 启动开发服务器: npm run dev');
    console.log('2. 访问测试页面: http://localhost:61423/test/interactive');
    console.log('3. 在浏览器控制台运行错误监控:');
    console.log('   fetch("/error-monitor.js").then(r=>r.text()).then(eval)');
    console.log('4. 运行组件测试: errorMonitor.testComponents()');
    
    console.log('\n🎯 如果问题依然存在:');
    console.log('• 检查浏览器控制台是否有JavaScript错误');
    console.log('• 尝试禁用浏览器扩展程序');
    console.log('• 使用无痕/隐身模式测试');
    console.log('• 清除浏览器缓存和Cookie');
    console.log('• 检查是否有其他应用占用相同端口');
  }
}

// 主函数
async function main() {
  const fixer = new UIFixerAgent();
  
  try {
    await fixer.autoFix();
  } catch (error) {
    console.error('❌ 自动修复过程中出错:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default UIFixerAgent;