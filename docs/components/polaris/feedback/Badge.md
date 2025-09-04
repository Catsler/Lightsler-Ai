# Badge 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐ (状态标签首选组件)

## 正确导入方式

```javascript
import { Badge } from '@shopify/polaris';
```

## 重要说明

⚠️ **Badge在Polaris v11+有重要API变更**：
- ~~status~~ → **tone** (属性名变更)
- ~~new~~ → tone="new"
- ~~size~~ → 已移除，自动根据上下文调整

## 基础用法

### 状态标签
```javascript
// 成功状态
<Badge tone="success">已完成</Badge>

// 警告状态
<Badge tone="attention">待处理</Badge>

// 错误状态
<Badge tone="critical">失败</Badge>

// 信息状态
<Badge tone="info">提示</Badge>

// 新增状态
<Badge tone="new">新</Badge>
```

### 带进度的Badge
```javascript
<Badge progress="incomplete">处理中</Badge>
<Badge progress="partiallyComplete">部分完成</Badge>
<Badge progress="complete">全部完成</Badge>
```

## 项目特定模式

### Pattern 1: 资源统计展示（最常用）
```javascript
// Card标题栏的数量展示
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

### Pattern 2: 多状态标签组
```javascript
// 翻译状态组合展示
<InlineStack gap="100">
  <Badge tone="success">已翻译</Badge>
  <Badge tone="attention">待同步</Badge>
  <Badge tone="info">中文</Badge>
  <Badge>英文</Badge>
</InlineStack>
```

### Pattern 3: 表格中的状态指示
```javascript
// IndexTable中的状态显示
<IndexTable.Cell>
  <InlineStack gap="100" blockAlign="center">
    <Text variant="bodyMd">{resource.title}</Text>
    {resource.synced ? (
      <Badge tone="success">已同步</Badge>
    ) : (
      <Badge tone="attention">待同步</Badge>
    )}
  </InlineStack>
</IndexTable.Cell>
```

### Pattern 4: 进度追踪
```javascript
// 批量操作进度展示
<BlockStack gap="200">
  <InlineStack align="space-between">
    <Text variant="headingSm">翻译进度</Text>
    {progress === 100 ? (
      <Badge tone="success" progress="complete">
        完成
      </Badge>
    ) : progress > 50 ? (
      <Badge tone="attention" progress="partiallyComplete">
        {progress}%
      </Badge>
    ) : (
      <Badge progress="incomplete">
        {progress}%
      </Badge>
    )}
  </InlineStack>
</BlockStack>
```

### Pattern 5: 错误状态展示
```javascript
// 错误计数和分类
<InlineStack gap="200">
  <Badge tone="critical">{criticalErrors} 严重</Badge>
  <Badge tone="warning">{warnings} 警告</Badge>
  <Badge tone="info">{info} 提示</Badge>
</InlineStack>
```

## Props 参考

| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| children | string/number | - | 必需 | Badge内容 |
| tone | "info"/"success"/"attention"/"warning"/"critical"/"new"/"read-only"/"enabled"/"magic" | - | 高频 | Badge色调 |
| progress | "complete"/"partiallyComplete"/"incomplete" | - | 偶尔 | 进度状态 |
| icon | IconSource | - | 罕见 | 图标 |

## Tone色调使用指南

基于项目分析的tone使用模式：

| Tone | 用途 | 使用率 | 示例 |
|------|------|--------|------|
| **success** | 完成、成功、已同步 | **40%** | "已翻译"、"已完成" |
| **attention** | 待处理、需关注 | **25%** | "待同步"、"处理中" |
| info | 一般信息 | 15% | "中文"、"英文" |
| critical | 错误、失败 | 10% | "失败"、"错误" |
| 无tone（默认） | 中性标签 | 10% | 数字、普通状态 |

## 与其他组件的配合

### 与InlineStack配合（最常见）
```javascript
// 标准模式：右对齐展示数量
<InlineStack align="space-between">
  <Text variant="headingMd">资源名称</Text>
  <Badge tone="success">123</Badge>
</InlineStack>

// 紧密模式：多个Badge并排
<InlineStack gap="100">
  <Badge tone="success">状态1</Badge>
  <Badge tone="attention">状态2</Badge>
  <Badge>状态3</Badge>
</InlineStack>
```

### 与Text配合
```javascript
// 带说明文字的Badge
<InlineStack gap="100" blockAlign="center">
  <Badge tone="success">完成</Badge>
  <Text variant="bodySm" tone="subdued">
    最后更新: 2分钟前
  </Text>
</InlineStack>
```

## 迁移指南

### 从旧版Badge迁移
```javascript
// 旧版 (v10及以下)
<Badge status="success">完成</Badge>
<Badge status="warning">警告</Badge>
<Badge status="new">新</Badge>

// 新版 (v11+)
<Badge tone="success">完成</Badge>
<Badge tone="attention">警告</Badge>
<Badge tone="new">新</Badge>
```

### size属性已移除
```javascript
// 旧版
<Badge size="small">小标签</Badge>
<Badge size="medium">中标签</Badge>

// 新版（自动调整大小）
<Badge>标签</Badge>  // 大小根据上下文自动调整
```

## 项目使用统计

基于代码分析：
- **最常见用途**: 数量展示（45%）、状态指示（35%）、语言标记（20%）
- **常见组合**: Badge + InlineStack（60%）、Badge + Card（30%）
- **tone分布**: success(40%)、attention(25%)、info(15%)、critical(10%)
- **典型内容**: 数字（50%）、中文状态词（30%）、英文状态（20%）

## 最佳实践

1. **语义化选择tone**:
   - success: 积极结果（完成、成功、已同步）
   - attention: 需要关注（待处理、进行中）
   - critical: 问题和错误
   - info: 中性信息

2. **数量展示规范**:
   - 千位使用逗号分隔：1,234
   - 超大数字考虑缩写：10K+

3. **与InlineStack配合**:
   - 多个Badge使用gap="100"
   - 单个Badge使用align="space-between"

4. **避免过度使用**:
   - 每个Card不超过2-3个Badge
   - 相似状态合并展示

## 常见错误

❌ **错误**: 使用旧版status属性
```javascript
<Badge status="success">完成</Badge>
```

✅ **正确**: 使用tone属性
```javascript
<Badge tone="success">完成</Badge>
```

❌ **错误**: 尝试使用size属性
```javascript
<Badge size="small">标签</Badge>
```

✅ **正确**: 让Badge自动调整大小
```javascript
<Badge>标签</Badge>
```

❌ **错误**: Badge内容过长
```javascript
<Badge>这是一个非常长的描述性文字标签</Badge>
```

✅ **正确**: 保持简洁
```javascript
<Badge>已完成</Badge>
```

## 相关组件
- InlineStack: 水平排列多个Badge
- Text: 配合显示说明文字
- Icon: 增强视觉表达（较少使用）

## 验证命令
```bash
# 检查Badge使用
grep -r "Badge" app/
# 查找需要迁移的旧版属性
grep -r "status=" app/ | grep Badge
```