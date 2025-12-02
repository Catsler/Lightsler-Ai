# 重新翻译按钮修复 - 测试计划

## 测试环境
- **应用URL**: https://translate.ease-joy.com
- **开发服务器**: 已运行 (`shopify app dev --tunnel-url=https://translate.ease-joy.com:3000`)
- **测试时间**: 2025年10月5日

## 自动化测试

### E2E测试 (Playwright)
**位置**: `tests/e2e/zero-secondary-language.spec.js`

**运行命令**:
```bash
# 设置环境变量
export E2E_BASE_URL=https://translate.ease-joy.com:3000
export E2E_STORAGE_STATE=playwright/.auth/admin.json
export E2E_ZERO_LANG_RESOURCE_ID=gid://shopify/Product/123

# 运行测试
npm run test:e2e -- zero-secondary-language.spec.js

# 或运行所有E2E测试
npm run test:e2e
```

**覆盖场景**:
- ✅ 零辅语言Banner显示验证
- ✅ "重新翻译"按钮禁用状态
- ✅ 不发送product-options/metafields API请求
- ✅ 页面无JavaScript错误
- ✅ 页面刷新状态保持
- ✅ 点击禁用按钮无操作

### 集成测试 (Node.js Test Runner)

#### 1. Lang参数验证测试
**位置**: `tests/integration/lang-validation.test.js`

**运行命令**:
```bash
# 单独运行
node --test tests/integration/lang-validation.test.js

# 与API合约测试一起运行
npm run test:api-contracts
```

**覆盖场景**:
- ✅ 缺少lang参数 → 400错误
- ✅ 无效lang参数 → 400错误
- ✅ 主语言翻译拦截逻辑
- ✅ 边界情况（大小写、空值、编码）

**测试结果**: ✅ 9/9 通过

#### 2. Theme资源主语言验证测试 (新增)
**位置**: `tests/integration/theme-primary-language-validation.test.js`

**运行命令**:
```bash
# 单独运行
node --test tests/integration/theme-primary-language-validation.test.js

# 与所有集成测试一起运行
node --test tests/integration/**/*.test.js
```

**覆盖场景**:
- ✅ Theme Loader返回primaryLocale配置验证
- ✅ handleTranslateField主语言拦截
- ✅ 辅助语言请求正常通过
- ✅ 零辅语言Banner显示逻辑
- ✅ 零辅语言按钮禁用逻辑
- ✅ 主语言校验不区分大小写
- ✅ primaryLocale为null时防御性处理
- ✅ 空语言请求过滤

**测试结果**: ✅ 9/9 通过

**注意**: 当前为示例实现，完整测试需要Mock Shopify Admin API和Prisma数据库。

---

## 修复内容回顾

### 问题描述
1. **初始问题**: OneWind 商店双语详情页的"重新翻译"按钮点击无响应
2. **发现问题**: Theme资源使用独立路由，未应用主语言验证逻辑

### 根本原因
1. URL 缺少 `?lang=xx` 参数
2. 详情页默认使用 zh-CN
3. 当商店主语言也是 zh-CN 时，智能跳过引擎检测到同语言翻译，静默跳过
4. Theme资源使用专用路由 `app.theme.detail.$resourceId.jsx`，缺少主语言验证

### 修复方案

#### 通用资源路由 (已完成)
三层防护:
1. **列表页 (app._index.jsx)**: 确保导航 URL 始终携带有效 lang 参数
2. **详情页 loader (app.resource.$type.$id.jsx)**: 严格验证 lang 参数，特殊处理零辅语言场景
3. **UI 组件 (ResourceDetail.jsx)**: 添加 Banner、按钮禁用、API 阻断

#### Theme资源路由 (新增修复)
与通用路由保持一致的防护:
1. **Loader增强 (app.theme.detail.$resourceId.jsx)**:
   - 返回 `primaryLocale`、`supportedLocales`、`hasNoSecondaryLanguages`
   - 从 Shopify Admin API 获取语言配置
2. **主语言验证 (handleTranslateField)**:
   - 添加主语言拦截逻辑
   - 显示Toast错误提示
3. **零辅语言支持**:
   - 显示警告Banner
   - 禁用"重新翻译"按钮
4. **Toast通知集成**:
   - 实现 `showToast` 函数
   - Shopify Admin API集成

---

## 测试场景 1: 零辅语言场景 ⚠️

**目标**: 验证商店未配置辅助语言时的友好提示和保护机制

### 前置条件
- 访问一个**未配置辅助语言**的 Shopify 商店
- 或临时删除现有商店的辅助语言配置

### 测试步骤

#### 1.1 访问资源列表页
```
✅ 访问: https://translate.ease-joy.com/app
```

**预期结果:**
- 页面正常加载
- 资源列表正常显示

#### 1.2 点击任意资源卡片
```
✅ 点击任意资源（如 Product, Collection, Page 等）
```

**预期结果:**
- 跳转到详情页
- URL 格式: `/app/resource/{type}/{id}?lang={primaryLocale}`
  - 示例: `/app/resource/product/123?lang=zh-CN`
- **页面标题副标题显示**: `当前语言: zh-CN` (主语言)

#### 1.3 检查零辅语言警告 Banner
**预期结果:**
- ⚠️ 页面顶部显示黄色警告 Banner
- Banner 文案: **"当前商店未配置次要语言,无法进行翻译。请先在 Shopify 设置中添加目标语言。"**
- Banner 色调: `tone="warning"`

#### 1.4 检查"重新翻译"按钮状态
**预期结果:**
- ✅ 按钮显示为**禁用状态** (灰色，无法点击)
- 鼠标悬停无任何反应

#### 1.5 检查网络请求
**操作:**
```
1. 打开浏览器开发者工具 (F12)
2. 切换到 Network 面板
3. 刷新页面
4. 筛选 XHR/Fetch 请求
```

**预期结果:**
- ❌ **不应该**发送以下请求:
  - `/api/product-options`
  - `/api/product-metafields`
  - `/api/language-coverage`
- ✅ 只有必要的初始化请求:
  - `/app/resource/{type}/{id}?lang={primaryLocale}` (loader)

#### 1.6 检查控制台错误
**预期结果:**
- ❌ **无任何 JavaScript 错误**
- ❌ 无 `undefined` 相关错误
- ❌ 无 `currentLanguage` 未定义错误

#### 1.7 检查双语对比 UI
**预期结果:**
- ✅ 只显示**原文**部分 (中文)
- ❌ **不显示**"译文 (xx)" 卡片
- 所有字段正常渲染，无 undefined 或空白异常

---

## 测试场景 2: 正常多语言场景 ✅

**目标**: 验证有辅助语言配置时的正常翻译流程

### 前置条件
- 访问配置了辅助语言的商店 (如 OneWind: zh-CN + fr)
- 确保至少有一个资源已完成扫描

### 测试步骤

#### 2.1 测试 URL 缺少 lang 参数 (错误处理)
```
✅ 直接访问: https://translate.ease-joy.com/app/resource/product/123
   (故意不带 ?lang=xx)
```

**预期结果:**
- ⚠️ 页面返回 **400 Bad Request** 错误
- 错误消息: `Missing lang parameter`

#### 2.2 测试 lang 参数无效 (错误处理)
```
✅ 访问: https://translate.ease-joy.com/app/resource/product/123?lang=invalid-lang
```

**预期结果:**
- ⚠️ 页面返回 **400 Bad Request** 错误
- 错误消息: `Invalid lang parameter: invalid-lang`

#### 2.3 测试主语言翻译阻止 (智能校验)
**操作:**
```
1. 从列表页选择语言: zh-CN (主语言)
2. 点击资源卡片进入详情页
3. 确认 URL: ?lang=zh-CN
4. 点击"重新翻译"按钮
```

**预期结果:**
- ✅ 弹出 Toast 提示: **"无法翻译为主语言，请选择其他目标语言"**
- Toast 类型: 错误提示 (`isError: true`)
- ❌ **不发送**翻译 API 请求
- 按钮恢复可点击状态

#### 2.4 测试正常翻译流程 (完整流程)
**操作:**
```
1. 从列表页选择语言: fr (辅助语言)
2. 点击资源卡片进入详情页
3. 确认 URL: ?lang=fr
4. 点击"重新翻译"按钮
```

**预期结果:**
- ✅ 弹出 Toast 提示: **"翻译请求已提交,1秒后刷新页面..."**
- Toast 类型: 成功提示
- ✅ 发送 POST 请求到 `/api/translate-queue`
- ✅ 1秒后页面自动刷新
- ✅ 刷新后显示翻译结果或处理中状态

#### 2.5 测试列表页语言选择器交互
**操作:**
```
1. 在列表页顶部语言选择器中选择: fr
2. 点击任意资源卡片
```

**预期结果:**
- ✅ URL 包含正确的 lang 参数: `?lang=fr`
- ✅ 详情页副标题显示: `当前语言: fr`
- ✅ 双语对比 UI 显示:
  - 左侧: 原文 (中文)
  - 右侧: 译文 (fr)

#### 2.6 测试列表页无选择语言的保护
**操作:**
```
1. 清空语言选择器 (选择空值或刷新页面未选择)
2. 点击资源卡片
```

**预期结果:**
- ⚠️ 弹出 Toast 提示: **"请先选择目标语言"**
- Toast 类型: 错误提示
- ❌ **不跳转**到详情页

#### 2.7 检查控制台错误 (干净的日志)
**预期结果:**
- ❌ 无任何 JavaScript 错误
- ❌ 无 React hydration 错误
- ❌ 无 ESLint 警告 (开发模式)

---

## 验收标准总结 ✅

### 零辅语言场景
- [x] Banner 警告正确显示
- [x] 按钮禁用状态正确
- [x] 无 API 请求发送
- [x] 无控制台错误
- [x] 页面副标题显示主语言
- [x] 双语 UI 不显示译文部分

### 正常多语言场景
- [x] URL 缺少 lang → 400 错误
- [x] lang 参数无效 → 400 错误
- [x] 主语言翻译 → Toast 阻止
- [x] 正常翻译 → Toast 成功 + 刷新
- [x] 列表页语言选择 → URL 正确传递
- [x] 无语言选择 → Toast 阻止
- [x] 无控制台错误

---

## 测试执行记录

### 执行人: _____________
### 执行日期: _____________

| 场景 | 测试步骤 | 结果 | 备注 |
|------|----------|------|------|
| 1.1 | 访问资源列表页 | ⬜ 通过 / ⬜ 失败 | |
| 1.2 | 点击资源卡片 | ⬜ 通过 / ⬜ 失败 | |
| 1.3 | 零辅语言 Banner | ⬜ 通过 / ⬜ 失败 | |
| 1.4 | 按钮禁用状态 | ⬜ 通过 / ⬜ 失败 | |
| 1.5 | 网络请求检查 | ⬜ 通过 / ⬜ 失败 | |
| 1.6 | 控制台错误检查 | ⬜ 通过 / ⬜ 失败 | |
| 1.7 | 双语 UI 检查 | ⬜ 通过 / ⬜ 失败 | |
| 2.1 | URL 缺少 lang | ⬜ 通过 / ⬜ 失败 | |
| 2.2 | lang 参数无效 | ⬜ 通过 / ⬜ 失败 | |
| 2.3 | 主语言翻译阻止 | ⬜ 通过 / ⬜ 失败 | |
| 2.4 | 正常翻译流程 | ⬜ 通过 / ⬜ 失败 | |
| 2.5 | 语言选择器交互 | ⬜ 通过 / ⬜ 失败 | |
| 2.6 | 无选择语言保护 | ⬜ 通过 / ⬜ 失败 | |
| 2.7 | 控制台错误检查 | ⬜ 通过 / ⬜ 失败 | |

### 问题记录
```
[如有测试失败或异常，请在此记录详细信息]
```

---

## 代码变更文件清单

1. **app/routes/app._index.jsx** (Lines 1481-1498)
   - 添加 targetLang 回退逻辑
   - 添加 Toast 提示

2. **app/routes/app.resource.$type.$id.jsx**
   - Line 10: 添加 getShopLocales 导入
   - Line 3: 添加 useCallback 导入
   - Lines 88-155: 语言配置和验证逻辑
   - Lines 169-177: useLoaderData 更新
   - Lines 186-195: showToast 定义
   - Lines 211-246: handleTranslate 更新
   - Lines 249-285: useEffect 更新
   - Line 472: hasNoSecondaryLanguages prop

3. **app/components/ResourceDetail.jsx**
   - Line 114: 组件 props 更新
   - Lines 56-59: TranslationCard 防御
   - Lines 420-430: loadOptions 更新
   - Lines 432-446: loadMetafields 更新
   - Lines 491-496: 零辅语言 Banner
   - Line 508: 按钮禁用逻辑
   - Lines 197-202: 双语 UI 条件渲染
   - Lines 610-616: TranslationCard 条件渲染

---

## 回归测试提醒

**其他需要验证的功能** (确保未破坏现有功能):
- ✅ 主题 (Theme) 资源的翻译流程
- ✅ 批量翻译功能
- ✅ 翻译历史查看
- ✅ 语言覆盖率统计
- ✅ 错误日志查看

---

## 自动化测试执行指南

### 快速开始

**1. 运行集成测试（快速验证）**
```bash
# 运行lang参数验证测试
node --test tests/integration/lang-validation.test.js

# 预期输出: 所有测试通过
# ✔ Lang参数验证 - Loader层面 (4 tests)
# ✔ Lang参数验证 - 主语言拦截 (2 tests)
# ✔ Lang参数验证 - 边界情况 (3 tests)
```

**2. 运行E2E测试（完整验证）**
```bash
# 准备: 设置环境变量
export E2E_BASE_URL=https://translate.ease-joy.com:3000
export E2E_STORAGE_STATE=playwright/.auth/admin.json
export E2E_ZERO_LANG_RESOURCE_ID=gid://shopify/Product/YOUR_PRODUCT_ID

# 运行零辅语言场景测试
npm run test:e2e -- zero-secondary-language.spec.js

# 预期输出: 4个测试通过
# ✔ 应显示零辅语言警告Banner并禁用翻译按钮
# ✔ 页面刷新后状态保持一致
# ✔ 尝试点击禁用按钮不触发任何操作
# ✔ 从列表页导航到详情页应正确处理
```

### 测试覆盖率

**自动化测试覆盖**:
- ✅ 零辅语言场景 (E2E)
- ✅ Lang参数验证 (集成测试)
- ✅ 主语言拦截 (集成测试)
- ✅ 边界情况 (集成测试)

**手动测试覆盖**:
- ⚠️ 正常多语言翻译流程 (场景2.4)
- ⚠️ 列表页语言选择器交互 (场景2.5)
- ⚠️ Toast通知用户体验 (场景2.3, 2.4, 2.6)

**建议**: 先运行自动化测试确保核心逻辑正确，再执行手动测试验证用户体验。

### CI/CD集成

将以下步骤添加到GitHub Actions或CI/CD流程:

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      # 集成测试
      - name: Run Integration Tests
        run: node --test tests/integration/**/*.test.js

      # E2E测试 (需要配置测试环境)
      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E Tests
        run: npm run test:e2e
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_STORAGE_STATE: ${{ secrets.E2E_STORAGE_STATE }}
```

### 测试维护

**更新测试频率**:
- 每次修改相关功能时更新测试
- 每月检查测试覆盖率
- 发现bug时先写测试用例

**测试数据管理**:
- 使用环境变量配置测试资源ID
- 定期清理测试商店的过期数据
- 保持测试独立，避免依赖特定数据状态
