/**
 * Polaris 组件使用统计分析脚本
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 所有已知的 Polaris 组件列表
const polarisComponents = [
  'Page', 'Layout', 'Card', 'Button', 'Text', 'Badge', 'Banner',
  'BlockStack', 'InlineStack', 'Select', 'Checkbox', 'Modal',
  'DataTable', 'ProgressBar', 'TextField', 'Spinner', 'EmptyState',
  'Tabs', 'Grid', 'Divider', 'Icon', 'Tooltip', 'ButtonGroup',
  'Filters', 'Pagination', 'SkeletonBodyText', 'TextContainer',
  'Collapsible', 'TitleBar', 'Box', 'InlineGrid', 'ResourceList',
  'ResourceItem', 'Avatar', 'Thumbnail', 'List', 'Popover',
  'ActionList', 'ContextualSaveBar', 'Frame', 'Navigation',
  'Toast', 'Loading', 'SkeletonPage', 'SkeletonDisplayText',
  'Form', 'FormLayout', 'RangeSlider', 'RadioButton', 'ChoiceList',
  'DatePicker', 'DropZone', 'Tag', 'Link', 'FooterHelp',
  'InlineError', 'InlineCode', 'KeyboardKey', 'Label', 'Listbox',
  'OptionList', 'ScrollLock', 'Stack', 'Sticky', 'Subheading',
  'TextStyle', 'Truncate', 'UnstyledButton', 'UnstyledLink'
];

// 项目特定的组件配置模式
const projectPatterns = {
  'Layout.Section': 0,
  'Modal.Section': 0,
  'Card with BlockStack': 0,
  'InlineStack with Badge': 0,
  'Button with icon': 0,
  'Select with options': 0,
  'DataTable with rows': 0
};

// 初始化计数器
const componentUsageCount = {};
polarisComponents.forEach(comp => {
  componentUsageCount[comp] = 0;
});

// 组件属性使用统计
const propsUsageStats = {
  Button: {
    variant: {},
    tone: {},
    size: {},
    loading: 0,
    disabled: 0,
    onClick: 0,
    icon: 0
  },
  Badge: {
    tone: {},
    size: {}
  },
  Card: {
    sectioned: 0,
    title: 0,
    subdued: 0
  },
  Text: {
    variant: {},
    tone: {},
    fontWeight: {},
    alignment: {}
  },
  Select: {
    label: 0,
    options: 0,
    value: 0,
    onChange: 0
  },
  Modal: {
    open: 0,
    onClose: 0,
    title: 0,
    primaryAction: 0,
    large: 0
  }
};

// 扫描目录下的所有 jsx/tsx 文件
function scanDirectory(dir) {
  const files = [];
  
  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        walk(fullPath);
      } else if (stat.isFile() && (item.endsWith('.jsx') || item.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// 分析文件内容
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileStats = {
    path: filePath.replace(process.cwd(), ''),
    components: {},
    patterns: []
  };
  
  // 查找 import 语句
  const importMatch = content.match(/import\s*{([^}]+)}\s*from\s*['"]@shopify\/polaris['"]/);
  if (importMatch) {
    const imports = importMatch[1].split(',').map(s => s.trim());
    imports.forEach(comp => {
      if (componentUsageCount.hasOwnProperty(comp)) {
        componentUsageCount[comp]++;
        fileStats.components[comp] = 0;
      }
    });
  }
  
  // 统计组件在文件中的使用次数
  for (const comp of Object.keys(fileStats.components)) {
    // 匹配组件使用 <Component 或 <Component>
    const regex = new RegExp(`<${comp}(?:\\s|>|/)`, 'g');
    const matches = content.match(regex);
    if (matches) {
      fileStats.components[comp] = matches.length;
      
      // 分析特定组件的属性
      if (propsUsageStats[comp]) {
        analyzeComponentProps(content, comp);
      }
    }
  }
  
  // 识别特定模式
  if (content.includes('Layout.Section')) projectPatterns['Layout.Section']++;
  if (content.includes('Modal.Section')) projectPatterns['Modal.Section']++;
  if (/<Card[^>]*>[\s\S]*?<BlockStack/.test(content)) projectPatterns['Card with BlockStack']++;
  if (/<InlineStack[^>]*>[\s\S]*?<Badge/.test(content)) projectPatterns['InlineStack with Badge']++;
  if (/<Button[^>]*icon=/i.test(content)) projectPatterns['Button with icon']++;
  if (/<Select[^>]*options=/i.test(content)) projectPatterns['Select with options']++;
  if (/<DataTable[^>]*rows=/i.test(content)) projectPatterns['DataTable with rows']++;
  
  return fileStats;
}

// 分析组件属性使用
function analyzeComponentProps(content, component) {
  const stats = propsUsageStats[component];
  if (!stats) return;
  
  // 创建匹配组件及其属性的正则
  const componentRegex = new RegExp(`<${component}([^>]*)>`, 'g');
  let match;
  
  while ((match = componentRegex.exec(content)) !== null) {
    const propsString = match[1];
    
    // 分析各种属性
    for (const [prop, value] of Object.entries(stats)) {
      if (typeof value === 'object') {
        // 提取属性值
        const propRegex = new RegExp(`${prop}=["'{]([^"'}]+)["'}]`);
        const propMatch = propsString.match(propRegex);
        if (propMatch) {
          const propValue = propMatch[1];
          stats[prop][propValue] = (stats[prop][propValue] || 0) + 1;
        }
      } else {
        // 布尔属性或存在性检查
        if (propsString.includes(prop)) {
          stats[prop]++;
        }
      }
    }
  }
}

// 主分析函数
function analyze() {
  console.log('🔍 开始分析 Shopify Polaris 组件使用情况...\n');
  
  const appDir = path.join(process.cwd(), 'app');
  const files = scanDirectory(appDir);
  const fileAnalysis = [];
  
  console.log(`📁 找到 ${files.length} 个 JSX/TSX 文件\n`);
  
  // 分析每个文件
  files.forEach(file => {
    const analysis = analyzeFile(file);
    if (Object.keys(analysis.components).length > 0) {
      fileAnalysis.push(analysis);
    }
  });
  
  // 按使用频率排序
  const sortedComponents = Object.entries(componentUsageCount)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  
  // 输出结果
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                     组件使用频率统计表');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('排名  组件名称                 使用文件数    优先级');
  console.log('────────────────────────────────────────────────────');
  
  sortedComponents.forEach(([comp, count], index) => {
    const rank = (index + 1).toString().padStart(2, ' ');
    const name = comp.padEnd(23);
    const fileCount = count.toString().padStart(5);
    const priority = count >= 5 ? '⭐ 核心' : count >= 3 ? '🔹 常用' : '○ 辅助';
    console.log(`${rank}.  ${name} ${fileCount}      ${priority}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                     项目特定使用模式');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  for (const [pattern, count] of Object.entries(projectPatterns)) {
    if (count > 0) {
      console.log(`• ${pattern}: ${count} 次使用`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                   核心组件属性使用分析');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  // 输出属性使用统计
  for (const [comp, props] of Object.entries(propsUsageStats)) {
    const compStats = sortedComponents.find(([c]) => c === comp);
    if (!compStats || compStats[1] === 0) continue;
    
    console.log(`\n【${comp}】组件属性使用:`);
    for (const [prop, value] of Object.entries(props)) {
      if (typeof value === 'object' && Object.keys(value).length > 0) {
        const sorted = Object.entries(value).sort((a, b) => b[1] - a[1]);
        console.log(`  ${prop}: ${sorted.map(([v, c]) => `${v}(${c})`).join(', ')}`);
      } else if (typeof value === 'number' && value > 0) {
        console.log(`  ${prop}: 使用 ${value} 次`);
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                    核心组件清单（前10）');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  const top10 = sortedComponents.slice(0, 10);
  top10.forEach(([comp, count], index) => {
    console.log(`${index + 1}. ${comp} - 在 ${count} 个文件中使用`);
  });
  
  // 生成 JSON 报告
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: files.length,
      filesUsingPolaris: fileAnalysis.length,
      totalComponentTypes: sortedComponents.length
    },
    componentUsage: Object.fromEntries(sortedComponents),
    patterns: projectPatterns,
    propsAnalysis: propsUsageStats,
    top10Components: top10.map(([name, count]) => ({ name, count }))
  };
  
  fs.writeFileSync(
    path.join(process.cwd(), 'polaris-usage-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n✅ 分析完成！详细报告已保存到 polaris-usage-report.json');
}

// 执行分析
analyze();