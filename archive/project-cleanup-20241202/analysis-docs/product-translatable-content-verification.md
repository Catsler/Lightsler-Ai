# Product translatableContent 验证结果

**验证日期**: 2025-10-14
**验证脚本**: `scripts/diagnostics/verify-product-translatable-fields.mjs`
**测试店铺**: lightsler-ai.myshopify.com
**测试产品**: gid://shopify/Product/8063372165309 (Billow Hammock Camo Tarp Shelter 12')
**API 版本**: 2025-07

---

## 📊 实际返回的 translatableContent

Product 资源的 `translatableContent` 查询返回 **6 个字段**：

| # | key | value (示例) | digest |
|---|-----|--------------|--------|
| 1 | `title` | Billow Hammock Camo Tarp Shelter 12' | 6662d4223134c3861031362c91836b2fc23d4739... |
| 2 | `body_html` | `<p>Onewind Hammock Camo Tarp fit out...` | ce1395fce816d77f31eb995bf3e89351bc575b53... |
| 3 | `handle` | billow-hammock-camo-tarp-shelter-12 | 91c9d5d4eb09748040976b6f9197fb4d362cd605... |
| 4 | `product_type` | Tarp | 722f8d9dc86de57a08e9272567e027e2b789b2b6... |
| 5 | `meta_title` | Ultralight Hammock Tarp Shelter 12′ – Waterproof... | 4fd32f141868361fb914401ecfc657a5dc933b5d... |
| 6 | `meta_description` | Shield your hang with the Billow ultralight... | 22dd707d413137c2b0150f36d460ad98940754cb... |

---

## 🔍 关键字段分析

### Option 相关字段检查

**搜索条件**: 字段 key 包含 "option" 或 "variant"

**结果**: ❌ **0 个匹配**

### 字段分类

**标准产品字段** (4个):
- `title` - 产品标题
- `body_html` - 产品描述（富文本）
- `meta_title` - SEO 标题
- `meta_description` - SEO 描述

**URL/分类字段** (2个):
- `handle` - URL 别名
- `product_type` - 产品类型

**不包含**:
- ❌ 任何 option 相关字段（如 `option_name`, `option_value`）
- ❌ 任何 variant 相关字段
- ❌ 任何嵌套结构字段

---

## 💡 验证结论

### 明确的否定结果

✅ **Product 资源不支持 option 翻译**

**证据**:
1. Product 的 `translatableContent` 只包含产品主体字段
2. 没有任何 option 或 optionValue 相关的 key
3. 结构是扁平的字段列表，没有嵌套对象

**影响**:
- ❌ 无法通过 `translatableResource(resourceId=product_gid)` 获取 option 字段
- ❌ 无法通过 Product 资源的 `translationsRegister` 发布 option 翻译
- ✅ 排除了 "通过 Product 资源发布 option" 这条路径

---

## 🔬 与 ProductOption 对比

### ProductOption translatableContent

根据之前的验证（`check-option-translatable-content.mjs`）：

```json
{
  "translatableContent": [
    {
      "key": "name",
      "value": "Color",
      "digest": "...",
      "locale": "en"
    }
  ]
}
```

**包含字段**: 仅 `name` (1个)
**不包含**: `values` 数组

### ProductOptionValue translatableContent

根据之前的验证（`check-option-value-translatable-content.mjs`）：

```json
{
  "translatableContent": []
}
```

**包含字段**: 无（空数组）

---

## 📊 三级资源对比表

| 资源类型 | translatableContent | 能否翻译 name | 能否翻译 values |
|---------|---------------------|---------------|----------------|
| **Product** | title, body_html, handle, product_type, meta_title, meta_description | N/A | ❌ 不包含 option 字段 |
| **ProductOption** | name | ✅ 可以 | ❌ 不包含 values |
| **ProductOptionValue** | (空) | ❌ 不支持 | ❌ 不支持 |

---

## 🎯 排除的路径

基于此验证，以下方法 **已确认不可行**：

1. ❌ 通过 Product 资源发布 option name
2. ❌ 通过 Product 资源发布 option values
3. ❌ 通过嵌套字段（如 `product.options[].name`）发布

---

## 🔜 后续调研方向

### 方向1: 搜索专门的 Option Mutation

**待查询**:
- `productOptionsUpdate`
- `productOptionUpdate`
- `productOptionValueUpdate`

**查询方法**:
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

**筛选条件**: mutation 名称包含 "option" 且参数包含 "locale"

### 方向2: 查阅 Shopify 官方文档

**文档位置**:
- https://shopify.dev/docs/api/admin-graphql/2025-07
- https://shopify.dev/docs/apps/markets/translate-content

**搜索关键词**:
- "ProductOption translation"
- "ProductOptionValue localization"
- "translatable resources list"

### 方向3: Shopify Community 调研

**问题**:
- 其他翻译应用如何处理 option values？
- Shopify Markets 是否支持 option 多语言？
- 是否有官方声明不支持 option values 翻译？

---

## 📝 测试环境信息

**GraphQL 查询**:
```graphql
query GetProductTranslatableContent($resourceId: ID!) {
  translatableResource(resourceId: $resourceId) {
    resourceId
    translatableContent {
      key
      value
      digest
      locale
    }
  }
}
```

**变量**:
```json
{
  "resourceId": "gid://shopify/Product/8063372165309"
}
```

**完整响应** (已验证):
- 字段总数: 6
- Option 相关字段: 0
- 标准产品字段: 4

---

## ✅ 验证状态

- [x] Product 资源 translatableContent 结构已确认
- [x] Option 相关字段不存在已验证
- [x] "通过 Product 发布" 路径已排除
- [ ] productOptionsUpdate mutation 存在性待验证
- [ ] Shopify 官方文档待查阅
- [ ] 社区调研待进行

---

**结论**: Product 资源无法用于发布 ProductOption 的 values 翻译。需要继续调研其他 API 路径或接受平台限制。
