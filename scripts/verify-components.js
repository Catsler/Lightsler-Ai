#!/usr/bin/env node

/**
 * 组件使用验证脚本
 * 验证项目中的组件使用是否符合本地文档规范
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI颜色代码
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// 本地文档映射
const LOCAL_DOCS = {
  'Card': 'docs/components/polaris/layout/Card.md',
  'Button': 'docs/components/polaris/forms/Button.md',
  'Text': 'docs/components/polaris/data-display/Text.md',
  'Badge': 'docs/components/polaris/feedback/Badge.md',
  'BlockStack': 'docs/components/polaris/layout/BlockStack.md',
  'InlineStack': 'docs/components/polaris/layout/InlineStack.md',
  'Page': 'docs/components/polaris/layout/Page.md',
  'Select': 'docs/components/polaris/forms/Select.md',
  'Layout': 'docs/components/polaris/layout/Layout.md',
  'Banner': 'docs/components/polaris/feedback/Banner.md',
  'ProgressBar': 'docs/components/polaris/feedback/ProgressBar.md'
};

// 已废弃的组件映射
const DEPRECATED_COMPONENTS = {
  'LegacyCard': 'Card',
  'LegacyStack': 'BlockStack 或 InlineStack',
  'DisplayText': 'Text',
  'Heading': 'Text',
  'Subheading': 'Text',
  'Caption': 'Text',
  'TextStyle': 'Text',
  'Stack': 'BlockStack 或 InlineStack'
};

// 检查结果统计
let stats = {
  totalFiles: 0,
  totalComponents: 0,
  documented: 0,
  undocumented: 0,
  deprecated: 0,
  errors: []
};

/**
 * 扫描项目文件中的Polaris组件使用
 */
function scanComponentUsage() {
  console.log(`${colors.blue}🔍 扫描组件使用情况...${colors.reset}\n`);
  
  try {
    // 查找所有使用Polaris的文件
    const files = execSync(
      "grep -r \"from '@shopify/polaris'\" app/ --include='*.jsx' --include='*.js' --include='*.tsx' --include='*.ts' -l",
      { encoding: 'utf-8' }
    ).trim().split('\n').filter(Boolean);
    
    stats.totalFiles = files.length;
    console.log(`找到 ${files.length} 个使用Polaris的文件\n`);
    
    files.forEach(file => {
      analyzeFile(file);
    });
    
  } catch (error) {
    console.error(`${colors.red}扫描失败:${colors.reset}`, error.message);
  }
}

/**
 * 分析单个文件的组件使用
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // 提取import语句中的组件
  const importRegex = /import\s*{([^}]+)}\s*from\s*['"]@shopify\/polaris['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    const components = match[1]
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
    
    components.forEach(component => {
      stats.totalComponents++;
      checkComponent(component, filePath);
    });
  }
}

/**
 * 检查单个组件
 */
function checkComponent(component, filePath) {
  // 检查是否是废弃组件
  if (DEPRECATED_COMPONENTS[component]) {
    stats.deprecated++;
    stats.errors.push({
      type: 'deprecated',
      component,
      file: filePath,
      suggestion: DEPRECATED_COMPONENTS[component]
    });
    return;
  }
  
  // 检查是否有本地文档
  if (LOCAL_DOCS[component]) {
    const docPath = path.join(process.cwd(), LOCAL_DOCS[component]);
    if (fs.existsSync(docPath)) {
      stats.documented++;
      // 检查文档更新时间
      checkDocumentAge(component, docPath);
    } else {
      stats.undocumented++;
      stats.errors.push({
        type: 'undocumented',
        component,
        file: filePath,
        docPath: LOCAL_DOCS[component]
      });
    }
  } else {
    // 不在核心组件列表中
    stats.undocumented++;
  }
}

/**
 * 检查文档年龄
 */
function checkDocumentAge(component, docPath) {
  const content = fs.readFileSync(docPath, 'utf-8');
  const dateMatch = content.match(/\*\*最后验证\*\*:\s*(\d{4}-\d{2}-\d{2})/);
  
  if (dateMatch) {
    const lastVerified = new Date(dateMatch[1]);
    const daysSince = Math.floor((new Date() - lastVerified) / (1000 * 60 * 60 * 24));
    
    // 只有当文档确实过时（正天数且大于30天）时才报告
    if (daysSince > 30 && daysSince > 0) {
      stats.errors.push({
        type: 'outdated',
        component,
        daysSince,
        docPath
      });
    }
  }
}

/**
 * 生成报告
 */
function generateReport() {
  console.log(`\n${colors.blue}📊 验证报告${colors.reset}`);
  console.log('═'.repeat(50));
  
  // 统计概览
  console.log(`\n📈 统计概览:`);
  console.log(`  文件数量: ${stats.totalFiles}`);
  console.log(`  组件使用: ${stats.totalComponents} 次`);
  console.log(`  ${colors.green}✅ 已文档化: ${stats.documented}${colors.reset}`);
  console.log(`  ${colors.yellow}⚠️  未文档化: ${stats.undocumented}${colors.reset}`);
  console.log(`  ${colors.red}❌ 已废弃: ${stats.deprecated}${colors.reset}`);
  
  // 问题详情
  if (stats.errors.length > 0) {
    console.log(`\n${colors.red}❗ 发现的问题:${colors.reset}\n`);
    
    // 按类型分组
    const deprecated = stats.errors.filter(e => e.type === 'deprecated');
    const undocumented = stats.errors.filter(e => e.type === 'undocumented');
    const outdated = stats.errors.filter(e => e.type === 'outdated');
    
    if (deprecated.length > 0) {
      console.log(`${colors.red}废弃组件 (需要立即修复):${colors.reset}`);
      deprecated.forEach(err => {
        console.log(`  - ${err.component} → 应使用 ${err.suggestion}`);
        console.log(`    文件: ${err.file}`);
      });
      console.log();
    }
    
    if (undocumented.length > 0) {
      console.log(`${colors.yellow}缺少文档:${colors.reset}`);
      const uniqueComponents = [...new Set(undocumented.map(e => e.component))];
      uniqueComponents.forEach(comp => {
        const count = undocumented.filter(e => e.component === comp).length;
        console.log(`  - ${comp} (使用 ${count} 次)`);
      });
      console.log();
    }
    
    if (outdated.length > 0) {
      console.log(`${colors.yellow}文档需要更新:${colors.reset}`);
      outdated.forEach(err => {
        console.log(`  - ${err.component} (${err.daysSince} 天未更新)`);
      });
    }
  }
  
  // 建议
  console.log(`\n💡 建议:`);
  if (stats.deprecated > 0) {
    console.log(`  1. 优先替换废弃组件，避免升级问题`);
  }
  if (stats.undocumented > 0) {
    console.log(`  2. 为高频使用的组件创建本地文档`);
  }
  console.log(`  3. 定期运行此脚本确保组件使用规范`);
  
  // 总体评分
  const score = Math.round((stats.documented / stats.totalComponents) * 100);
  let grade = '🏆';
  if (score < 60) grade = '❌';
  else if (score < 80) grade = '⚠️';
  else if (score < 95) grade = '✅';
  
  console.log(`\n${colors.blue}总体评分: ${grade} ${score}%${colors.reset}\n`);
  
  // 返回状态码
  if (stats.deprecated > 0) {
    process.exit(1); // 有废弃组件，返回错误
  }
  if (score < 60) {
    process.exit(1); // 文档化率过低
  }
}

/**
 * 主函数
 */
function main() {
  console.log(`${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║     Shopify组件使用验证工具 v1.0      ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);
  
  scanComponentUsage();
  generateReport();
}

// 运行
main();