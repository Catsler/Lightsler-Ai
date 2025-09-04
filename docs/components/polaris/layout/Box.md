# Box 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐ (布局微调组件, 8%使用率)

## 正确导入方式

```javascript
import { Box } from '@shopify/polaris';
```

## 基础用法

### 基本Box容器
```javascript
<Box>
  <Text>基本内容容器</Text>
</Box>
```

### 带内边距的Box
```javascript
<Box padding="400">
  <Text>有内边距的内容</Text>
</Box>
```

### 设置边框
```javascript
<Box borderColor="border" borderWidth="025">
  <Text>带边框的内容</Text>
</Box>
```

## 项目特定模式

### Pattern 1: 状态指示器容器（常用于翻译状态）
```javascript
// 用于显示翻译进度状态
<Box 
  padding="200" 
  background="bg-surface-success-subdued"
  borderRadius="200"
>
  <InlineStack gap="200" align="center">
    <Icon source={CheckCircleIcon} tone="success" />
    <Text variant="bodySm" tone="success">
      翻译完成
    </Text>
  </InlineStack>
</Box>
```

### Pattern 2: 间距调整容器
```javascript
// 用于精确控制组件间距
<BlockStack gap="400">
  <Text variant="headingMd">资源列表</Text>
  <Box paddingBlockStart="200" paddingBlockEnd="400">
    <Divider />
  </Box>
  <ResourceList>
    {/* 资源项 */}
  </ResourceList>
</BlockStack>
```

### Pattern 3: 错误信息容器
```javascript
// 用于显示错误提示
<Box 
  padding="300"
  background="bg-surface-critical-subdued"
  borderRadius="200"
  borderColor="border-critical"
  borderWidth="025"
>
  <InlineStack gap="200" align="start">
    <Icon source={AlertTriangleIcon} tone="critical" />
    <BlockStack gap="100">
      <Text variant="bodyMd" tone="critical">
        翻译失败
      </Text>
      <Text variant="bodySm" tone="subdued">
        API配额不足，请检查配置
      </Text>
    </BlockStack>
  </InlineStack>
</Box>
```

### Pattern 4: 统计数据卡片内容
```javascript
// 用于Card内部的数据展示区域
<Card>
  <Box padding="400">
    <BlockStack gap="300">
      <Text variant="headingSm">今日翻译统计</Text>
      <Box 
        paddingInline="300"
        paddingBlock="200"
        background="bg-surface-secondary"
        borderRadius="100"
      >
        <InlineStack align="space-between">
          <Text variant="bodySm">完成数量</Text>
          <Text variant="bodyMd" fontWeight="semibold">1,234</Text>
        </InlineStack>
      </Box>
    </BlockStack>
  </Box>
</Card>
```

### Pattern 5: 工具栏分隔容器
```javascript
// 用于分隔工具栏和内容区域
<Page title="翻译管理">
  <BlockStack gap="500">
    <Box 
      paddingBlockEnd="400"
      borderBlockEndColor="border"
      borderBlockEndWidth="025"
    >
      <InlineStack gap="200">
        <Button variant="primary">开始翻译</Button>
        <Button>暂停翻译</Button>
      </InlineStack>
    </Box>
    <TranslationTable />
  </BlockStack>
</Page>
```

## Props 参考

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| children | ReactNode | - | 容器内容 |
| padding | SpaceScale | - | 所有方向内边距 |
| paddingInline | SpaceScale | - | 水平内边距 |
| paddingBlock | SpaceScale | - | 垂直内边距 |
| paddingBlockStart | SpaceScale | - | 顶部内边距 |
| paddingBlockEnd | SpaceScale | - | 底部内边距 |
| paddingInlineStart | SpaceScale | - | 左侧内边距 |
| paddingInlineEnd | SpaceScale | - | 右侧内边距 |
| borderColor | BorderColorScale | - | 边框颜色 |
| borderWidth | BorderWidthScale | - | 边框宽度 |
| borderRadius | BorderRadiusScale | - | 圆角大小 |
| background | BackgroundColorScale | - | 背景颜色 |
| minHeight | string | - | 最小高度 |
| width | string | - | 宽度 |

## 最佳实践

1. **精确控制间距**: 使用Box进行精确的padding/margin调整
2. **背景色设计**: 配合Polaris色彩系统使用语义化背景色
3. **边框使用**: 遵循设计系统的边框规范
4. **响应式设计**: 配合InlineStack和BlockStack实现响应式布局

## 常见错误

❌ **错误**: 滥用Box包装所有内容
```javascript
// 错误 - 不必要的Box嵌套
<Box>
  <Box>
    <Box>
      <Text>内容</Text>
    </Box>
  </Box>
</Box>
```

✅ **正确**: 仅在需要样式调整时使用Box
```javascript
// 正确 - 有明确样式需求的Box
<Box padding="300" background="bg-surface-secondary">
  <Text>内容</Text>
</Box>
```

❌ **错误**: 使用自定义CSS代替Box属性
```javascript
// 错误
<div style={{padding: '16px', backgroundColor: '#f6f6f7'}}>
```

✅ **正确**: 使用Polaris设计tokens
```javascript
// 正确
<Box padding="400" background="bg-surface-secondary">
```

## 相关组件
- Card: 内容容器
- BlockStack: 垂直布局
- InlineStack: 水平布局
- Divider: 分隔线

## 验证命令
```bash
# 检查Box组件使用
grep -r "import.*Box.*from '@shopify/polaris'" app/

# 查找Box的样式属性使用
grep -r "padding.*=" app/ | grep -v node_modules
```