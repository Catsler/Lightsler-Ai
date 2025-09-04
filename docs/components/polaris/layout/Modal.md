# Modal 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐ (对话框组件, 6%使用率)

## 正确导入方式

```javascript
import { Modal } from '@shopify/polaris';
```

## 基础用法

### 基本模态窗口
```javascript
const [active, setActive] = useState(false);

<Modal
  open={active}
  onClose={() => setActive(false)}
  title="翻译设置"
>
  <Modal.Section>
    <Text>模态窗口内容</Text>
  </Modal.Section>
</Modal>
```

### 带主要操作的模态窗口
```javascript
<Modal
  open={active}
  onClose={() => setActive(false)}
  title="确认操作"
  primaryAction={{
    content: '确认',
    onAction: handleConfirm,
  }}
  secondaryActions={[{
    content: '取消',
    onAction: () => setActive(false),
  }]}
>
  <Modal.Section>
    <Text>确认要执行此操作吗？</Text>
  </Modal.Section>
</Modal>
```

### 大尺寸模态窗口
```javascript
<Modal
  open={active}
  onClose={() => setActive(false)}
  title="翻译详情"
  size="large"
>
  <Modal.Section>
    {/* 更多内容 */}
  </Modal.Section>
</Modal>
```

## 项目特定模式

### Pattern 1: 翻译确认对话框（最常用）
```javascript
// 用于确认批量翻译操作
const [showTranslateModal, setShowTranslateModal] = useState(false);
const [selectedCount, setSelectedCount] = useState(0);

<Modal
  open={showTranslateModal}
  onClose={() => setShowTranslateModal(false)}
  title="确认批量翻译"
  primaryAction={{
    content: `翻译 ${selectedCount} 个资源`,
    onAction: handleBatchTranslate,
    loading: isTranslating,
  }}
  secondaryActions={[{
    content: '取消',
    onAction: () => setShowTranslateModal(false),
  }]}
>
  <Modal.Section>
    <BlockStack gap="400">
      <Text>
        您即将翻译 {selectedCount} 个资源到以下语言：
      </Text>
      <Box 
        padding="300" 
        background="bg-surface-secondary" 
        borderRadius="200"
      >
        <InlineStack gap="200" wrap>
          {selectedLanguages.map(lang => (
            <Badge key={lang.code}>{lang.name}</Badge>
          ))}
        </InlineStack>
      </Box>
      <Text variant="bodySm" tone="subdued">
        此操作可能需要几分钟时间完成，期间请不要关闭页面。
      </Text>
    </BlockStack>
  </Modal.Section>
</Modal>
```

### Pattern 2: 错误详情展示
```javascript
// 用于显示详细的错误信息
const [errorDetails, setErrorDetails] = useState(null);

<Modal
  open={!!errorDetails}
  onClose={() => setErrorDetails(null)}
  title="错误详情"
  size="large"
  secondaryActions={[{
    content: '复制错误信息',
    onAction: () => navigator.clipboard.writeText(errorDetails?.stack),
  }]}
>
  <Modal.Section>
    <BlockStack gap="400">
      <Box 
        padding="400" 
        background="bg-surface-critical-subdued" 
        borderRadius="200"
      >
        <BlockStack gap="200">
          <Text variant="headingSm" tone="critical">
            {errorDetails?.message}
          </Text>
          <Text variant="bodySm" tone="subdued">
            错误代码: {errorDetails?.code}
          </Text>
        </BlockStack>
      </Box>
      <Text variant="headingSm">详细信息:</Text>
      <Box 
        padding="300" 
        background="bg-surface" 
        borderColor="border" 
        borderWidth="025"
        borderRadius="100"
      >
        <Text variant="bodyMd" fontFamily="mono">
          {errorDetails?.stack}
        </Text>
      </Box>
    </BlockStack>
  </Modal.Section>
</Modal>
```

### Pattern 3: 翻译设置编辑器
```javascript
// 用于编辑高级翻译设置
const [settingsModal, setSettingsModal] = useState(false);
const [settings, setSettings] = useState({
  preserveHtml: true,
  protectBrands: true,
  maxChunkSize: 1000,
  apiEndpoint: ''
});

<Modal
  open={settingsModal}
  onClose={() => setSettingsModal(false)}
  title="高级翻译设置"
  size="medium"
  primaryAction={{
    content: '保存设置',
    onAction: handleSaveSettings,
  }}
  secondaryActions={[{
    content: '重置为默认',
    onAction: handleResetSettings,
  }]}
>
  <Modal.Section>
    <FormLayout>
      <Checkbox
        label="保留HTML标签"
        helpText="翻译时保持原有的HTML结构"
        checked={settings.preserveHtml}
        onChange={(checked) => setSettings(s => ({...s, preserveHtml: checked}))}
      />
      <Checkbox
        label="保护品牌词"
        helpText="不翻译指定的品牌关键词"
        checked={settings.protectBrands}
        onChange={(checked) => setSettings(s => ({...s, protectBrands: checked}))}
      />
      <TextField
        label="分块大小"
        type="number"
        value={settings.maxChunkSize.toString()}
        onChange={(value) => setSettings(s => ({...s, maxChunkSize: parseInt(value) || 1000}))}
        helpText="单次翻译的最大字符数"
        suffix="字符"
      />
      <TextField
        label="API端点"
        value={settings.apiEndpoint}
        onChange={(value) => setSettings(s => ({...s, apiEndpoint: value}))}
        helpText="自定义翻译API端点URL"
        placeholder="https://api.example.com/translate"
      />
    </FormLayout>
  </Modal.Section>
</Modal>
```

### Pattern 4: 资源预览对话框
```javascript
// 用于预览翻译前后的资源对比
const [previewResource, setPreviewResource] = useState(null);

<Modal
  open={!!previewResource}
  onClose={() => setPreviewResource(null)}
  title={`预览: ${previewResource?.title}`}
  size="large"
  primaryAction={{
    content: '应用翻译',
    onAction: () => handleApplyTranslation(previewResource),
  }}
>
  <Modal.Section>
    <BlockStack gap="400">
      <InlineStack gap="400" align="start">
        <Box width="50%">
          <BlockStack gap="200">
            <Text variant="headingSm">原文</Text>
            <Box 
              padding="300" 
              background="bg-surface-secondary" 
              borderRadius="200"
              minHeight="200px"
            >
              <Text>{previewResource?.original}</Text>
            </Box>
          </BlockStack>
        </Box>
        <Box width="50%">
          <BlockStack gap="200">
            <Text variant="headingSm">译文</Text>
            <Box 
              padding="300" 
              background="bg-surface-success-subdued" 
              borderRadius="200"
              minHeight="200px"
            >
              <Text>{previewResource?.translated}</Text>
            </Box>
          </BlockStack>
        </Box>
      </InlineStack>
      <Divider />
      <Text variant="bodySm" tone="subdued">
        预览内容仅供参考，实际翻译可能略有差异
      </Text>
    </BlockStack>
  </Modal.Section>
</Modal>
```

### Pattern 5: 导入/导出数据
```javascript
// 用于数据导入导出功能
const [importModal, setImportModal] = useState(false);
const [importFile, setImportFile] = useState(null);

<Modal
  open={importModal}
  onClose={() => setImportModal(false)}
  title="导入翻译数据"
  primaryAction={{
    content: '开始导入',
    onAction: handleImport,
    disabled: !importFile,
  }}
  secondaryActions={[{
    content: '下载模板',
    onAction: handleDownloadTemplate,
  }]}
>
  <Modal.Section>
    <BlockStack gap="400">
      <Text>
        选择要导入的翻译文件 (支持CSV、JSON格式)
      </Text>
      <DropZone
        onDrop={(files) => setImportFile(files[0])}
        accept=".csv,.json"
      >
        <DropZone.FileUpload />
      </DropZone>
      {importFile && (
        <Box 
          padding="300" 
          background="bg-surface-success-subdued" 
          borderRadius="200"
        >
          <InlineStack gap="200" align="center">
            <Icon source={CheckCircleIcon} tone="success" />
            <Text>已选择文件: {importFile.name}</Text>
          </InlineStack>
        </Box>
      )}
      <Text variant="bodySm" tone="subdued">
        导入前请确保文件格式正确，错误的数据可能导致翻译失败。
      </Text>
    </BlockStack>
  </Modal.Section>
</Modal>
```

## Props 参考

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| open | boolean | false | 是否显示模态窗口 |
| onClose | () => void | - | 关闭回调函数 |
| title | string | - | 模态窗口标题 |
| children | ReactNode | - | 模态窗口内容 |
| size | "small" \| "medium" \| "large" | "medium" | 模态窗口大小 |
| primaryAction | ActionProps | - | 主要操作按钮 |
| secondaryActions | ActionProps[] | - | 次要操作按钮数组 |
| instant | boolean | false | 立即显示（无动画） |
| loading | boolean | false | 加载状态 |
| noScroll | boolean | false | 禁用背景滚动 |

### ActionProps 接口

| Prop | 类型 | 说明 |
|------|------|------|
| content | string | 按钮文本 |
| onAction | () => void | 点击回调 |
| loading | boolean | 加载状态 |
| disabled | boolean | 禁用状态 |
| destructive | boolean | 危险操作样式 |

## 最佳实践

1. **明确的标题**: 使用描述性标题，让用户清楚模态窗口的用途
2. **合适的尺寸**: 根据内容量选择合适的size
3. **主要操作**: 确保主要操作按钮位置醒目且文案清晰
4. **关闭方式**: 提供多种关闭方式（X按钮、取消按钮、ESC键）
5. **无障碍性**: 确保键盘导航和屏幕阅读器支持
6. **避免嵌套**: 不要在模态窗口内嵌套另一个模态窗口

## 常见错误

❌ **错误**: 缺少onClose处理
```javascript
// 错误 - 用户无法关闭模态窗口
<Modal open={true} title="标题">
  <Modal.Section>内容</Modal.Section>
</Modal>
```

✅ **正确**: 提供关闭回调
```javascript
// 正确
<Modal 
  open={open} 
  onClose={() => setOpen(false)} 
  title="标题"
>
  <Modal.Section>内容</Modal.Section>
</Modal>
```

❌ **错误**: 模态窗口内容过多但不分节
```javascript
// 错误 - 内容混乱
<Modal>
  <Text>标题</Text>
  <Button>按钮</Button>
  <Text>更多内容</Text>
</Modal>
```

✅ **正确**: 使用Modal.Section组织内容
```javascript
// 正确
<Modal>
  <Modal.Section>
    <Text>第一部分内容</Text>
  </Modal.Section>
  <Modal.Section>
    <Text>第二部分内容</Text>
  </Modal.Section>
</Modal>
```

❌ **错误**: 忽略加载状态
```javascript
// 错误 - 异步操作时用户不知道发生了什么
<Modal 
  primaryAction={{
    content: '保存',
    onAction: handleAsyncSave
  }}
>
```

✅ **正确**: 显示加载状态
```javascript
// 正确
<Modal 
  primaryAction={{
    content: '保存',
    onAction: handleAsyncSave,
    loading: isSaving
  }}
>
```

## 相关组件
- Button: 操作按钮
- FormLayout: 表单布局
- Card: 内容容器
- Banner: 消息提示

## 验证命令
```bash
# 检查Modal组件使用
grep -r "import.*Modal.*from '@shopify/polaris'" app/

# 查找缺少onClose的Modal
grep -r "<Modal" app/ | grep -v "onClose"

# 检查Modal.Section的使用
grep -r "Modal.Section" app/
```