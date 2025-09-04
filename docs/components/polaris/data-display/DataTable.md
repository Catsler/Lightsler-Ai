# DataTable 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐ (数据表格组件, 6%使用率)

## 正确导入方式

```javascript
import { DataTable } from '@shopify/polaris';
```

## 基础用法

### 基本数据表格
```javascript
const rows = [
  ['产品A', '已翻译', '2024-01-01'],
  ['产品B', '待翻译', '2024-01-02'],
];

<DataTable
  columnContentTypes={['text', 'text', 'text']}
  headings={['资源名称', '状态', '更新时间']}
  rows={rows}
/>
```

### 带排序的表格
```javascript
const [sortedRows, setSortedRows] = useState(rows);

<DataTable
  columnContentTypes={['text', 'text', 'numeric']}
  headings={['名称', '状态', '进度']}
  rows={sortedRows}
  sortable={[true, true, true]}
  defaultSortDirection="ascending"
  initialSortColumnIndex={0}
  onSort={handleSort}
/>
```

### 可选择行的表格
```javascript
<DataTable
  columnContentTypes={['text', 'text', 'text']}
  headings={['资源', '类型', '状态']}
  rows={rows}
  selectable
  selectedRows={selectedRows}
  onSelectionChange={setSelectedRows}
/>
```

## 项目特定模式

### Pattern 1: 翻译资源列表（最常用）
```javascript
// 用于显示待翻译资源的状态表格
const resourceRows = resources.map(resource => [
  <InlineStack gap="200" align="start">
    <Thumbnail
      source={resource.image || ProductIcon}
      alt={resource.title}
      size="small"
    />
    <BlockStack gap="100">
      <Text variant="bodyMd" fontWeight="semibold">
        {resource.title}
      </Text>
      <Text variant="bodySm" tone="subdued">
        ID: {resource.resourceId}
      </Text>
    </BlockStack>
  </InlineStack>,
  <Badge tone={getResourceTypeTone(resource.resourceType)}>
    {getResourceTypeLabel(resource.resourceType)}
  </Badge>,
  <Badge tone={getStatusTone(resource.status)}>
    {getStatusLabel(resource.status)}
  </Badge>,
  <Text>{resource.targetLanguages.join(', ')}</Text>,
  <Text variant="bodySm">{formatDate(resource.updatedAt)}</Text>,
  <InlineStack gap="100">
    <Button size="micro" onClick={() => handleTranslate(resource.id)}>
      翻译
    </Button>
    <Button size="micro" variant="plain" onClick={() => handlePreview(resource.id)}>
      预览
    </Button>
  </InlineStack>
]);

<Card>
  <DataTable
    columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
    headings={['资源', '类型', '状态', '目标语言', '更新时间', '操作']}
    rows={resourceRows}
    selectable
    selectedRows={selectedRows}
    onSelectionChange={setSelectedRows}
    sortable={[true, true, true, false, true, false]}
    onSort={handleResourceSort}
  />
</Card>
```

### Pattern 2: 翻译进度统计表
```javascript
// 用于显示各语言翻译进度统计
const progressRows = languages.map(language => [
  <InlineStack gap="200" align="center">
    <Text>{getFlagEmoji(language.code)}</Text>
    <Text variant="bodyMd" fontWeight="semibold">
      {language.name}
    </Text>
  </InlineStack>,
  <Text variant="bodyMd">{language.totalResources}</Text>,
  <Text variant="bodyMd" tone="success">{language.completedResources}</Text>,
  <Text variant="bodyMd" tone="warning">{language.pendingResources}</Text>,
  <Text variant="bodyMd" tone="critical">{language.failedResources}</Text>,
  <Box width="120px">
    <ProgressBar 
      progress={language.completedResources / language.totalResources * 100}
      tone="success"
      size="small"
    />
  </Box>,
  <Text variant="bodySm">
    {Math.round(language.completedResources / language.totalResources * 100)}%
  </Text>
]);

<Card>
  <BlockStack gap="300">
    <Text variant="headingMd">翻译进度统计</Text>
    <DataTable
      columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'text', 'numeric']}
      headings={['语言', '总计', '已完成', '进行中', '失败', '进度', '完成率']}
      rows={progressRows}
      totals={['总计', totalResources, totalCompleted, totalPending, totalFailed, '', `${Math.round(totalCompleted/totalResources*100)}%`]}
      sortable={[true, true, true, true, true, false, true]}
      onSort={handleProgressSort}
    />
  </BlockStack>
</Card>
```

### Pattern 3: 错误日志表格
```javascript
// 用于显示翻译错误日志
const errorRows = errors.map(error => [
  <Text variant="bodySm" fontFamily="mono">
    {error.id}
  </Text>,
  <Badge tone="critical">
    {error.level}
  </Badge>,
  <Box maxWidth="300px">
    <Text truncate>{error.message}</Text>
  </Box>,
  <Text variant="bodySm">{error.resourceType}</Text>,
  <Text variant="bodySm">{error.resourceId}</Text>,
  <Text variant="bodySm">{formatDateTime(error.createdAt)}</Text>,
  <InlineStack gap="100">
    <Button size="micro" onClick={() => showErrorDetails(error)}>
      详情
    </Button>
    <Button size="micro" variant="plain" onClick={() => handleRetry(error.id)}>
      重试
    </Button>
  </InlineStack>
]);

<Card>
  <BlockStack gap="300">
    <InlineStack align="space-between">
      <Text variant="headingMd">错误日志</Text>
      <InlineStack gap="200">
        <Select
          options={[
            {label: '全部', value: 'all'},
            {label: '错误', value: 'error'},
            {label: '警告', value: 'warning'},
          ]}
          value={errorFilter}
          onChange={setErrorFilter}
        />
        <Button onClick={handleClearErrors} tone="critical">
          清除日志
        </Button>
      </InlineStack>
    </InlineStack>
    <DataTable
      columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
      headings={['错误ID', '级别', '消息', '资源类型', '资源ID', '时间', '操作']}
      rows={errorRows}
      sortable={[false, true, false, true, false, true, false]}
      onSort={handleErrorSort}
    />
  </BlockStack>
</Card>
```

### Pattern 4: 翻译历史记录
```javascript
// 用于显示翻译操作历史
const historyRows = translationHistory.map(record => [
  <InlineStack gap="200" align="start">
    <Avatar 
      customer={false} 
      name={record.operator} 
      size="extraSmall" 
    />
    <Text variant="bodyMd">{record.operator}</Text>
  </InlineStack>,
  <Text variant="bodySm">{record.action}</Text>,
  <Text variant="bodySm">{record.resourceCount} 个资源</Text>,
  <InlineStack gap="100">
    {record.languages.map(lang => (
      <Badge key={lang} size="small">{lang}</Badge>
    ))}
  </InlineStack>,
  <Badge tone={record.status === 'success' ? 'success' : 'critical'}>
    {record.status === 'success' ? '成功' : '失败'}
  </Badge>,
  <Text variant="bodySm">{formatDateTime(record.timestamp)}</Text>,
  record.canRevert && (
    <Button size="micro" tone="critical" onClick={() => handleRevert(record.id)}>
      撤销
    </Button>
  )
]);

<Card>
  <BlockStack gap="300">
    <InlineStack align="space-between">
      <Text variant="headingMd">翻译历史</Text>
      <TextField
        placeholder="搜索操作记录..."
        value={historySearch}
        onChange={setHistorySearch}
        clearButton
        onClearButtonClick={() => setHistorySearch('')}
      />
    </InlineStack>
    <DataTable
      columnContentTypes={['text', 'text', 'numeric', 'text', 'text', 'text', 'text']}
      headings={['操作员', '操作', '资源数', '语言', '状态', '时间', '操作']}
      rows={historyRows}
      sortable={[true, true, true, false, true, true, false]}
      onSort={handleHistorySort}
    />
  </BlockStack>
</Card>
```

### Pattern 5: API使用统计表
```javascript
// 用于显示API调用统计和成本分析
const apiStatsRows = apiStats.map(stat => [
  <Text variant="bodyMd">{formatDate(stat.date)}</Text>,
  <Text variant="bodyMd">{stat.totalRequests.toLocaleString()}</Text>,
  <Text variant="bodyMd" tone="success">{stat.successfulRequests.toLocaleString()}</Text>,
  <Text variant="bodyMd" tone="critical">{stat.failedRequests.toLocaleString()}</Text>,
  <Text variant="bodyMd">{stat.charactersTranslated.toLocaleString()}</Text>,
  <Text variant="bodyMd">${stat.estimatedCost.toFixed(2)}</Text>,
  <Text variant="bodySm">{stat.avgResponseTime}ms</Text>
]);

<Card>
  <BlockStack gap="300">
    <InlineStack align="space-between">
      <Text variant="headingMd">API使用统计</Text>
      <InlineStack gap="200">
        <Select
          options={[
            {label: '最近7天', value: '7'},
            {label: '最近30天', value: '30'},
            {label: '最近90天', value: '90'},
          ]}
          value={statsPeriod}
          onChange={setStatsPeriod}
        />
        <Button onClick={handleExportStats}>
          导出数据
        </Button>
      </InlineStack>
    </InlineStack>
    <DataTable
      columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
      headings={['日期', '总请求数', '成功', '失败', '翻译字符数', '预估成本', '平均响应时间']}
      rows={apiStatsRows}
      totals={[
        '总计',
        totalRequests.toLocaleString(),
        totalSuccess.toLocaleString(),
        totalFailed.toLocaleString(),
        totalCharacters.toLocaleString(),
        `$${totalCost.toFixed(2)}`,
        `${avgResponseTime}ms`
      ]}
      sortable={[true, true, true, true, true, true, true]}
      onSort={handleStatsSort}
    />
  </BlockStack>
</Card>
```

## Props 参考

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| columnContentTypes | string[] | - | 列内容类型数组 |
| headings | ReactNode[] | - | 表头标题数组 |
| rows | ReactNode[][] | - | 表格数据行数组 |
| totals | ReactNode[] | - | 合计行数据 |
| sortable | boolean[] | - | 各列是否可排序 |
| defaultSortDirection | "ascending" \| "descending" | - | 默认排序方向 |
| initialSortColumnIndex | number | - | 初始排序列索引 |
| onSort | (index: number, direction: string) => void | - | 排序回调 |
| selectable | boolean | false | 是否显示选择框 |
| selectedRows | number[] | - | 已选中行索引 |
| onSelectionChange | (selectedRows: number[]) => void | - | 选择变化回调 |
| hoverable | boolean | true | 鼠标悬停效果 |
| verticalAlign | "top" \| "middle" \| "bottom" | "top" | 垂直对齐方式 |

### columnContentTypes 选项
- `"text"`: 文本内容
- `"numeric"`: 数字内容（右对齐）
- `"email"`: 邮箱地址
- `"phone"`: 电话号码
- `"date"`: 日期
- `"time"`: 时间

## 最佳实践

1. **合适的列类型**: 根据数据类型选择正确的columnContentTypes
2. **响应式设计**: 考虑在小屏幕上的表格显示效果
3. **数据分页**: 大数据集使用分页避免性能问题
4. **加载状态**: 显示数据加载状态
5. **错误处理**: 妥善处理数据加载失败的情况
6. **无障碍性**: 确保表格对屏幕阅读器友好

## 常见错误

❌ **错误**: columnContentTypes与数据列数不匹配
```javascript
// 错误 - 3列数据但只有2个类型定义
<DataTable
  columnContentTypes={['text', 'numeric']}
  headings={['名称', '数量', '状态']}
  rows={[['产品A', 100, '可用']]}
/>
```

✅ **正确**: 确保类型定义与列数匹配
```javascript
// 正确
<DataTable
  columnContentTypes={['text', 'numeric', 'text']}
  headings={['名称', '数量', '状态']}
  rows={[['产品A', 100, '可用']]}
/>
```

❌ **错误**: 在表格单元格中使用复杂交互组件
```javascript
// 错误 - 可能影响表格性能
rows={[
  [
    '产品A',
    <Select options={manyOptions} />, // 避免在单元格中使用复杂组件
    '状态'
  ]
]}
```

✅ **正确**: 使用简单的显示组件或按钮触发模态窗口
```javascript
// 正确
rows={[
  [
    '产品A',
    <Button size="micro" onClick={() => showOptionsModal()}>
      选择选项
    </Button>,
    '状态'
  ]
]}
```

❌ **错误**: 不处理空数据状态
```javascript
// 错误 - 没有数据时显示空表格
<DataTable
  columnContentTypes={['text', 'text']}
  headings={['名称', '状态']}
  rows={[]} // 空数组
/>
```

✅ **正确**: 显示友好的空状态
```javascript
// 正确
{rows.length > 0 ? (
  <DataTable
    columnContentTypes={['text', 'text']}
    headings={['名称', '状态']}
    rows={rows}
  />
) : (
  <EmptyState
    heading="暂无数据"
    action={{content: '刷新', onAction: handleRefresh}}
  />
)}
```

## 相关组件
- Card: 表格容器
- EmptyState: 空状态显示
- Pagination: 分页组件
- Filters: 筛选器
- ResourceList: 资源列表替代方案

## 验证命令
```bash
# 检查DataTable组件使用
grep -r "import.*DataTable.*from '@shopify/polaris'" app/

# 查找DataTable的列类型定义
grep -r "columnContentTypes" app/

# 检查表格排序功能使用
grep -r "onSort" app/ | grep -v node_modules
```