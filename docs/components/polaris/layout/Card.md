# Card 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐⭐ (项目最高频组件)

## 正确导入方式

```javascript
import { Card } from '@shopify/polaris';
```

## 基础用法

### 标准容器卡片
```javascript
<Card>
  <BlockStack gap="300">
    <Text variant="headingMd">卡片标题</Text>
    <Text>卡片内容</Text>
  </BlockStack>
</Card>
```

### 带内边距的卡片
```javascript
<Card padding="400">
  {/* 内容 */}
</Card>
```

### 圆角变体
```javascript
<Card roundedAbove="sm">
  {/* 内容 */}
</Card>
```

## 项目特定模式

### Pattern 1: Card + BlockStack 组合（最常用）
```javascript
// 用于资源分类展示
<Card>
  <BlockStack gap="300">
    <InlineStack align="space-between">
      <Text variant="headingMd">产品资源</Text>
      <Badge tone="success">1,234</Badge>
    </InlineStack>
    <Text variant="bodySm" tone="subdued">
      包含所有产品标题、描述和SEO信息
    </Text>
    <Button variant="primary" size="slim">
      开始翻译
    </Button>
  </BlockStack>
</Card>
```

### Pattern 2: 统计卡片
```javascript
// 用于显示翻译统计
<Card>
  <BlockStack gap="200">
    <Text variant="headingSm">翻译进度</Text>
    <Text variant="heading2xl">85%</Text>
    <ProgressBar progress={85} tone="success" />
  </BlockStack>
</Card>
```

### Pattern 3: 操作面板卡片
```javascript
// 用于批量操作
<Card>
  <BlockStack gap="400">
    <Text variant="headingMd">批量操作</Text>
    <InlineStack gap="200">
      <Button variant="primary">扫描资源</Button>
      <Button variant="plain">清除数据</Button>
    </InlineStack>
  </BlockStack>
</Card>
```

## Props 参考

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| children | ReactNode | - | 卡片内容 |
| padding | SpaceScale | "400" | 内边距大小 |
| roundedAbove | "xs"/"sm"/"md"/"lg" | - | 圆角大小 |
| background | string | - | 背景色 |

## 注意事项

1. **避免使用LegacyCard**: 项目中应使用新版Card组件
2. **始终配合BlockStack**: 保持内容的垂直间距一致性
3. **padding默认值**: 如果不设置padding，Card有默认内边距

## 常见错误

❌ **错误**: 使用过时的sectioned属性
```javascript
// 错误
<LegacyCard sectioned>
```

✅ **正确**: 使用新版Card
```javascript
// 正确
<Card>
```

## 相关组件
- BlockStack: 垂直布局
- InlineStack: 水平布局
- Text: 文本展示
- Badge: 状态标签

## 验证命令
```bash
# 检查Card组件使用
grep -r "import.*Card.*from '@shopify/polaris'" app/
```