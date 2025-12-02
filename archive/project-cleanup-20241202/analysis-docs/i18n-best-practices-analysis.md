# i18n 使用模式分析 & 最佳实践指南

**分析日期**: 2025-11-25  
**项目**: Lightsler-Ai (多语言翻译应用)  
**范围**: 现有项目 i18n 实现、成功模式、反模式、最佳实践

---

## 目录

1. [现有 i18n 架构](#现有-i18n-架构)
2. [成功使用模式](#成功使用模式)
3. [常见反模式与陷阱](#常见反模式与陷阱)
4. [最佳实践总结](#最佳实践总结)
5. [常见场景解决方案](#常见场景解决方案)
6. [代码示例库](#代码示例库)

---

## 现有 i18n 架构

### 技术栈

- **框架**: react-i18next + i18next
- **文件系统**: 基于语言语言环境目录 (`app/locales/{lang}/{namespace}.json`)
- **服务端**: `RemixI18Next` + `i18next-fs-backend`
- **客户端**: `i18next-resources-to-backend` (动态导入)
- **支持语言**: 英文 (en), 简体中文 (zh-CN)

### 配置文件结构

```
app/
├── i18n.shared.ts          # 共享配置（客户端初始化）
├── i18n.server.ts          # 服务端配置 + 语言检测逻辑
├── i18n.client.ts          # 客户端初始化逻辑
├── config/i18n.config.ts   # 统一配置常量
├── cookies.server.ts       # 语言偏好 Cookie
├── locales/
│   ├── en/common.json       # 英文翻译
│   └── zh-CN/common.json    # 中文翻译
├── entry.client.jsx        # 客户端启动（初始化 i18n）
├── entry.server.jsx        # 服务端启动（集成 i18n）
└── root.jsx               # 根路由（处理语言检测）
```

### 语言检测优先级 (resolveLocale)

```
1. ?locale={lang}        # Shopify 传递的管理员语言
2. ?lng={lang}          # 用户手动切换的参数
3. Cookie (lng)         # 用户的持久化偏好
4. 默认语言 (en)        # 最后降级
```

---

## 成功使用模式

### 1. 函数组件中使用 useTranslation

**✅ 最佳做法** - CoverageCard.jsx

```javascript
import { useTranslation } from "react-i18next";

export function CoverageCard({ data, onRefresh }) {
  const { t } = useTranslation();  // 最简单的方式

  // 在 switch 语句中使用 t() 映射状态
  const getStatusLabel = (status) => {
    switch (status) {
      case 'UP_TO_DATE': return t('coverage.status.upToDate');
      case 'STALE': return return t('coverage.status.stale');
      case 'MISSING': return t('coverage.status.missing');
      default: return status;
    }
  };

  return (
    <Card>
      <Text>{t('coverage.title')}</Text>
      <Badge tone="success">{getStatusLabel(field.status)}</Badge>
    </Card>
  );
}
```

**关键点**:
- 函数式组件优先使用 `useTranslation` hook
- 简单直接，没有包装器
- 自动订阅语言变更

---

### 2. 动态字段映射（枚举 -> 翻译）

**✅ 最佳做法** - CoverageCard.jsx (lines 37-58)

```javascript
// 方法 1: 函数中定义映射，接收 t
const getStatusTone = (status) => {
  switch (status) {
    case 'UP_TO_DATE': return 'success';
    case 'STALE': return 'warning';
    case 'MISSING': return 'critical';
    default: return 'neutral';
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case 'UP_TO_DATE': return t('coverage.status.upToDate');
    case 'STALE': return t('coverage.status.stale');
    // ...
    default: return status;  // 降级到原始值
  }
};

// 使用时
<Badge tone={getStatusTone(field.status)}>
  {getStatusLabel(field.status)}
</Badge>
```

**优势**:
- 清晰的枚举映射
- 提供降级方案（如果翻译缺失则显示原始值）
- 易于维护和扩展

---

### 3. 文件头部定义翻译键映射

**✅ 最佳做法** - PlanCard.jsx (lines 5-12)

```javascript
// 将翻译键映射与业务逻辑分离
const FEATURE_LABELS = (t) => ({
  autoTranslation: t('plans.features.autoTranslation'),
  editTranslation: t('plans.features.editTranslation'),
  templateTranslation: t('plans.features.templateTranslation'),
  languageSwitcher: t('plans.features.languageSwitcher'),
  prioritySupport: t('plans.features.prioritySupport'),
  dedicatedSuccess: t('plans.features.dedicatedSuccess')
});

// 后续在组件中使用
const features = Object.entries(plan.features || {})
  .filter(([, enabled]) => enabled)
  .map(([key]) => FEATURE_LABELS(t)[key] || key);
```

**优势**:
- 翻译键声明式列表，易于审计
- 支持动态特性列表，自动获取翻译
- 失败时降级到键名本身

---

### 4. 带参数的翻译（模板插值）

**✅ 最佳做法** - CoverageCard.jsx & PlanCard.jsx

**翻译文件中定义**:
```json
{
  "coverage": {
    "totalFields": "Total: {{count}} fields",
    "staleWarning": "{{percent}}% of translations are outdated"
  },
  "plans": {
    "languages": {
      "specific": "Support {{count}} languages"
    },
    "creditsPerMonth": "{{credits}} credits/month (~{{chars}} characters)"
  }
}
```

**在组件中使用**:
```javascript
// 数字插值
<Text>{t('coverage.totalFields', { count: counts.total })}</Text>

// 百分比插值
<Banner>
  <Text>{t('coverage.staleWarning', { percent: percentages.stale })}</Text>
</Banner>

// 多参数
<Text>
  {t('plans.creditsPerMonth', { 
    credits: plan.monthlyCredits.toLocaleString(), 
    chars: formatNumber(approxChars) 
  })}
</Text>
```

**关键点**:
- 使用 `{{paramName}}` 语法
- 在 Hook 调用时通过对象传递参数
- 参数可以是任何 JavaScript 值

---

### 5. 类组件中使用 withTranslation

**✅ 最佳做法** - ErrorBoundary.jsx (lines 410-411)

```javascript
// 定义基础类组件
class ErrorBoundaryBase extends React.Component {
  componentDidCatch(error, errorInfo) {
    const { t } = this.props;  // 从 props 获取 t
    UILogger.error(`${t('errors.boundary.captured')}: ${error.message}`, ...);
  }

  render() {
    const { t } = this.props;
    return (
      <Page title={t('errors.boundary.pageTitle')}>
        {/* ... */}
      </Page>
    );
  }
}

// 使用 withTranslation 包装导出
export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
```

**关键点**:
- 类组件使用 `withTranslation()` HOC 包装
- `t` 通过 `props` 传递给类组件
- 需要在文件末尾导出包装后的版本

---

### 6. 函数式包装类组件的 i18n

**✅ 最佳做法** - ErrorBoundary.jsx (lines 414-439)

```javascript
// 在函数组件中获取 t，然后传递给类组件
export function withErrorBoundary(Component, options = {}) {
  const Wrapped = (props) => {
    const { t } = useTranslation();  // 在函数组件中使用 hook
    const { componentName = Component.displayName, ...boundaryProps } = options;

    return (
      <ErrorBoundary 
        componentName={componentName}
        {...boundaryProps}
        t={t}  // 显式传递给类组件
      >
        <Component {...props} />
      </ErrorBoundary>
    );
  };

  Wrapped.displayName = `WithErrorBoundary(${Component.displayName || ...})`;
  return Wrapped;
}
```

**优势**:
- 允许在类组件中使用现代 hook
- 解耦类组件和翻译系统
- 支持条件渲染和高级逻辑

---

### 7. 语言切换器实现

**✅ 最佳做法** - LanguageSwitcher.tsx

```javascript
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();  // 获取 i18n 对象和 t 函数
  const [active, setActive] = useState(false);
  const fetcher = useFetcher();

  // 动态生成选项，使用翻译
  const localeOptions = [
    { code: "en", label: t("languageSwitcher.en") },
    { code: "zh-CN", label: t("languageSwitcher.zh-CN") },
  ];

  // 显示当前语言
  const current =
    localeOptions.find((item) => item.code === i18n.resolvedLanguage)?.label ||
    localeOptions[0].label;

  const handleChange = async (locale: string) => {
    try {
      await i18n.changeLanguage(locale);  // 改变语言
    } catch (e) {
      console.warn("[i18n] changeLanguage failed", e?.message || e);
    }
    // 同步到服务端
    fetcher.submit({ locale }, { method: "post", action: "/api/set-locale" });
  };

  return (
    <Popover active={active}>
      <ActionList
        items={[
          { content: localeOptions[0].label, onAction: () => handleChange("en") },
          { content: localeOptions[1].label, onAction: () => handleChange("zh-CN") },
        ]}
      />
    </Popover>
  );
}
```

**关键点**:
- 同时获取 `i18n` 对象和 `t` 函数
- `i18n.resolvedLanguage` 获取当前语言
- `i18n.changeLanguage()` 切换语言
- 通过 API 同步到服务端（持久化）

---

## 常见反模式与陷阱

### ❌ 反模式 1: 在模板字符串中调用 t()

**不推荐**:
```javascript
// ❌ 错误：模板中硬调用
content: `${t('someKey')}`

// ❌ 错误：作为对象属性值
title: t('someKey')  // 如果这是在 render 之外定义的
```

**问题**:
- 翻译发生在组件外，对象初始化时执行
- 语言切换时不会重新求值
- 翻译不会响应式更新

**改进**:
```javascript
// ✅ 正确：在 render 时计算
const MyComponent = () => {
  const { t } = useTranslation();
  const config = {
    title: t('someKey'),  // 现在在 render 时调用
    description: t('anotherKey')
  };
  return <Component config={config} />;
};
```

---

### ❌ 反模式 2: 在条件中使用 key，而不是 t()

**不推荐**:
```javascript
// ❌ 错误：将状态值直接作为翻译 key
const statusKey = resource.status;  // "pending", "synced", "failed"
<Text>{statusKey}</Text>  // 显示英文 status，未翻译
```

**改进**:
```javascript
// ✅ 正确：映射状态到翻译 key
const getStatusLabel = (status) => {
  const keyMap = {
    'pending': 'status.pending',
    'synced': 'status.synced',
    'failed': 'status.failed'
  };
  return t(keyMap[status] || 'status.unknown');
};

<Text>{getStatusLabel(resource.status)}</Text>
```

---

### ❌ 反模式 3: 在 API 响应中混入未翻译的文本

**不推荐**:
```javascript
// ❌ 错误：从 API 返回的状态字符串直接使用
const translations = await fetch('/api/translations');
const data = await data.json();
// data.status = "completed" (来自服务端，未翻译)
<Badge>{data.status}</Badge>  // 显示英文，用户看不懂
```

**改进**:
```javascript
// ✅ 正确：在客户端翻译 API 响应数据
const getStatusLabel = (status) => {
  const keyMap = {
    'completed': 'translation.status.completed',
    'failed': 'translation.status.failed'
  };
  return t(keyMap[status] || 'translation.status.unknown');
};

const translations = await fetch('/api/translations');
const data = await data.json();
<Badge>{getStatusLabel(data.status)}</Badge>
```

---

### ❌ 反模式 4: 忘记在 JSON 中定义所有翻译

**不推荐**:
```javascript
// ❌ 代码中调用，但 JSON 中缺失
t('feature.notInJson')  // 翻译文件中找不到这个 key

// 导致:
// - 开发时未察觉
// - 用户看到原始 key: "feature.notInJson"
// - 难以调试
```

**改进**:
```javascript
// ✅ 始终在翻译文件中定义所有 key
// locales/en/common.json
{
  "feature": {
    "notInJson": "This feature is now available"
  }
}

// 同时为所有支持的语言定义
// locales/zh-CN/common.json
{
  "feature": {
    "notInJson": "此功能现已提供"
  }
}
```

---

### ❌ 反模式 5: 在 JS 常量中硬编码文本，而不使用翻译

**不推荐**:
```javascript
// ❌ 错误：常量中硬编码英文
const STATUS_LABELS = {
  pending: "Pending",
  synced: "Synced",
  failed: "Failed"
};

// 这些文本无法翻译
<Badge>{STATUS_LABELS[status]}</Badge>
```

**改进**:
```javascript
// ✅ 正确：通过 t() 映射获取标签
const getStatusLabel = (status, t) => {
  const keyMap = {
    'pending': 'status.pending',
    'synced': 'status.synced',
    'failed': 'status.failed'
  };
  return t(keyMap[status]);
};

// 或使用 Hook（函数组件）
const MyComponent = () => {
  const { t } = useTranslation();
  const label = getStatusLabel(status, t);
  return <Badge>{label}</Badge>;
};
```

---

### ❌ 反模式 6: 在文件头部定义需要 t 的常量（错误的位置）

**不推荐**:
```javascript
// ❌ 错误：在组件外部调用 t()，且无法获取
const LABELS = {
  en: {
    status: t('status.pending')  // t 不存在！
  }
};

export function MyComponent() {
  // ...
}
```

**改进**:
```javascript
// ✅ 方法 1：在组件内定义（推荐）
export function MyComponent() {
  const { t } = useTranslation();
  const LABELS = {
    status: t('status.pending')
  };
  return <div>{LABELS.status}</div>;
}

// ✅ 方法 2：工厂函数接收 t（用于共享常量）
const createLabels = (t) => ({
  status: t('status.pending'),
  // ...
});

export function MyComponent() {
  const { t } = useTranslation();
  const LABELS = createLabels(t);
  return <div>{LABELS.status}</div>;
}

// ✅ 方法 3：直接在 JSX 中使用翻译（最简单）
export function MyComponent() {
  const { t } = useTranslation();
  return <div>{t('status.pending')}</div>;
}
```

---

### ❌ 反模式 7: 忘记语言切换时重新初始化组件

**不推荐**:
```javascript
// ❌ 错误：依赖缓存的翻译，不响应语言变更
const status = t('status.pending');  // 缓存在变量中
// 用户切换语言 → status 仍然是之前的语言

return <div>{status}</div>;  // 显示旧语言
```

**改进**:
```javascript
// ✅ 正确：每次 render 都重新计算
const MyComponent = () => {
  const { t } = useTranslation();
  // t() 在每次 render 时调用
  return <div>{t('status.pending')}</div>;
};

// useTranslation 会在语言改变时自动触发重新 render
```

---

### ❌ 反模式 8: 使用嵌套对象而不使用点符号

**不推荐**:
```json
{
  "errors": {
    "boundary": {
      "captured": "Error captured",
      "pageTitle": "Error Page"
    }
  }
}
```

```javascript
// ❌ 错误：使用嵌套对象访问
t('errors').boundary.captured  // 不正确的 API
```

**改进**:
```javascript
// ✅ 正确：使用点符号作为 key
t('errors.boundary.captured')  // i18next 的标准 API
```

---

## 最佳实践总结

### 原则

| 原则 | 说明 | 示例 |
|------|------|------|
| **声明式** | 在 JSX 中直接使用 `t()`，而不是在 JS 中缓存 | `<Text>{t('key')}</Text>` vs `const label = t('key')`  |
| **映射优先** | 对于枚举/状态，使用映射函数而不是硬编码 | `getStatusLabel(status)` 而不是 `STATUS[status]` |
| **降级方案** | 当翻译缺失时提供降级（原始值、key 名等） | `t(keyMap[status] \|\| 'unknown')` |
| **参数化** | 使用 `{{param}}` 模板而不是字符串拼接 | `t('key', { count: 5 })` vs `t('key') + count` |
| **集中管理** | 所有翻译 key 在 JSON 文件中集中定义 | `locales/{lang}/common.json` |
| **分离关注** | 分离翻译键定义和业务逻辑 | 顶部常量 + 组件逻辑分离 |
| **响应式** | 组件必须响应语言变更 | 每次 render 都调用 `t()`，不缓存 |

---

### 检查清单

实现 i18n 时的检查清单：

- [ ] 所有用户可见文本都在翻译 JSON 中定义
- [ ] 所有支持的语言都有完整的翻译（或 fallback）
- [ ] 使用 `useTranslation()` 获取 `t` 函数
- [ ] 动态文本（状态、枚举）都有映射函数
- [ ] 参数化使用 `{{param}}` 语法，不使用字符串拼接
- [ ] 类组件使用 `withTranslation()` 包装
- [ ] 每次 render 都调用 `t()`，不在组件外缓存翻译结果
- [ ] 提供降级方案处理缺失的翻译
- [ ] 语言切换时能自动更新 UI
- [ ] 翻译 key 使用点符号：`scope.feature.key`

---

## 常见场景解决方案

### 场景 1: 显示动态对象列表（如特性列表）

**需求**: 显示计划的特性列表，每个特性都需要翻译

**解决方案**:
```javascript
// ✅ 推荐方式
const FEATURE_LABELS = (t) => ({
  autoTranslation: t('plans.features.autoTranslation'),
  editTranslation: t('plans.features.editTranslation'),
  languageSwitcher: t('plans.features.languageSwitcher'),
});

export function PlanCard({ plan }) {
  const { t } = useTranslation();
  
  const features = Object.entries(plan.features || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => FEATURE_LABELS(t)[key] || key);  // 降级到 key

  return (
    <Card>
      <List>
        {features.map((feature) => (
          <List.Item key={feature}>{feature}</List.Item>
        ))}
      </List>
    </Card>
  );
}
```

---

### 场景 2: 显示 API 返回的状态字段

**需求**: 从 API 获取资源，显示其翻译后的状态

**解决方案**:
```javascript
// ✅ 推荐方式
const getStatusBadge = (resource, t) => {
  // 映射 API 返回的状态到翻译 key
  const statusKeyMap = {
    'pending': { key: 'resources.status.pending', tone: 'warning' },
    'synced': { key: 'resources.status.synced', tone: 'success' },
    'partial': { key: 'resources.status.partial', tone: 'attention' },
    'failed': { key: 'resources.status.failed', tone: 'critical' },
  };

  const config = statusKeyMap[resource.syncStatus];
  if (!config) return null;  // 降级：未知状态

  return (
    <Badge tone={config.tone}>
      {t(config.key)}
    </Badge>
  );
};

export function ResourceList({ resources }) {
  const { t } = useTranslation();

  return (
    <div>
      {resources.map(resource => (
        <div key={resource.id}>
          <Text>{resource.name}</Text>
          {getStatusBadge(resource, t)}
        </div>
      ))}
    </div>
  );
}
```

---

### 场景 3: 条件渲染不同的翻译文本

**需求**: 根据条件显示不同的翻译文本

**解决方案**:
```javascript
// ✅ 推荐方式
export function ErrorCard({ error }) {
  const { t } = useTranslation();

  const isNetworkError = error.message.includes('Failed to fetch');
  const errorKey = isNetworkError 
    ? 'errors.network.title'
    : 'errors.general.title';

  return (
    <Card>
      <Text as="h3">{t(errorKey)}</Text>
      <Text>
        {t(isNetworkError 
          ? 'errors.network.description'
          : 'errors.general.description'
        )}
      </Text>
    </Card>
  );
}
```

---

### 场景 4: 在错误消息中包含参数

**需求**: 显示错误信息，包含动态参数（如文件名、行号等）

**解决方案**:
```javascript
// locales/en/common.json
{
  "errors": {
    "fileNotFound": "File '{{filename}}' not found",
    "validationFailed": "Validation failed for field '{{field}}' with value '{{value}}'",
    "rateLimitExceeded": "Rate limit exceeded. Retry after {{seconds}} seconds."
  }
}

// locales/zh-CN/common.json
{
  "errors": {
    "fileNotFound": "找不到文件 '{{filename}}'",
    "validationFailed": "字段 '{{field}}' 的值 '{{value}}' 验证失败",
    "rateLimitExceeded": "速率限制已超出。请在 {{seconds}} 秒后重试。"
  }
}

// 在组件中使用
const { t } = useTranslation();

const errorMsg = t('errors.fileNotFound', { filename: 'config.json' });
// 结果: "File 'config.json' not found" (英文) 或 "找不到文件 'config.json'" (中文)

const validationMsg = t('errors.validationFailed', { 
  field: 'email', 
  value: 'invalid@' 
});
// 结果: "Validation failed for field 'email' with value 'invalid@'"
```

---

### 场景 5: 复数形式处理

**需求**: 显示数量相关的文本，需要处理单数/复数

**翻译文件**:
```json
{
  "items": {
    "count_one": "{{count}} item",
    "count_other": "{{count}} items"
  }
}
```

**在组件中使用**:
```javascript
const { t } = useTranslation();

// i18next 自动处理复数
const itemText = t('items.count', { count: 1 });  // "1 item"
const itemsText = t('items.count', { count: 5 }); // "5 items"
```

---

### 场景 6: 在类组件中处理 i18n

**需求**: 在类组件（如 ErrorBoundary）中使用翻译

**解决方案**:
```javascript
// ✅ 方法 1：使用 withTranslation HOC
class ErrorBoundaryBase extends React.Component {
  componentDidCatch(error, errorInfo) {
    const { t } = this.props;  // 从 props 获取
    console.error(t('errors.boundary.captured'));
  }

  render() {
    const { t } = this.props;
    return <Page title={t('errors.boundary.pageTitle')} />;
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);

// ✅ 方法 2：用函数组件包装
export function withErrorBoundary(Component, options = {}) {
  const Wrapped = (props) => {
    const { t } = useTranslation();
    return (
      <ErrorBoundary t={t} {...options}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
  return Wrapped;
}
```

---

### 场景 7: 动态加载额外的翻译命名空间

**需求**: 应用增长，单个 `common.json` 太大，需要分割成多个命名空间

**翻译文件结构**:
```
app/locales/
├── en/
│   ├── common.json       # 核心
│   ├── billing.json      # 账单
│   └── errors.json       # 错误
└── zh-CN/
    ├── common.json
    ├── billing.json
    └── errors.json
```

**在服务端配置**:
```javascript
// app/i18n.server.ts
export const i18nServer = new RemixI18Next({
  detection: { /* ... */ },
  defaultNS: 'common',
  fallbackNS: 'common',
  ns: ['common', 'billing', 'errors'],  // 声明所有命名空间
  // ...
});
```

**在组件中使用**:
```javascript
// 使用特定命名空间
const { t: tBilling } = useTranslation('billing');
const { t: tErrors } = useTranslation('errors');

// 或同时使用多个
const { t: commonT } = useTranslation('common');
const { t: billingT } = useTranslation('billing');

return (
  <div>
    <Text>{commonT('pages.home.title')}</Text>
    <Text>{billingT('plans.current')}</Text>
  </div>
);
```

---

## 代码示例库

### 示例 1: 完整的多状态组件

```javascript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Badge, Button, BlockStack, Text } from '@shopify/polaris';

// 常量：定义状态映射
const STATUS_CONFIG = {
  'pending': { key: 'translation.status.pending', tone: 'warning' },
  'translating': { key: 'translation.status.translating', tone: 'info' },
  'syncing': { key: 'translation.status.syncing', tone: 'info' },
  'synced': { key: 'translation.status.synced', tone: 'success' },
  'partial': { key: 'translation.status.partial', tone: 'attention' },
  'failed': { key: 'translation.status.failed', tone: 'critical' },
};

// 辅助函数
const getStatusLabel = (status, t) => {
  const config = STATUS_CONFIG[status];
  return config ? t(config.key) : status;  // 降级到原始值
};

const getStatusTone = (status) => {
  return STATUS_CONFIG[status]?.tone || 'default';
};

// 组件
export function TranslationCard({ resource, onRetry, onPublish }) {
  const { t } = useTranslation();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry(resource.id);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          {resource.title}
        </Text>

        <div>
          <Badge tone={getStatusTone(resource.status)}>
            {getStatusLabel(resource.status, t)}
          </Badge>
        </div>

        {resource.error && (
          <Text tone="critical">
            {t('translation.error', { message: resource.error })}
          </Text>
        )}

        <div>
          {resource.status === 'failed' && (
            <Button 
              onClick={handleRetry} 
              disabled={isRetrying}
            >
              {t('actions.retry')}
            </Button>
          )}
          {resource.status === 'synced' && (
            <Button onClick={() => onPublish(resource.id)}>
              {t('actions.publish')}
            </Button>
          )}
        </div>
      </BlockStack>
    </Card>
  );
}
```

---

### 示例 2: 带参数的列表展示

```javascript
import { useTranslation } from 'react-i18next';
import { List, Text, Card, BlockStack } from '@shopify/polaris';

export function SummaryCard({ statistics }) {
  const { t } = useTranslation();
  const { 
    totalResources, 
    translatedCount, 
    failedCount,
    avgTranslationTime 
  } = statistics;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          {t('summary.title')}
        </Text>

        <List>
          <List.Item>
            {t('summary.totalResources', { count: totalResources })}
          </List.Item>
          <List.Item>
            {t('summary.translated', { count: translatedCount })}
          </List.Item>
          <List.Item tone={failedCount > 0 ? 'critical' : undefined}>
            {t('summary.failed', { count: failedCount })}
          </List.Item>
          <List.Item>
            {t('summary.avgTime', { seconds: avgTranslationTime.toFixed(1) })}
          </List.Item>
        </List>
      </BlockStack>
    </Card>
  );
}
```

**翻译文件**:
```json
{
  "summary": {
    "title": "Translation Summary",
    "totalResources": "Total resources: {{count}}",
    "translated": "Successfully translated: {{count}}",
    "failed": "Failed: {{count}}",
    "avgTime": "Average time: {{seconds}}s per resource"
  }
}
```

---

### 示例 3: 条件翻译和降级

```javascript
import { useTranslation } from 'react-i18next';
import { Banner, Text, Card, BlockStack } from '@shopify/polaris';

export function ErrorBanner({ error, isRetryable }) {
  const { t } = useTranslation();

  // 错误分类
  const errorType = error.code?.startsWith('NETWORK_')
    ? 'network'
    : error.code?.startsWith('VALIDATION_')
    ? 'validation'
    : 'general';

  // 构造翻译 key
  const titleKey = `errors.${errorType}.title`;
  const descKey = `errors.${errorType}.description`;

  return (
    <Banner tone="critical">
      <BlockStack gap="200">
        <Text as="h3" variant="headingMd">
          {t(titleKey)}  {/* 使用动态 key */}
        </Text>
        <Text>
          {t(descKey)}
        </Text>
        
        {/* 参数化错误详情 */}
        {error.details && (
          <Text variant="bodySm" tone="subdued">
            {t('errors.details', { 
              code: error.code, 
              message: error.details 
            })}
          </Text>
        )}

        {/* 条件渲染建议 */}
        {isRetryable && (
          <Text tone="info">
            {t('errors.retryable.suggestion')}
          </Text>
        )}
      </BlockStack>
    </Banner>
  );
}
```

---

## 总结

### 做

✅ 在函数组件中使用 `useTranslation()` hook  
✅ 为动态内容创建映射函数  
✅ 每次 render 时调用 `t()`，不缓存结果  
✅ 使用参数化：`t('key', { param: value })`  
✅ 在 JSON 文件中集中定义所有翻译  
✅ 为缺失的翻译提供降级方案  
✅ 使用点符号定义嵌套翻译 key  

### 不做

❌ 不在组件外缓存翻译结果  
❌ 不在 JS 中硬编码用户可见文本  
❌ 不在模板字符串中直接拼接 `t()` 调用  
❌ 不忘记为所有语言定义翻译  
❌ 不在文件头部定义需要 `t` 的常量  
❌ 不忘记类组件需要 `withTranslation()` 包装  

---

**最后更新**: 2025-11-25
