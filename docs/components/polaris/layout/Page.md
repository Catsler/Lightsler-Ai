# Page 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐⭐ (页面容器必需组件)

## 正确导入方式

```javascript
import { Page } from '@shopify/polaris';
```

## 重要说明

⚠️ **Page是嵌入式应用的顶层组件**：
- 每个路由应该有且只有一个Page组件
- Page提供标准的Shopify Admin界面结构
- 在Polaris v12中支持更灵活的操作按钮配置

## 基础用法

### 基本页面
```javascript
<Page title="页面标题">
  {/* 页面内容 */}
</Page>
```

### 带返回按钮的页面
```javascript
<Page
  backAction={{
    content: '产品',
    url: '/app/products'
  }}
  title="编辑产品"
>
  {/* 内容 */}
</Page>
```

### 带操作按钮的页面
```javascript
<Page
  title="资源管理"
  primaryAction={{
    content: '扫描资源',
    onAction: handleScan
  }}
  secondaryActions={[
    {
      content: '导出',
      onAction: handleExport
    },
    {
      content: '设置',
      url: '/app/settings'
    }
  ]}
>
  {/* 内容 */}
</Page>
```

## 项目特定模式

### Pattern 1: 主列表页面（最常用）
```javascript
// app.jsx 主页面
<Page
  title="多语言翻译管理"
  primaryAction={{
    content: '扫描资源',
    onAction: handleScanResources,
    loading: isScanning,
    disabled: isTranslating
  }}
  secondaryActions={[
    {
      content: '批量翻译',
      onAction: handleBulkTranslate,
      disabled: selectedResources.length === 0
    },
    {
      content: '同步到Shopify',
      onAction: handleSync
    }
  ]}
>
  <Layout>
    <Layout.Section>
      {/* 统计卡片 */}
    </Layout.Section>
    <Layout.Section>
      {/* 资源列表 */}
    </Layout.Section>
  </Layout>
</Page>
```

### Pattern 2: 详情页面
```javascript
// 带返回导航的详情页
<Page
  backAction={{
    content: '返回列表',
    url: '/app'
  }}
  title={`翻译详情: ${resource.title}`}
  titleMetadata={<Badge tone="success">已完成</Badge>}
  secondaryActions={[
    {
      content: '重新翻译',
      onAction: handleRetranslate
    },
    {
      content: '查看原文',
      onAction: () => setShowOriginal(!showOriginal)
    }
  ]}
>
  <Layout>
    {/* 详情内容 */}
  </Layout>
</Page>
```

### Pattern 3: 错误管理页面
```javascript
// app/errors页面
<Page
  title="错误日志"
  titleMetadata={
    errorCount > 0 && <Badge tone="critical">{errorCount}</Badge>
  }
  primaryAction={{
    content: '清除已解决',
    onAction: handleClearResolved,
    destructive: true
  }}
  secondaryActions={[
    {
      content: '导出日志',
      onAction: handleExport
    },
    {
      content: '刷新',
      onAction: () => window.location.reload(),
      icon: RefreshIcon
    }
  ]}
>
  {/* 错误列表 */}
</Page>
```

### Pattern 4: 设置页面
```javascript
// 设置页面
<Page
  title="翻译设置"
  breadcrumbs={[{content: '返回', url: '/app'}]}
  primaryAction={{
    content: '保存',
    onAction: handleSave,
    loading: isSaving,
    disabled: !hasChanges
  }}
  secondaryActions={[
    {
      content: '恢复默认',
      onAction: handleReset,
      destructive: true
    }
  ]}
>
  <Layout>
    <Layout.Section>
      <Card>
        {/* 设置表单 */}
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### Pattern 5: 监控仪表板
```javascript
// 实时监控页面
<Page
  title="实时监控仪表板"
  titleMetadata={getHealthBadge(systemHealth.status)}
  secondaryActions={[
    {
      content: autoRefresh ? '停止刷新' : '开始刷新',
      onAction: () => setAutoRefresh(!autoRefresh),
      icon: RefreshIcon
    }
  ]}
  fullWidth
>
  <Layout>
    {/* 仪表板内容 */}
  </Layout>
</Page>
```

## Props 参考

| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| title | string | - | 必需 | 页面标题 |
| children | ReactNode | - | 必需 | 页面内容 |
| primaryAction | ActionProps | - | 常用 | 主要操作按钮 |
| secondaryActions | ActionProps[] | - | 常用 | 次要操作按钮 |
| backAction | BackAction | - | 详情页常用 | 返回按钮 |
| breadcrumbs | Breadcrumb[] | - | 偶尔 | 面包屑导航 |
| titleMetadata | ReactNode | - | 偶尔 | 标题旁的元数据 |
| subtitle | string | - | 罕见 | 副标题 |
| fullWidth | boolean | false | 监控页用 | 全宽布局 |

## ActionProps 详解

```javascript
interface ActionProps {
  content: string;           // 按钮文字
  onAction?: () => void;    // 点击回调
  url?: string;             // 或跳转链接
  disabled?: boolean;       // 是否禁用
  loading?: boolean;        // 加载状态
  destructive?: boolean;    // 危险操作样式
  icon?: IconSource;        // 按钮图标
  accessibilityLabel?: string; // 无障碍标签
}
```

## 项目使用模式分析

基于代码分析：
- **页面类型分布**: 列表页(40%)、详情页(25%)、设置页(20%)、其他(15%)
- **primaryAction使用**: 60%的页面有主要操作
- **secondaryActions使用**: 50%的页面有次要操作
- **backAction使用**: 25%（主要在详情页）
- **titleMetadata使用**: 15%（显示状态Badge）

## 与Layout的配合

Page几乎总是与Layout组件配合使用：

```javascript
<Page title="标题">
  <Layout>
    <Layout.Section>
      <Card>主要内容</Card>
    </Layout.Section>
    
    <Layout.Section secondary>
      <Card>侧边栏内容</Card>
    </Layout.Section>
  </Layout>
</Page>
```

## 动态标题和操作

```javascript
function DynamicPage() {
  const { resources, selectedCount } = useLoaderData();
  
  return (
    <Page
      title={`资源管理 (${resources.length})`}
      titleMetadata={
        selectedCount > 0 && 
        <Badge>{selectedCount} 已选择</Badge>
      }
      primaryAction={{
        content: selectedCount > 0 
          ? `翻译 ${selectedCount} 个资源` 
          : '扫描资源',
        onAction: selectedCount > 0 
          ? handleTranslate 
          : handleScan,
        disabled: isProcessing
      }}
      secondaryActions={
        selectedCount > 0 
          ? [{
              content: '取消选择',
              onAction: clearSelection
            }]
          : [{
              content: '设置',
              url: '/app/settings'
            }]
      }
    >
      {/* 内容 */}
    </Page>
  );
}
```

## 最佳实践

1. **页面标题规范**:
   - 简洁明了，避免过长
   - 动态数量用括号表示：`产品 (123)`
   - 状态用titleMetadata展示

2. **操作按钮设计**:
   - primaryAction: 页面最重要的操作
   - secondaryActions: 不超过3个
   - 危险操作使用destructive属性

3. **加载状态处理**:
   ```javascript
   primaryAction={{
     content: isLoading ? '处理中...' : '开始',
     loading: isLoading,
     disabled: isLoading || !hasData
   }}
   ```

4. **响应式考虑**:
   - 移动端自动将secondaryActions收起到菜单
   - 避免过长的按钮文字

## 常见错误

❌ **错误**: 嵌套多个Page组件
```javascript
<Page title="外层">
  <Page title="内层">  // 错误！
    内容
  </Page>
</Page>
```

✅ **正确**: 每个路由只有一个Page
```javascript
<Page title="页面标题">
  <Layout>
    <Layout.Section>
      <Card>内容区块</Card>
    </Layout.Section>
  </Layout>
</Page>
```

❌ **错误**: primaryAction返回值处理不当
```javascript
primaryAction={{
  content: '保存',
  onAction: async () => {
    await saveData();  // Page不会等待Promise
  }
}}
```

✅ **正确**: 使用loading状态
```javascript
const [isSaving, setIsSaving] = useState(false);

primaryAction={{
  content: '保存',
  loading: isSaving,
  onAction: async () => {
    setIsSaving(true);
    await saveData();
    setIsSaving(false);
  }
}}
```

## 相关组件
- Layout: 页面内容布局
- Card: 内容容器
- Badge: 标题元数据
- Button: 操作按钮（Page内部使用）

## 验证命令
```bash
# 检查Page使用
grep -r "<Page" app/
# 确保每个路由文件只有一个Page
grep -c "<Page" app/routes/*.jsx
```