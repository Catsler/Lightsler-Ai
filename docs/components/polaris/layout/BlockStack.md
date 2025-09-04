# BlockStack 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐⭐ (垂直布局首选组件)

## 正确导入方式

```javascript
import { BlockStack } from '@shopify/polaris';
```

## 重要说明

⚠️ **BlockStack是Polaris v10+的新布局组件**，替代了旧的Stack组件：
- ~~Stack~~ (vertical) → **BlockStack**
- ~~LegacyStack~~ → **BlockStack** 或 InlineStack

## 基础用法

### 标准垂直布局
```javascript
<BlockStack gap="300">
  <Text>第一行内容</Text>
  <Text>第二行内容</Text>
  <Text>第三行内容</Text>
</BlockStack>
```

### 自定义间距
```javascript
// 紧凑布局
<BlockStack gap="100">
  <TextField label="姓名" />
  <TextField label="邮箱" />
</BlockStack>

// 宽松布局
<BlockStack gap="500">
  <Card>{/* 卡片1 */}</Card>
  <Card>{/* 卡片2 */}</Card>
</BlockStack>
```

## 项目特定模式

### Pattern 1: Card内容布局（最常用）
```javascript
// 这是项目中最高频的组合模式
<Card>
  <BlockStack gap="300">
    <Text variant="headingMd">翻译进度</Text>
    <ProgressBar progress={75} />
    <InlineStack align="space-between">
      <Text variant="bodySm">已完成: 750</Text>
      <Text variant="bodySm">总计: 1000</Text>
    </InlineStack>
  </BlockStack>
</Card>
```

### Pattern 2: 表单布局
```javascript
// 翻译配置表单
<BlockStack gap="400">
  <Text variant="headingMd">翻译设置</Text>
  
  <BlockStack gap="200">
    <Select
      label="源语言"
      options={sourceLanguages}
      value={sourceLang}
      onChange={setSourceLang}
    />
    <Select
      label="目标语言"
      options={targetLanguages}
      value={targetLang}
      onChange={setTargetLang}
    />
  </BlockStack>
  
  <Checkbox
    label="保护品牌词"
    checked={protectBrandWords}
    onChange={setProtectBrandWords}
  />
  
  <Button variant="primary" submit>
    保存设置
  </Button>
</BlockStack>
```

### Pattern 3: 状态信息展示
```javascript
// 批量操作状态
<BlockStack gap="200">
  <InlineStack align="space-between">
    <Text variant="headingSm">扫描状态</Text>
    <Badge tone="success">完成</Badge>
  </InlineStack>
  
  <Text variant="bodySm" tone="subdued">
    扫描时间：2025-01-04 10:30
  </Text>
  
  <BlockStack gap="100">
    <Text variant="bodySm">• 产品: 1,234 个</Text>
    <Text variant="bodySm">• 集合: 56 个</Text>
    <Text variant="bodySm">• 页面: 12 个</Text>
  </BlockStack>
</BlockStack>
```

### Pattern 4: 操作按钮组
```javascript
// 垂直按钮组（移动端友好）
<BlockStack gap="200">
  <Button variant="primary" fullWidth>
    开始翻译
  </Button>
  <Button variant="secondary" fullWidth>
    扫描资源
  </Button>
  <Button variant="plain" fullWidth>
    查看日志
  </Button>
</BlockStack>
```

## Props 参考

| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| gap | SpaceScale | "300" | 高频自定义 | 子元素间距 |
| align | "start"/"center"/"end"/"space-around"/"space-between"/"space-evenly" | "start" | 偶尔 | 水平对齐 |
| inlineAlign | "start"/"center"/"end"/"baseline"/"stretch" | "stretch" | 罕见 | 垂直对齐 |
| children | ReactNode | - | 必需 | 子元素 |
| as | ElementType | "div" | 默认 | 渲染元素类型 |

## Gap间距规范

项目中的gap使用模式：
| Gap值 | 像素 | 使用场景 | 频率 |
|-------|------|----------|------|
| "100" | 4px | 紧密相关的元素 | 15% |
| "200" | 8px | 表单字段间 | 25% |
| **"300"** | 12px | **标准间距（默认）** | **40%** |
| "400" | 16px | 区块之间 | 15% |
| "500" | 20px | 独立卡片间 | 5% |

## 与InlineStack的配合

BlockStack经常与InlineStack组合使用，形成灵活的二维布局：

```javascript
// 典型的组合模式
<BlockStack gap="300">
  {/* 标题行 */}
  <InlineStack align="space-between">
    <Text variant="headingMd">资源列表</Text>
    <Button>刷新</Button>
  </InlineStack>
  
  {/* 内容区 */}
  <DataTable />
  
  {/* 底部操作 */}
  <InlineStack gap="200">
    <Button variant="primary">批量翻译</Button>
    <Button>导出</Button>
  </InlineStack>
</BlockStack>
```

## 迁移指南

### 从Stack迁移
```javascript
// 旧版
<Stack vertical spacing="tight">
  <Text>项目1</Text>
  <Text>项目2</Text>
</Stack>

// 新版
<BlockStack gap="200">
  <Text>项目1</Text>
  <Text>项目2</Text>
</BlockStack>
```

### 从LegacyStack迁移
```javascript
// 旧版
<LegacyStack vertical>
  <LegacyStack.Item>内容1</LegacyStack.Item>
  <LegacyStack.Item>内容2</LegacyStack.Item>
</LegacyStack>

// 新版
<BlockStack>
  <Box>内容1</Box>
  <Box>内容2</Box>
</BlockStack>
```

## 最佳实践

1. **一致的间距**: 项目中主要使用gap="300"作为标准间距
2. **嵌套控制**: 避免过深的BlockStack嵌套（最多2-3层）
3. **语义化**: Card内部始终使用BlockStack组织内容
4. **响应式考虑**: BlockStack天然支持移动端垂直布局

## 常见错误

❌ **错误**: 使用旧版Stack组件
```javascript
<Stack vertical spacing="loose">
```

✅ **正确**: 使用BlockStack
```javascript
<BlockStack gap="400">
```

❌ **错误**: 不必要的Box包装
```javascript
<BlockStack>
  <Box><Text>文本1</Text></Box>
  <Box><Text>文本2</Text></Box>
</BlockStack>
```

✅ **正确**: 直接放置子元素
```javascript
<BlockStack>
  <Text>文本1</Text>
  <Text>文本2</Text>
</BlockStack>
```

## 相关组件
- InlineStack: 水平布局
- Card: 常与BlockStack配合
- Box: 布局微调
- Columns: 多列布局

## 验证命令
```bash
# 检查BlockStack使用
grep -r "BlockStack" app/
# 查找需要迁移的旧版Stack
grep -r "LegacyStack\|<Stack.*vertical" app/
```