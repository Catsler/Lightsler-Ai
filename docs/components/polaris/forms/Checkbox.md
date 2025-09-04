# Checkbox 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐ (表单选择组件, 6%使用率)

## 正确导入方式

```javascript
import { Checkbox } from '@shopify/polaris';
```

## 基础用法

### 基本复选框
```javascript
const [checked, setChecked] = useState(false);

<Checkbox
  label="启用自动翻译"
  checked={checked}
  onChange={setChecked}
/>
```

### 带帮助文本的复选框
```javascript
<Checkbox
  label="保护品牌词"
  helpText="翻译时保留指定的品牌词不被翻译"
  checked={protectBrands}
  onChange={setProtectBrands}
/>
```

### 禁用状态
```javascript
<Checkbox
  label="高级功能"
  helpText="需要升级到Pro版本"
  checked={false}
  disabled
/>
```

## 项目特定模式

### Pattern 1: 批量操作选择（最常用于资源管理）
```javascript
// 用于批量选择翻译资源
const [selectedResources, setSelectedResources] = useState(new Set());

const handleSelectAll = useCallback((checked) => {
  if (checked) {
    setSelectedResources(new Set(resources.map(r => r.id)));
  } else {
    setSelectedResources(new Set());
  }
}, [resources]);

<Card>
  <BlockStack gap="400">
    <Checkbox
      label={`全选 (${resources.length}个资源)`}
      checked={selectedResources.size === resources.length}
      indeterminate={selectedResources.size > 0 && selectedResources.size < resources.length}
      onChange={handleSelectAll}
    />
    <Divider />
    {resources.map(resource => (
      <Checkbox
        key={resource.id}
        label={resource.title}
        helpText={`类型: ${resource.resourceType} | 状态: ${resource.status}`}
        checked={selectedResources.has(resource.id)}
        onChange={(checked) => {
          const newSelected = new Set(selectedResources);
          if (checked) {
            newSelected.add(resource.id);
          } else {
            newSelected.delete(resource.id);
          }
          setSelectedResources(newSelected);
        }}
      />
    ))}
  </BlockStack>
</Card>
```

### Pattern 2: 设置面板选项
```javascript
// 用于翻译设置页面
<FormLayout>
  <FormLayout.Group>
    <Text variant="headingMd">翻译选项</Text>
    <BlockStack gap="300">
      <Checkbox
        label="翻译产品标题"
        helpText="自动翻译所有产品的标题字段"
        checked={settings.translateTitles}
        onChange={(checked) => updateSettings({translateTitles: checked})}
      />
      <Checkbox
        label="翻译产品描述"
        helpText="自动翻译产品的详细描述内容"
        checked={settings.translateDescriptions}
        onChange={(checked) => updateSettings({translateDescriptions: checked})}
      />
      <Checkbox
        label="翻译SEO信息"
        helpText="包括meta标题和meta描述的翻译"
        checked={settings.translateSEO}
        onChange={(checked) => updateSettings({translateSEO: checked})}
      />
    </BlockStack>
  </FormLayout.Group>
</FormLayout>
```

### Pattern 3: 确认操作对话框
```javascript
// 用于危险操作的确认
const [confirmDelete, setConfirmDelete] = useState(false);

<Modal
  open={showDeleteModal}
  onClose={() => setShowDeleteModal(false)}
  title="确认删除翻译"
>
  <Modal.Section>
    <BlockStack gap="400">
      <Text>此操作将删除所有已翻译的内容，且无法恢复。</Text>
      <Checkbox
        label="我确认要删除所有翻译数据"
        checked={confirmDelete}
        onChange={setConfirmDelete}
      />
    </BlockStack>
  </Modal.Section>
  <Modal.Section>
    <InlineStack align="end" gap="200">
      <Button onClick={() => setShowDeleteModal(false)}>
        取消
      </Button>
      <Button 
        variant="primary" 
        tone="critical"
        disabled={!confirmDelete}
        onClick={handleDelete}
      >
        确认删除
      </Button>
    </InlineStack>
  </Modal.Section>
</Modal>
```

### Pattern 4: 过滤器组合
```javascript
// 用于翻译日志和错误日志的过滤
const [filters, setFilters] = useState({
  showErrors: true,
  showWarnings: true,
  showSuccess: false,
  onlyRecent: false
});

<Card>
  <BlockStack gap="300">
    <Text variant="headingSm">日志过滤器</Text>
    <InlineStack gap="400" wrap={false}>
      <Checkbox
        label="错误"
        checked={filters.showErrors}
        onChange={(checked) => setFilters(f => ({...f, showErrors: checked}))}
      />
      <Checkbox
        label="警告"
        checked={filters.showWarnings}
        onChange={(checked) => setFilters(f => ({...f, showWarnings: checked}))}
      />
      <Checkbox
        label="成功"
        checked={filters.showSuccess}
        onChange={(checked) => setFilters(f => ({...f, showSuccess: checked}))}
      />
      <Checkbox
        label="仅显示最近24小时"
        checked={filters.onlyRecent}
        onChange={(checked) => setFilters(f => ({...f, onlyRecent: checked}))}
      />
    </InlineStack>
  </BlockStack>
</Card>
```

### Pattern 5: 语言选择器
```javascript
// 用于目标语言选择
const [selectedLanguages, setSelectedLanguages] = useState(new Set(['zh-CN']));

<Card>
  <BlockStack gap="400">
    <Text variant="headingSm">选择目标语言</Text>
    <Box maxHeight="300px" overflowY="scroll">
      <BlockStack gap="200">
        {supportedLanguages.map(language => (
          <Checkbox
            key={language.code}
            label={language.name}
            helpText={`代码: ${language.code}`}
            checked={selectedLanguages.has(language.code)}
            onChange={(checked) => {
              const newSelected = new Set(selectedLanguages);
              if (checked) {
                newSelected.add(language.code);
              } else {
                newSelected.delete(language.code);
              }
              setSelectedLanguages(newSelected);
            }}
          />
        ))}
      </BlockStack>
    </Box>
  </BlockStack>
</Card>
```

## Props 参考

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| label | string | - | 复选框标签文本 |
| checked | boolean | false | 是否选中 |
| indeterminate | boolean | false | 半选中状态（用于全选） |
| disabled | boolean | false | 是否禁用 |
| helpText | string | - | 帮助文本 |
| error | string | - | 错误提示文本 |
| id | string | - | 唯一标识符 |
| name | string | - | 表单字段名称 |
| value | string | - | 表单提交值 |
| onChange | (checked: boolean) => void | - | 状态变化回调 |
| onBlur | () => void | - | 失去焦点回调 |
| onFocus | () => void | - | 获得焦点回调 |

## 最佳实践

1. **标签文本清晰**: 使用描述性的标签，避免模糊表达
2. **帮助文本说明**: 对复杂选项提供帮助文本
3. **批量操作**: 使用indeterminate状态处理全选场景
4. **无障碍性**: 确保每个Checkbox都有明确的label
5. **状态管理**: 使用useState或表单库管理复选框状态

## 常见错误

❌ **错误**: 缺少onChange处理函数
```javascript
// 错误 - 无法交互的复选框
<Checkbox label="选项" checked={true} />
```

✅ **正确**: 提供onChange回调
```javascript
// 正确
<Checkbox 
  label="选项" 
  checked={checked} 
  onChange={setChecked} 
/>
```

❌ **错误**: 直接操作DOM而不是通过状态
```javascript
// 错误
<Checkbox 
  label="选项"
  onChange={(checked) => {
    document.getElementById('some-element').style.display = checked ? 'block' : 'none';
  }}
/>
```

✅ **正确**: 通过状态管理UI变化
```javascript
// 正确
const [showElement, setShowElement] = useState(false);

<Checkbox 
  label="显示元素"
  checked={showElement}
  onChange={setShowElement}
/>
{showElement && <SomeComponent />}
```

❌ **错误**: 全选逻辑错误处理
```javascript
// 错误 - 没有处理indeterminate状态
<Checkbox 
  label="全选"
  checked={selectedItems.length === totalItems.length}
  onChange={handleSelectAll}
/>
```

✅ **正确**: 正确处理全选的三态逻辑
```javascript
// 正确
<Checkbox 
  label="全选"
  checked={selectedItems.length === totalItems.length}
  indeterminate={selectedItems.length > 0 && selectedItems.length < totalItems.length}
  onChange={handleSelectAll}
/>
```

## 相关组件
- FormLayout: 表单布局
- RadioButton: 单选按钮
- Select: 下拉选择
- ChoiceList: 选择列表

## 验证命令
```bash
# 检查Checkbox组件使用
grep -r "import.*Checkbox.*from '@shopify/polaris'" app/

# 查找缺少onChange的Checkbox
grep -r "<Checkbox" app/ | grep -v "onChange"
```