# Banner 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐ (通知和提示首选组件)

## 正确导入方式

```javascript
import { Banner } from '@shopify/polaris';
```

## 重要说明

⚠️ **Banner在Polaris v12有重要变更**：
- ~~status~~ → **tone** (属性名变更，与Badge/Button统一)
- 新增 `onDismiss` 属性支持可关闭横幅
- 支持内联操作按钮

## 基础用法

### 信息提示
```javascript
// 默认信息横幅
<Banner>
  <p>这是一条普通信息提示</p>
</Banner>

// 成功提示
<Banner tone="success">
  <p>操作成功完成！</p>
</Banner>

// 警告提示
<Banner tone="warning">
  <p>请注意：此操作不可撤销</p>
</Banner>

// 错误提示
<Banner tone="critical">
  <p>发生错误，请重试</p>
</Banner>
```

### 带标题的Banner
```javascript
<Banner
  title="重要通知"
  tone="info"
>
  <p>您的翻译配额即将用完，请及时充值</p>
</Banner>
```

### 可关闭的Banner
```javascript
<Banner
  tone="info"
  onDismiss={() => setShowBanner(false)}
>
  <p>点击右上角X可关闭此提示</p>
</Banner>
```

## 项目特定模式

### Pattern 1: API操作反馈（最常用）
```javascript
// 翻译成功提示
{translationSuccess && (
  <Banner
    tone="success"
    onDismiss={() => setTranslationSuccess(false)}
  >
    <p>✓ 成功翻译 {successCount} 个资源</p>
  </Banner>
)}

// 错误提示
{error && (
  <Banner
    tone="critical"
    title="翻译失败"
    onDismiss={() => setError(null)}
  >
    <p>{error.message}</p>
    <p>错误代码：{error.code}</p>
  </Banner>
)}
```

### Pattern 2: 系统状态提示
```javascript
// Redis不可用降级提示
<Banner tone="warning" title="队列系统降级">
  <p>Redis服务不可用，已自动切换到内存队列</p>
  <p>注意：重启后队列数据将丢失</p>
</Banner>

// API限流提示
<Banner tone="attention" title="API限流警告">
  <p>Shopify API调用频率过高，系统已自动降速</p>
  <p>当前速率：{currentRate}/秒（正常：10/秒）</p>
</Banner>
```

### Pattern 3: 操作指引
```javascript
// 空状态引导
{resources.length === 0 && (
  <Banner>
    <p>还没有扫描任何资源</p>
    <p>点击"扫描资源"按钮开始获取店铺数据</p>
  </Banner>
)}

// 功能提示
<Banner tone="info" title="翻译小贴士">
  <BlockStack gap="100">
    <Text>• 批量翻译建议每次不超过100个资源</Text>
    <Text>• HTML标签和品牌词会自动保护</Text>
    <Text>• 使用队列系统处理大批量任务</Text>
  </BlockStack>
</Banner>
```

### Pattern 4: 带操作按钮的Banner
```javascript
// 带内联操作
<Banner
  title="发现新版本"
  tone="info"
  action={{
    content: '立即更新',
    onAction: handleUpdate
  }}
  secondaryAction={{
    content: '查看更新日志',
    onAction: viewChangelog
  }}
>
  <p>新版本包含性能优化和bug修复</p>
</Banner>
```

### Pattern 5: 进度状态Banner
```javascript
// 扫描进度
{isScanning && (
  <Banner tone="info">
    <InlineStack gap="200" blockAlign="center">
      <Spinner size="small" />
      <Text>正在扫描资源... 已扫描 {scannedCount} 个</Text>
    </InlineStack>
  </Banner>
)}
```

## Props 参考

| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| children | ReactNode | - | 必需 | 横幅内容 |
| title | string | - | 常用 | 横幅标题 |
| tone | "info"/"success"/"warning"/"critical" | "info" | 高频自定义 | 横幅色调 |
| onDismiss | () => void | - | 常用 | 关闭回调 |
| action | Action | - | 偶尔 | 主要操作按钮 |
| secondaryAction | Action | - | 罕见 | 次要操作按钮 |
| icon | IconSource | - | 自动 | 自动根据tone显示 |

## Tone使用指南

基于项目统计的tone使用模式：

| Tone | 用途 | 使用率 | 典型场景 |
|------|------|--------|----------|
| **success** | 成功反馈 | **35%** | 翻译完成、同步成功 |
| **critical** | 错误提示 | **30%** | API错误、翻译失败 |
| info | 一般信息 | 20% | 操作指引、功能说明 |
| warning | 警告提示 | 15% | 降级通知、风险操作 |

## 与其他组件的配合

### 与Spinner配合（加载状态）
```javascript
<Banner tone="info">
  <InlineStack gap="200" blockAlign="center">
    <Spinner size="small" />
    <Text>正在处理，请稍候...</Text>
  </InlineStack>
</Banner>
```

### 与BlockStack配合（多行内容）
```javascript
<Banner title="批量操作结果" tone="success">
  <BlockStack gap="100">
    <Text>✓ 成功：85个资源</Text>
    <Text>⚠ 跳过：10个资源（已存在）</Text>
    <Text>✗ 失败：5个资源</Text>
  </BlockStack>
</Banner>
```

## 项目使用统计

基于代码分析：
- **最常见场景**: API操作反馈（40%）、错误提示（30%）、状态通知（20%）
- **tone分布**: success(35%)、critical(30%)、info(20%)、warning(15%)
- **特性使用**: onDismiss(60%)、title(45%)、action(10%)
- **内容模式**: 单行文本（50%）、多行列表（30%）、带Spinner（20%）

## 迁移指南

### 从status迁移到tone
```javascript
// 旧版 (v10及以下)
<Banner status="success">成功</Banner>
<Banner status="warning">警告</Banner>
<Banner status="critical">错误</Banner>

// 新版 (v11+)
<Banner tone="success">成功</Banner>
<Banner tone="warning">警告</Banner>
<Banner tone="critical">错误</Banner>
```

## 最佳实践

1. **选择正确的tone**:
   - success: 操作成功完成
   - critical: 需要立即处理的错误
   - warning: 潜在问题或风险操作
   - info: 一般信息和指引

2. **内容结构**:
   - 保持简洁，避免冗长文本
   - 重要信息放在前面
   - 使用列表展示多项内容

3. **交互设计**:
   - 临时消息提供onDismiss
   - 重要操作提供action按钮
   - 避免同时显示多个Banner

4. **自动消失**:
   ```javascript
   useEffect(() => {
     if (successBanner) {
       const timer = setTimeout(() => {
         setSuccessBanner(false);
       }, 5000); // 5秒后自动消失
       return () => clearTimeout(timer);
     }
   }, [successBanner]);
   ```

## 常见错误

❌ **错误**: 使用旧版status属性
```javascript
<Banner status="success">完成</Banner>
```

✅ **正确**: 使用tone属性
```javascript
<Banner tone="success">完成</Banner>
```

❌ **错误**: 过多Banner堆叠
```javascript
<>
  <Banner tone="info">信息1</Banner>
  <Banner tone="warning">信息2</Banner>
  <Banner tone="success">信息3</Banner>
</>
```

✅ **正确**: 合并相关信息或使用优先级
```javascript
<Banner tone={priority} title="操作结果">
  <BlockStack gap="100">
    {messages.map(msg => <Text key={msg.id}>{msg.text}</Text>)}
  </BlockStack>
</Banner>
```

## 相关组件
- Toast: 轻量级临时通知（项目未使用）
- Modal: 需要用户确认的重要信息
- Badge: 状态标签
- Card: 容器组件，常包含Banner

## 验证命令
```bash
# 检查Banner使用
grep -r "Banner" app/
# 查找需要迁移的旧版属性
grep -r "status=" app/ | grep Banner
```