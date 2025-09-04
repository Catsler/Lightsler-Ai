# InlineStack 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐⭐ (水平布局首选组件)

## 正确导入方式

```javascript
import { InlineStack } from '@shopify/polaris';
```

## 重要说明

⚠️ **InlineStack是Polaris v10+的新布局组件**，替代了旧的Stack组件：
- ~~Stack~~ (horizontal) → **InlineStack**
- ~~Inline~~ → **InlineStack**
- ~~LegacyStack~~ → BlockStack 或 **InlineStack**

## 基础用法

### 标准水平布局
```javascript
<InlineStack gap="200">
  <Button>按钮1</Button>
  <Button>按钮2</Button>
  <Button>按钮3</Button>
</InlineStack>
```

### 两端对齐（常用）
```javascript
<InlineStack align="space-between">
  <Text variant="headingMd">标题</Text>
  <Button variant="plain">操作</Button>
</InlineStack>
```

### 居中对齐
```javascript
<InlineStack align="center" gap="100">
  <Icon source={CheckIcon} />
  <Text>已完成</Text>
</InlineStack>
```

## 项目特定模式

### Pattern 1: 标题栏布局（最常用）
```javascript
// Card标题与操作按钮
<Card>
  <BlockStack gap="300">
    <InlineStack align="space-between">
      <Text variant="headingMd">产品翻译</Text>
      <Badge tone="success">1,234</Badge>
    </InlineStack>
    {/* 其他内容 */}
  </BlockStack>
</Card>
```

### Pattern 2: 按钮组布局
```javascript
// 操作按钮组
<InlineStack gap="200">
  <Button variant="primary" size="slim">
    保存
  </Button>
  <Button variant="secondary" size="slim">
    取消
  </Button>
  <Button variant="plain" size="slim">
    重置
  </Button>
</InlineStack>
```

### Pattern 3: 状态标签组
```javascript
// 多个Badge水平排列
<InlineStack gap="100">
  <Badge tone="success">已翻译</Badge>
  <Badge tone="attention">待同步</Badge>
  <Badge>中文</Badge>
  <Badge>英文</Badge>
</InlineStack>
```

### Pattern 4: 表单控件组合
```javascript
// 关联的表单控件
<InlineStack gap="200" blockAlign="center">
  <Select
    label="语言"
    labelHidden
    options={languages}
    value={selectedLang}
    onChange={setSelectedLang}
  />
  <Button variant="primary" size="slim">
    应用
  </Button>
  <Button variant="plain" size="slim">
    清除
  </Button>
</InlineStack>
```

### Pattern 5: 图标与文本组合
```javascript
// 带图标的状态提示
<InlineStack gap="100" blockAlign="center">
  <Icon source={CheckIcon} tone="success" />
  <Text variant="bodySm" tone="success">
    翻译完成
  </Text>
</InlineStack>

// 加载状态
<InlineStack gap="100" blockAlign="center">
  <Spinner size="small" />
  <Text variant="bodySm">正在处理...</Text>
</InlineStack>
```

## Props 参考

| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| gap | SpaceScale | "300" | 高频自定义 | 子元素间距 |
| align | "start"/"center"/"end"/"space-around"/"space-between"/"space-evenly" | "start" | **space-between最常用** | 主轴对齐 |
| blockAlign | "start"/"center"/"end"/"baseline"/"stretch" | "stretch" | center较常用 | 交叉轴对齐 |
| wrap | boolean | true | 偶尔false | 是否换行 |
| children | ReactNode | - | 必需 | 子元素 |

## 对齐模式使用统计

基于项目分析：
| align值 | 使用场景 | 使用率 |
|---------|---------|--------|
| **"space-between"** | 标题栏、两端对齐 | **45%** |
| "start" (默认) | 按钮组、标签组 | 35% |
| "center" | 居中内容 | 15% |
| "end" | 右对齐 | 5% |

## Gap间距规范

| Gap值 | 像素 | 使用场景 | 频率 |
|-------|------|----------|------|
| "100" | 4px | 紧密图标文本 | 25% |
| **"200"** | 8px | **按钮组标准间距** | **50%** |
| "300" | 12px | 宽松布局 | 20% |
| "400" | 16px | 独立区块 | 5% |

## 响应式考虑

```javascript
// 自动换行的响应式布局
<InlineStack gap="200" wrap>
  {tags.map(tag => (
    <Badge key={tag}>{tag}</Badge>
  ))}
</InlineStack>

// 不换行，溢出滚动
<div style={{ overflowX: 'auto' }}>
  <InlineStack gap="200" wrap={false}>
    {items.map(item => (
      <Card key={item.id}>{item.name}</Card>
    ))}
  </InlineStack>
</div>
```

## 与BlockStack的配合

最经典的组合模式：
```javascript
<BlockStack gap="300">
  {/* 顶部工具栏 */}
  <InlineStack align="space-between">
    <InlineStack gap="200">
      <TextField placeholder="搜索..." />
      <Button>搜索</Button>
    </InlineStack>
    <InlineStack gap="100">
      <Button variant="plain">导出</Button>
      <Button variant="primary">新建</Button>
    </InlineStack>
  </InlineStack>
  
  {/* 主体内容 */}
  <DataTable />
  
  {/* 底部分页 */}
  <InlineStack align="center">
    <Pagination />
  </InlineStack>
</BlockStack>
```

## 迁移指南

### 从Stack迁移
```javascript
// 旧版
<Stack spacing="tight">
  <Stack.Item><Button>按钮1</Button></Stack.Item>
  <Stack.Item><Button>按钮2</Button></Stack.Item>
</Stack>

// 新版
<InlineStack gap="200">
  <Button>按钮1</Button>
  <Button>按钮2</Button>
</InlineStack>
```

### 从Inline迁移
```javascript
// 旧版
<Inline gap="200">
  <Badge>标签1</Badge>
  <Badge>标签2</Badge>
</Inline>

// 新版
<InlineStack gap="200">
  <Badge>标签1</Badge>
  <Badge>标签2</Badge>
</InlineStack>
```

## 最佳实践

1. **明确的对齐意图**: space-between用于两端对齐，start用于左对齐组
2. **合适的间距**: 按钮组用gap="200"，紧密元素用gap="100"
3. **响应式设计**: 考虑移动端显示，适当使用wrap属性
4. **避免深层嵌套**: InlineStack内避免再嵌套InlineStack

## 常见错误

❌ **错误**: 使用旧版Stack组件
```javascript
<Stack distribution="equalSpacing">
```

✅ **正确**: 使用InlineStack
```javascript
<InlineStack align="space-evenly">
```

❌ **错误**: 手动添加间距样式
```javascript
<InlineStack>
  <Button style={{ marginRight: 8 }}>按钮1</Button>
  <Button>按钮2</Button>
</InlineStack>
```

✅ **正确**: 使用gap属性
```javascript
<InlineStack gap="200">
  <Button>按钮1</Button>
  <Button>按钮2</Button>
</InlineStack>
```

## 相关组件
- BlockStack: 垂直布局
- Columns: 多列网格布局
- Box: 布局微调
- Card: 常包含InlineStack

## 验证命令
```bash
# 检查InlineStack使用
grep -r "InlineStack" app/
# 查找需要迁移的旧版组件
grep -r "LegacyStack\|<Stack[^>]*>\|<Inline" app/
```