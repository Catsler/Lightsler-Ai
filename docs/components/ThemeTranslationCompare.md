# ThemeTranslationCompare 组件文档

**创建日期**: 2025-01-04  
**组件路径**: `app/components/ThemeTranslationCompare.jsx`  
**示例文件**: `app/components/ThemeTranslationCompare.example.jsx`

## 概述

专业的Theme翻译对比视图组件，提供直观的双栏对比界面，支持字段级别的翻译编辑和批量操作。

## 核心特性

### 🎯 双栏对比布局
- **左栏**: 原文内容（只读）
- **右栏**: 翻译内容（可编辑）
- **响应式设计**: 移动端友好的自适应布局

### 🛠️ 批量操作工具栏
- **全选/清除选择**: 快速选择所有或清除所有字段
- **选择未翻译**: 一键选择所有待翻译字段
- **批量AI翻译**: 对选中字段执行AI翻译
- **保存更改**: 保存所有编辑的翻译内容
- **导出功能**: 导出选中字段的翻译数据

### 📊 进度监控
- **翻译完成率**: 实时显示翻译完成百分比
- **进度条**: 可视化翻译进度，支持动画效果
- **统计信息**: 显示总字段数、已翻译数、已选择数

### 🔍 搜索和过滤
- **字段搜索**: 按字段路径或内容搜索
- **过滤器**: 只显示未翻译字段选项
- **实时更新**: 搜索和过滤结果实时响应

### 🌐 多语言支持
- **语言切换**: 动态切换目标语言
- **语言配置**: 支持自定义可用语言列表
- **状态保持**: 切换语言时保持编辑状态

## Props API

```typescript
interface ThemeTranslationCompareProps {
  // 数据源
  originalData?: object;              // 原文JSON数据
  translatedData?: object;            // 已翻译JSON数据
  
  // 语言配置
  targetLanguage?: string;            // 目标语言代码，默认'zh-CN'
  availableLanguages?: Language[];    // 可用语言列表
  
  // 状态控制  
  loading?: boolean;                  // 加载状态，默认false
  translationProgress?: number;       // 翻译进度(0-100)，默认0
  
  // 事件回调
  onSave?: (data: SaveData) => void;           // 保存翻译回调
  onTranslate?: (data: TranslateData) => void; // AI翻译回调
  onBulkAction?: (data: BulkActionData) => void; // 批量操作回调
}

interface Language {
  code: string;    // 语言代码，如'zh-CN'
  name: string;    // 显示名称，如'简体中文'
}

interface SaveData {
  language: string;                   // 目标语言
  translations: Record<string, any>;  // 翻译数据映射
}

interface TranslateData {
  language: string;                   // 目标语言
  fields: Record<string, any>;        // 待翻译字段映射
  selectedPaths: string[];            // 选中的字段路径
}

interface BulkActionData {
  action: 'translate' | 'export' | 'scan';  // 操作类型
  language: string;                          // 目标语言
  fields?: Record<string, any>;              // 字段数据
  data?: any;                               // 额外数据
  selectedPaths?: string[];                  // 选中路径
}
```

## 基础使用

```jsx
import ThemeTranslationCompare from '../components/ThemeTranslationCompare';

function ThemeTranslationPage() {
  const [originalData] = useState({
    header: { title: "Welcome" },
    footer: { copyright: "© 2025 Company" }
  });
  
  const [translatedData, setTranslatedData] = useState({
    "header.title": "欢迎"
  });

  const handleSave = ({ language, translations }) => {
    // 保存翻译到服务器
    setTranslatedData(prev => ({ ...prev, ...translations }));
  };

  const handleTranslate = async ({ language, fields, selectedPaths }) => {
    // 调用AI翻译API
    const results = await translateFields(fields, language);
    setTranslatedData(prev => ({ ...prev, ...results }));
  };

  return (
    <ThemeTranslationCompare
      originalData={originalData}
      translatedData={translatedData}
      targetLanguage="zh-CN"
      availableLanguages={[
        { code: 'zh-CN', name: '简体中文' },
        { code: 'ja', name: '日本語' }
      ]}
      onSave={handleSave}
      onTranslate={handleTranslate}
      onBulkAction={handleBulkAction}
    />
  );
}
```

## 高级用法

### 实时翻译进度

```jsx
function AdvancedThemeTranslation() {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleTranslate = async ({ language, fields, selectedPaths }) => {
    setLoading(true);
    setProgress(0);
    
    const total = selectedPaths.length;
    
    for (let i = 0; i < total; i++) {
      const path = selectedPaths[i];
      await translateSingleField(fields[path], language);
      setProgress(Math.round(((i + 1) / total) * 100));
    }
    
    setLoading(false);
  };

  return (
    <ThemeTranslationCompare
      loading={loading}
      translationProgress={progress}
      onTranslate={handleTranslate}
      // ... 其他props
    />
  );
}
```

### 自定义批量操作

```jsx
const handleBulkAction = ({ action, language, fields, data, selectedPaths }) => {
  switch (action) {
    case 'translate':
      return performBatchTranslation(fields, language, selectedPaths);
    
    case 'export':
      return exportTranslationData(data, language);
    
    case 'scan':
      return scanThemeResources();
    
    case 'import':
      return importTranslationData(data);
      
    default:
      console.warn('未知的批量操作:', action);
  }
};
```

## 数据格式

### 输入数据格式

组件自动将嵌套的JSON对象扁平化为点路径格式：

```javascript
// 原始数据
const originalData = {
  header: {
    title: "Welcome to Our Store",
    menu: {
      home: "Home",
      products: "Products"
    }
  }
};

// 自动扁平化为
{
  "header.title": "Welcome to Our Store",
  "header.menu.home": "Home", 
  "header.menu.products": "Products"
}
```

### 翻译数据格式

翻译数据使用相同的点路径格式：

```javascript
const translatedData = {
  "header.title": "欢迎来到我们的商店",
  "header.menu.home": "首页",
  "header.menu.products": "产品"
};
```

## 样式定制

组件使用Polaris设计系统，支持主题定制：

```css
/* 自定义样式示例 */
.theme-translation-compare {
  --p-color-bg-surface: #ffffff;
  --p-color-border-subdued: #e1e3e5;
  --p-space-400: 16px;
}

/* 进度条定制 */
.translation-progress {
  --p-color-bg-fill-success: #00a047;
  --p-color-bg-fill-primary: #006fbb;
}
```

## 性能优化

### 大数据集处理

```jsx
// 虚拟化长列表（建议1000+字段时使用）
import { FixedSizeList as List } from 'react-window';

const VirtualizedFieldList = ({ fields }) => (
  <List
    height={600}
    itemCount={fields.length}
    itemSize={120}
  >
    {({ index, style }) => (
      <div style={style}>
        <FieldCompareItem field={fields[index]} />
      </div>
    )}
  </List>
);
```

### 防抖搜索

```jsx
import { useDebouncedCallback } from 'use-debounce';

const debouncedSearch = useDebouncedCallback(
  (searchTerm) => {
    setSearchTerm(searchTerm);
  },
  300
);
```

## 最佳实践

### 1. 数据预处理
```jsx
// 预处理数据，移除不需要翻译的字段
const preprocessData = (data) => {
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    // 跳过URL、ID等不需要翻译的字段
    if (!key.includes('url') && !key.includes('id') && 
        typeof value === 'string' && value.trim()) {
      filtered[key] = value;
    }
  }
  return filtered;
};
```

### 2. 错误处理
```jsx
const handleTranslateWithErrorHandling = async (data) => {
  try {
    await handleTranslate(data);
  } catch (error) {
    console.error('翻译失败:', error);
    // 显示错误提示
    showToast('翻译失败，请重试');
  }
};
```

### 3. 本地存储
```jsx
// 自动保存编辑状态到本地存储
useEffect(() => {
  const saved = localStorage.getItem('theme-translation-draft');
  if (saved) {
    setEditedTranslations(JSON.parse(saved));
  }
}, []);

useEffect(() => {
  if (Object.keys(editedTranslations).length > 0) {
    localStorage.setItem('theme-translation-draft', 
      JSON.stringify(editedTranslations));
  }
}, [editedTranslations]);
```

## 故障排除

### 常见问题

1. **组件不显示内容**
   - 检查`originalData`是否为空对象
   - 确认数据格式是否正确

2. **翻译进度不更新**
   - 检查`translationProgress`是否在0-100范围内
   - 确认`loading`状态正确设置

3. **语言切换无效**
   - 检查`availableLanguages`数组格式
   - 确认`onTranslate`回调中语言参数处理

4. **批量操作无响应**
   - 检查`onBulkAction`回调是否正确实现
   - 确认选中状态管理逻辑

### 调试技巧

```jsx
// 开启调试模式
const debug = process.env.NODE_ENV === 'development';

if (debug) {
  console.log('原文数据:', originalData);
  console.log('翻译数据:', translatedData);
  console.log('处理后字段:', processedFields);
}
```

## 更新日志

- **v1.0.0** (2025-01-04): 初始版本
  - 双栏对比布局
  - 批量操作支持
  - 搜索和过滤功能
  - 多语言支持
  - 进度监控

## 相关组件

- `LanguageManager`: 语言管理组件
- `ThemeJsonTreeView`: Theme JSON树形视图
- `TranslationQueue`: 翻译队列组件

## 技术依赖

- React 18.2+
- Shopify Polaris 12.27+
- 现代浏览器支持ES2020+