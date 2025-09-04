# Text 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐⭐ (统一文本展示组件)

## 正确导入方式

```javascript
import { Text } from '@shopify/polaris';
```

## 重要说明

⚠️ **Text是Polaris v11+的统一文本组件**，替代了以下旧组件：
- ~~DisplayText~~ → Text
- ~~Heading~~ → Text
- ~~Subheading~~ → Text  
- ~~Caption~~ → Text
- ~~TextStyle~~ → Text
- ~~VisuallyHidden~~ → Text

## 基础用法

### 标题文本
```javascript
// 主标题
<Text variant="heading2xl" as="h1">页面标题</Text>

// 中等标题
<Text variant="headingMd" as="h2">区块标题</Text>

// 小标题
<Text variant="headingSm" as="h3">子标题</Text>
```

### 正文文本
```javascript
// 标准正文
<Text variant="bodyMd">这是正文内容</Text>

// 小号正文
<Text variant="bodySm">辅助说明文字</Text>

// 大号正文
<Text variant="bodyLg">重点内容</Text>
```

## 项目特定模式

### Pattern 1: 卡片标题和描述（最常用）
```javascript
// 资源卡片的标准文本组合
<Card>
  <BlockStack gap="200">
    <Text variant="headingMd" as="h2">
      产品翻译
    </Text>
    <Text variant="bodySm" tone="subdued">
      已翻译 1,234 个产品，剩余 56 个
    </Text>
  </BlockStack>
</Card>
```

### Pattern 2: 表格或列表中的文本
```javascript
// 数据表格中的文本使用
<IndexTable.Cell>
  <Text variant="bodyMd" fontWeight="semibold">
    {product.title}
  </Text>
</IndexTable.Cell>
<IndexTable.Cell>
  <Text variant="bodySm" tone="subdued">
    {product.description}
  </Text>
</IndexTable.Cell>
```

### Pattern 3: 状态文本和提示
```javascript
// 成功提示
<Text variant="bodySm" tone="success">
  ✓ 翻译已成功同步到Shopify
</Text>

// 错误提示
<Text variant="bodySm" tone="critical">
  翻译失败：API限流，请稍后重试
</Text>

// 警告提示
<Text variant="bodySm" tone="caution">
  注意：部分内容包含HTML标签
</Text>
```

### Pattern 4: 空状态文本
```javascript
// 无数据时的提示文本
<EmptyState>
  <Text variant="headingLg" as="p">
    还没有扫描任何资源
  </Text>
  <Text variant="bodyMd" tone="subdued">
    点击"扫描资源"按钮开始获取店铺数据
  </Text>
</EmptyState>
```

## Props 参考

| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| variant | string | "bodyMd" | 必需 | 文本样式变体 |
| as | ElementType | "p" | 常用 | 渲染的HTML元素 |
| tone | "base"/"subdued"/"success"/"critical"/"caution" | "base" | 高频 | 文本色调 |
| fontWeight | "regular"/"medium"/"semibold"/"bold" | "regular" | 偶尔 | 字体粗细 |
| alignment | "start"/"center"/"end"/"justify" | "start" | 偶尔 | 文本对齐 |
| children | ReactNode | - | 必需 | 文本内容 |
| truncate | boolean | false | 表格中常用 | 截断过长文本 |

## Variant 变体映射

### 标题变体（Heading）
| Variant | 用途 | 对应HTML | 项目使用次数 |
|---------|------|----------|-------------|
| heading4xl | 超大标题 | h1 | 0 |
| heading3xl | 特大标题 | h1 | 0 |
| heading2xl | 大标题 | h1 | 2 |
| headingXl | 较大标题 | h2 | 5 |
| headingLg | 中大标题 | h2 | 8 |
| **headingMd** | 中等标题 | h3 | **33** |
| **headingSm** | 小标题 | h4 | **22** |
| headingXs | 微小标题 | h5 | 3 |

### 正文变体（Body）
| Variant | 用途 | 项目使用次数 |
|---------|------|------------|
| bodyLg | 大号正文 | 4 |
| **bodyMd** | 标准正文 | **25** |
| **bodySm** | 小号正文 | **31** |
| bodyXs | 微小正文 | 2 |

## 项目使用统计

基于代码分析，Text组件在项目中的使用模式：
- **最常用variant**: headingMd (33次), bodySm (31次), bodyMd (25次)
- **tone使用**: subdued (45%), success (20%), critical (15%)
- **as属性**: 默认p (70%), h2 (15%), h3 (10%), span (5%)
- **fontWeight**: 90%使用默认，10%使用semibold

## 迁移指南

### 从DisplayText迁移
```javascript
// 旧版
<DisplayText size="small">标题</DisplayText>
<DisplayText size="medium">标题</DisplayText>
<DisplayText size="large">标题</DisplayText>

// 新版
<Text variant="headingLg" as="p">标题</Text>
<Text variant="headingXl" as="p">标题</Text>
<Text variant="heading2xl" as="p">标题</Text>
```

### 从Heading迁移
```javascript
// 旧版
<Heading>章节标题</Heading>
<Heading element="h3">子标题</Heading>

// 新版
<Text variant="headingMd" as="h2">章节标题</Text>
<Text variant="headingSm" as="h3">子标题</Text>
```

### 从Caption迁移
```javascript
// 旧版
<Caption>说明文字</Caption>

// 新版
<Text variant="bodySm" tone="subdued">说明文字</Text>
```

## 最佳实践

1. **语义化HTML**: 始终为标题使用正确的as属性（h1-h6）
2. **一致的层级**: 保持标题层级的逻辑性（h1→h2→h3）
3. **适当的tone**: 
   - subdued: 辅助信息、说明文字
   - success: 积极反馈、完成状态
   - critical: 错误信息、删除警告
   - caution: 警告提示、需注意事项
4. **避免嵌套**: Text组件不应该嵌套使用

## 常见错误

❌ **错误**: 使用旧版组件
```javascript
<DisplayText>标题</DisplayText>
<Caption>说明</Caption>
```

✅ **正确**: 使用Text组件
```javascript
<Text variant="headingXl">标题</Text>
<Text variant="bodySm" tone="subdued">说明</Text>
```

❌ **错误**: variant和实际用途不匹配
```javascript
<Text variant="heading2xl">小说明文字</Text>
```

✅ **正确**: 选择合适的variant
```javascript
<Text variant="bodySm" tone="subdued">小说明文字</Text>
```

## 相关组件
- BlockStack: 垂直排列多个Text
- InlineStack: 水平排列多个Text
- Badge: 状态标签（与Text配合使用）

## 验证命令
```bash
# 检查Text组件使用
grep -r "Text.*variant" app/
# 检查是否有旧版文本组件
grep -r "DisplayText\|Heading\|Caption\|TextStyle" app/
```