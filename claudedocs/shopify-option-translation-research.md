# Shopify Option 翻译官方文档调研报告

**调研日期**: 2025-10-14
**API 版本**: 2025-07
**调研范围**: Shopify 官方文档 + 开发者社区讨论

---

## 📚 官方 API 文档发现

### TranslatableResourceType Enum（2025-07 版本）

**确认包含的资源类型**:
- ✅ `PRODUCT` - 产品主体
- ✅ `PRODUCT_OPTION` - 产品选项（如 "Color", "Size"）
- ✅ `PRODUCT_OPTION_VALUE` - 产品选项值（如 "Red", "Blue", "12ft"）

**文档链接**: https://shopify.dev/docs/api/admin-graphql/2025-07/enums/TranslatableResourceType

### ProductOptionValue 对象（2025-07 版本）

**可用字段**:
```graphql
type ProductOptionValue {
  id: ID!
  name: String!
  hasVariants: Boolean!
  translations: [Translation!]!  # ← 关键字段
  swatch: ProductOptionValueSwatch
}
```

**关键信息**:
- ✅ 实现了 `HasPublishedTranslations` 接口
- ✅ 有 `translations` 字段可读取已发布的翻译
- ❌ 不实现 `TranslatableResource` 接口（这是矛盾点）

**文档链接**: https://shopify.dev/docs/api/admin-graphql/2025-07/objects/ProductOptionValue

### translationsRegister Mutation

**用途**: 创建或更新资源的翻译

**输入参数**:
```graphql
mutation translationsRegister(
  $resourceId: ID!
  $translations: [TranslationInput!]!
) {
  translationsRegister(
    resourceId: $resourceId
    translations: $translations
  ) {
    userErrors { field message }
    translations { key locale value }
  }
}
```

**TranslationInput 结构**:
```graphql
input TranslationInput {
  locale: String!                      # 语言代码（如 "de"）
  key: String!                         # 字段名（如 "name"）
  value: String!                       # 翻译后的值
  translatableContentDigest: String!   # 内容摘要（必需）
  marketId: ID                         # 可选的市场ID
}
```

**关键要求**:
- 必须提供 `translatableContentDigest`（从 translatableResource 查询获取）
- 需要 `write_translations` 权限

**文档链接**: https://shopify.dev/docs/api/admin-graphql/2025-07/mutations/translationsRegister

---

## 🌐 Shopify Community 社区讨论

### 讨论1: Gap in Translations API for Product Options

**链接**: https://community.shopify.com/t/gap-in-translations-api-for-product-options/87810

**核心问题**:
> "According to the Translations API documentation, the only translatable field for the type PRODUCT_OPTION is 'name'. There is no option to set translations for the option's values."

**社区成员确认**:
- Shaibt: 报告无法翻译 option values
- Francois_paris: 尝试使用 ProductVariant 翻译但出现重复问题
- Kalen_Jordan: 建议通过 variant 的 translatableContent

**当前状态**:
- ❌ 无官方 Shopify 回复
- ❌ 无明确的解决方案
- ⚠️ 评论："Makes the Admin API unusable for presenting product option values in a multi-language setting"

**不稳定版本提示**:
- 提到 unstable API 中有 `ProductOptionValue` 对象
- 暗示 Shopify 可能计划在未来支持

### 讨论2: How to Translate Product Variants Options

**链接**: https://community.shopify.com/t/how-to-translate-product-variants-options-name-and-value-using-graphql/278591

**重要更新**（2024-04 版本开始）:
> "As of API version 2024-04, PRODUCT_VARIANT is no longer a valid translatable resource type. Use PRODUCT_OPTION_VALUE instead."

**推荐方法**:
1. 查询产品获取 option IDs:
```graphql
query {
  product(id: "gid://shopify/Product/7763887489124") {
    options {
      id
      name
      optionValues {
        id
        name
      }
    }
  }
}
```

2. 使用 option 或 optionValue 的 GID 调用 translationsRegister:
- Option name: `gid://shopify/ProductOption/{option_id}`
- Option value: `gid://shopify/Product/{product_id}/ProductOption/{option_id}`

**报告的问题**:
- ⚠️ 翻译 option values 会创建重复条目
- ⚠️ 跨 variants 共享的 option values 会合并
- ⚠️ 获取正确的 translatableContentDigest 很困难

### 讨论3: Linking PRODUCT_OPTION_VALUE to Parent Product

**链接**: https://community.shopify.dev/t/translations-api-how-to-link-metafield-product-option-and-product-option-value-from-translatableresources-api-to-their-parent-product/17998

**工作流程**:
1. 查询 `translatableResources` 并过滤 `resourceType: PRODUCT_OPTION`
2. 获取 option IDs 和 translatableContent
3. 交叉引用 product variants 查找关联

**开发者评价**:
> "Not the most ideal workflow and may require custom implementation"

---

## 🔍 关键矛盾点分析

### 矛盾1: API 定义 vs 实际行为

**API 定义说**:
- ✅ `PRODUCT_OPTION_VALUE` 在 `TranslatableResourceType` enum 中
- ✅ `ProductOptionValue` 有 `translations` 字段

**实际行为**:
- ❌ 查询 `translatableResource(resourceId=ProductOptionValue_GID)` 返回空 translatableContent
- ❌ 我们的验证脚本确认：`translatableContent: []`

### 矛盾2: 文档 vs 社区反馈

**官方文档**:
- 明确列出 `PRODUCT_OPTION_VALUE` 作为可翻译资源
- 没有任何弃用通知或限制说明

**社区反馈**:
- 多个开发者报告无法翻译 option values
- 称这是 "API gap"
- 建议使用 workarounds（但都有问题）

### 矛盾3: 版本更新提示

**2024-04 版本变更**:
- 弃用 `PRODUCT_VARIANT` 作为可翻译资源
- 推荐使用 `PRODUCT_OPTION_VALUE` 代替

**但是**:
- 社区讨论显示 `PRODUCT_OPTION_VALUE` 也无法正常工作
- 没有成功的实现案例

---

## 💡 可能的解释

### 解释1: 功能部分实现

Shopify 可能：
- ✅ 添加了 `PRODUCT_OPTION_VALUE` 到 enum
- ✅ 添加了 `translations` 字段到对象
- ❌ 但未实现 `translatableContent` 查询
- ❌ 或未实现 `translationsRegister` 的写入支持

**证据**:
- API 定义存在
- 但查询返回空
- 社区没有成功案例

### 解释2: 需要特殊的查询方式

可能存在未文档化的方法：
- 通过 Product 资源间接翻译
- 通过特定的 GID 格式
- 需要特殊的权限或设置

**但是**:
- 社区讨论中没人找到这个方法
- 官方文档没有提供
- 我们的验证也失败了

### 解释3: Shopify 的已知 Bug/限制

这可能是 Shopify 平台的已知问题：
- API 设计支持
- 但实现有缺陷
- 官方没有公开承认

**证据**:
- 社区多次报告
- 无官方回复或修复
- 持续存在多个 API 版本

---

## 📊 三级资源翻译能力对比表

| 资源类型 | TranslatableResourceType | translatableContent | translations 字段 | 实际可翻译 |
|---------|-------------------------|---------------------|------------------|-----------|
| **Product** | ✅ PRODUCT | 6个字段（title, body_html, etc.） | ✅ 有 | ✅ 完全支持 |
| **ProductOption** | ✅ PRODUCT_OPTION | 1个字段（name） | ✅ 有 | ✅ 仅 name |
| **ProductOptionValue** | ✅ PRODUCT_OPTION_VALUE | ❌ 空数组 | ✅ 有（只读） | ❌ 无法写入 |

**结论**: API 定义支持，但实际无法为 ProductOptionValue 注册翻译

---

## 🎯 官方翻译指南的明确限制

### Shopify Markets 翻译文档

**链接**: https://shopify.dev/docs/apps/build/markets/manage-translated-content

**明确支持的产品字段**:
1. Product title
2. Body HTML (product description)

**明确的限制**:
- ❌ Tags field can't be translated
- ⚠️ URL redirects for language-specific URLs have limitations

**未提及的内容**:
- 产品 options 翻译
- 产品 variants 翻译
- Option values 翻译

**解读**: 官方文档避而不谈 option/variant 翻译，可能暗示这不是正式支持的功能

---

## 🔜 进一步调研方向

### 方向1: 查询 Schema 确认可用 Mutations

**待执行**:
```graphql
{
  __type(name: "Mutation") {
    fields {
      name
      description
      args {
        name
        type { name }
      }
    }
  }
}
```

**目标**: 查找是否有：
- `productOptionUpdate` with locale parameter
- `productOptionValueUpdate` with locale parameter
- 其他未文档化的 mutations

### 方向2: 测试社区建议的 Workaround

**尝试通过 Product GID 发布**:
```graphql
mutation {
  translationsRegister(
    resourceId: "gid://shopify/Product/123/ProductOption/456"
    translations: [{
      locale: "de"
      key: "values"
      value: "[\"OD Grün\"]"
      translatableContentDigest: "..."
    }]
  )
}
```

### 方向3: Shopify Support 询问

**问题**:
1. PRODUCT_OPTION_VALUE 在 enum 中但无法使用，这是 bug 还是未实现的功能？
2. 如何正确翻译 option values？
3. 是否有计划在未来版本中完全支持？

---

## ✅ 最终结论

### 官方 API 状态

**文档层面**:
- ✅ `PRODUCT_OPTION_VALUE` 存在于 `TranslatableResourceType` enum
- ✅ `ProductOptionValue` 对象有 `translations` 字段
- ✅ API 设计上支持 option values 翻译

**实际行为**:
- ❌ `translatableResource(resourceId=ProductOptionValue_GID)` 返回空 translatableContent
- ❌ 无法获取 digest 用于 `translationsRegister`
- ❌ 社区没有成功的实现案例

### 推荐方案

**短期（接受限制）**:
1. 只翻译 PRODUCT_OPTION 的 name 字段（✅ 可用）
2. UI 显示透明提示："⚠️ Option values 翻译仅在应用内显示，Shopify 平台暂不支持发布"
3. 修复代码中的静默跳过 bug（改为显式警告）

**中期（监控更新）**:
1. 定期检查 Shopify Changelog
2. 关注社区讨论的新进展
3. 测试新 API 版本（2025-10, 2026-01 等）

**长期（替代方案）**:
1. 考虑使用 Shopify Admin 手动维护翻译
2. 通过 liquid templates 实现前端翻译显示
3. 等待 Shopify 官方完全实现功能

---

## 📎 参考资源

### 官方文档
- TranslatableResourceType Enum: https://shopify.dev/docs/api/admin-graphql/2025-07/enums/TranslatableResourceType
- ProductOptionValue Object: https://shopify.dev/docs/api/admin-graphql/2025-07/objects/ProductOptionValue
- translationsRegister Mutation: https://shopify.dev/docs/api/admin-graphql/2025-07/mutations/translationsRegister
- Translation Management Guide: https://shopify.dev/docs/apps/build/markets/manage-translated-content

### 社区讨论
- Gap in Translations API: https://community.shopify.com/t/gap-in-translations-api-for-product-options/87810
- Translating Variant Options: https://community.shopify.com/t/how-to-translate-product-variants-options-name-and-value-using-graphql/278591
- Linking Resources: https://community.shopify.dev/t/translations-api-how-to-link-metafield-product-option-and-product-option-value-from-translatableresources-api-to-their-parent-product/17998

### 我们的验证
- Product 验证: `claudedocs/product-translatable-content-verification.md`
- Option 验证: `scripts/diagnostics/check-option-translatable-content.mjs`
- OptionValue 验证: `scripts/diagnostics/check-option-value-translatable-content.mjs`
- 代码流程分析: `claudedocs/option-values-publish-investigation.md`

---

**报告结论**: Shopify API 在文档层面支持 PRODUCT_OPTION_VALUE 翻译，但实际实现不完整或存在 bug，导致无法获取 translatableContent 从而无法注册翻译。这是 Shopify 平台的已知限制，社区多次报告但未得到官方解决。
