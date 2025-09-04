# Button 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐⭐ (项目核心交互组件)

## 正确导入方式

```javascript
import { Button } from '@shopify/polaris';
```

## 基础用法

### 主要按钮（Primary）
```javascript
<Button variant="primary">
  开始翻译
</Button>
```

### 次要按钮（Secondary）
```javascript
<Button variant="secondary">
  取消
</Button>
```

### 危险操作按钮
```javascript
<Button variant="tertiary" tone="critical">
  删除数据
</Button>
```

### 纯文本按钮
```javascript
<Button variant="plain">
  查看更多
</Button>
```

## 项目特定模式

### Pattern 1: 加载状态按钮（最常用）
```javascript
// 异步操作标准模式
const [isLoading, setIsLoading] = useState(false);

<Button 
  variant="primary" 
  size="slim"
  loading={isLoading}
  onClick={async () => {
    setIsLoading(true);
    await performAction();
    setIsLoading(false);
  }}
>
  同步到Shopify
</Button>
```

### Pattern 2: 批量操作按钮组
```javascript
// 表格批量操作
<InlineStack gap="200">
  <Button 
    variant="primary" 
    size="slim"
    disabled={selectedItems.length === 0}
  >
    批量翻译 ({selectedItems.length})
  </Button>
  <Button 
    variant="tertiary"
    tone="critical"
    size="slim"
    disabled={selectedItems.length === 0}
  >
    批量删除
  </Button>
</InlineStack>
```

### Pattern 3: 表单提交按钮
```javascript
// 标准表单提交
<Button
  variant="primary"
  submit
  loading={isSubmitting}
  disabled={!isFormValid}
>
  保存设置
</Button>
```

## Props 参考

| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| variant | "primary"/"secondary"/"tertiary"/"plain" | "secondary" | primary:50% | 按钮样式 |
| size | "slim"/"medium"/"large"/"micro" | "medium" | slim:89% | 按钮大小 |
| tone | "success"/"critical" | - | success:80% | 按钮色调 |
| loading | boolean | false | 高频使用 | 加载状态 |
| disabled | boolean | false | 常用 | 禁用状态 |
| submit | boolean | false | 表单专用 | 表单提交按钮 |
| onClick | function | - | 必需 | 点击处理函数 |
| fullWidth | boolean | false | 偶尔 | 全宽按钮 |

## v12 重要更新

⚠️ **重要**: Polaris v12 简化了Button API，使用variant和tone替代多个布尔属性：

### 旧版写法（已废弃）
```javascript
// ❌ 不要使用
<Button primary>主按钮</Button>
<Button destructive>删除</Button>
<Button plain>纯文本</Button>
```

### 新版写法（推荐）
```javascript
// ✅ 使用variant和tone
<Button variant="primary">主按钮</Button>
<Button variant="tertiary" tone="critical">删除</Button>
<Button variant="plain">纯文本</Button>
```

## 项目使用统计

基于代码分析，项目中Button使用模式：
- **variant分布**: primary(50%), tertiary(19%), plain(19%), secondary(12%)
- **size分布**: slim(89%), micro(11%)
- **tone分布**: success(80%), critical(20%)
- **loading属性**: 8个文件中使用

## 最佳实践

1. **始终使用slim尺寸**: 项目UI设计偏好紧凑型按钮
2. **loading状态管理**: 所有异步操作必须显示loading状态
3. **禁用状态逻辑**: 基于表单验证或选择状态动态控制
4. **色调使用规范**:
   - success: 积极操作（保存、同步、完成）
   - critical: 危险操作（删除、清除、重置）

## 常见错误

❌ **错误**: 使用旧版布尔属性
```javascript
<Button primary loading>
```

✅ **正确**: 使用新版API
```javascript
<Button variant="primary" loading>
```

❌ **错误**: 忘记处理loading状态
```javascript
<Button onClick={async () => await saveData()}>
```

✅ **正确**: 完整的状态管理
```javascript
<Button 
  loading={isSaving}
  onClick={handleSave}
>
```

## 相关组件
- ButtonGroup: 按钮组布局
- InlineStack: 水平按钮排列
- Form: 表单提交按钮

## 验证命令
```bash
# 检查Button组件使用
grep -r "Button.*variant" app/
# 检查是否有旧版API使用
grep -r "<Button.*primary.*>" app/
```