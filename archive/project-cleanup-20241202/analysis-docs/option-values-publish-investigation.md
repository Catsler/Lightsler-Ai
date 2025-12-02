# PRODUCT_OPTION Values 发布失败调查报告

## 📋 问题现象

**产品**: OneWind - Tandem Ridge Shelter Tarp Inner Tent
**现象**: PRODUCT_OPTION 的 values（如 "OD Green"）翻译完成，但不显示在 Shopify
**核心矛盾**: 能扫描、能翻译、能在UI显示，但无法发布到 Shopify

---

## 🔍 完整数据流分析

### ✅ 阶段1：扫描（成功）

**入口**: `product-translation-enhanced.server.js:314`
```javascript
const remoteOptions = await fetchOptionsForProduct(admin, product.gid);
```

**GraphQL 查询**: `shopify-graphql.server.js:703-723`
```graphql
query ProductOptions($id: ID!) {
  product(id: $id) {
    options {
      id
      name
      values  # ✅ Shopify 成功返回 ["OD Green", "Tan"]
    }
  }
}
```

**数据映射**: `product-translation-enhanced.server.js:315-336`
```javascript
existingOptions = remoteOptions.map((option, index) => ({
  contentFields: {
    name: option.name,           // "Color"
    values: option.values        // ✅ ["OD Green", "Tan"]
  }
}));
```

**数据库存储**: `product-translation-enhanced.server.js:455-468`
```javascript
await tx.resource.upsert({
  create: {
    contentFields: option.contentFields  // ✅ {name: "Color", values: ["OD Green", "Tan"]}
  }
});
```

**结论**: ✅ Shopify 支持读取 values，存储成功

---

### ✅ 阶段2：翻译（成功）

**翻译逻辑**: `translation/core.server.js:2152-2180`
```javascript
case 'PRODUCT_OPTION':
  // 翻译 name
  dynamicTranslationFields.name = await translateText(normalizedName, targetLang);

  // 翻译 values
  if (Array.isArray(contentFields.values)) {
    dynamicTranslationFields.values = [];
    for (const value of contentFields.values) {
      const translatedValue = await translateText(normalizedValue, targetLang);
      dynamicTranslationFields.values.push(translatedValue);  // ✅ 翻译成功
    }
  }
```

**存储翻译**: `product-translation-enhanced.server.js:498-501`
```javascript
await tx.translation.create({
  data: {
    translationFields: {
      name: "Farbe",              // ✅ 翻译成功
      values: ["OD Grün", "Tan"]  // ✅ 翻译成功
    },
    syncStatus: 'pending'
  }
});
```

**结论**: ✅ 翻译引擎正常工作，translationFields 正确存储

---

### ✅ 阶段3：UI 显示（成功）

**API 端点**: `api.product-options.jsx:76-99`
```javascript
// 从数据库读取
const translationFields = translation.translationFields || {};
const translatedValues = translationFields.values;  // ✅ ["OD Grün", "Tan"]

return {
  translatedValues,  // ✅ UI 显示这个值
  source: "database"
};
```

**UI 组件**: `ResourceDetail.jsx:422-432`
```javascript
// 调用 API 获取数据库中的翻译
const res = await fetch(`/api/product-options?gid=${productGid}&lang=${lang}`);
// ✅ 显示 translatedValues
```

**结论**: ✅ UI 从数据库读取，不依赖 Shopify API，所以能正常显示

---

### ❌ 阶段4：发布到 Shopify（失败）

**步骤1**: 查询 translatableContent - `shopify-graphql.server.js:1308-1364`
```graphql
query GetTranslatableContent($resourceId: ID!) {
  translatableResource(resourceId: $resourceId) {
    translatableContent {
      key
      value
      digest
    }
  }
}
```

**实际返回**（ProductOption GID）:
```json
{
  "translatableContent": [
    {"key": "name", "value": "Color", "digest": "..."}
    // ❌ 没有 "values" 字段
  ]
}
```

**步骤2**: 构造 translationInputs - `shopify-graphql.server.js:1479-1518`
```javascript
for (const [fieldKey, fieldValue] of Object.entries(translations.translationFields)) {
  // fieldKey = "name" ✅ 或 "values" ❌

  const content = translatableContent.find(item => item.key === fieldKey);

  if (content) {
    // ✅ name 字段找到匹配，添加到 translationInputs
    translationInputs.push({
      key: content.key,
      value: fieldValue,
      digest: content.digest
    });
  } else {
    // ❌ values 字段找不到匹配，静默跳过（Line 1514）
    logger.debug(`⚠️ 标准动态字段未找到可翻译内容: "${fieldKey}"`);
  }
}
```

**步骤3**: 提交到 Shopify - `shopify-graphql.server.js:1207-1214`
```graphql
mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
  translationsRegister(resourceId: $resourceId, translations: $translations) {
    translations { key locale value }
  }
}
```

**实际提交内容**:
```json
{
  "translations": [
    {"key": "name", "value": "Farbe", "locale": "de", "digest": "..."}
    // ❌ 缺少 values 字段
  ]
}
```

**结论**: ❌ ProductOption 的 translatableContent 不包含 values，导致发布时静默跳过

---

## 🐛 Bug 根因定位

**位置**: `shopify-graphql.server.js:1514`

**问题代码**:
```javascript
if (content) {
  translationInputs.push(translationInput);
} else {
  logger.debug(`⚠️ 标准动态字段未找到可翻译内容: "${fieldKey}"`);
  // ← 只有 debug 日志，没有错误/警告
  // ← 静默跳过，用户完全不知道
}
```

**修复建议**（如果确认 values 应该可翻译）:
1. 升级日志级别：`logger.debug` → `logger.warn`
2. 记录到 ErrorLog 表，显示在 UI
3. 调查替代发布路径（如果存在）

**修复建议**（如果确认 values 不可翻译）:
1. 在扫描阶段标记 values 为不可发布
2. UI 显示明确提示："⚠️ Option values 翻译仅用于显示，Shopify 不支持发布"
3. 更新文档说明限制

---

## 🔬 验证问题

### ✅ 问题1: Product 资源是否支持 option 翻译？（已验证）

**验证脚本**: `scripts/diagnostics/verify-product-translatable-fields.mjs`
**验证日期**: 2025-10-14
**详细报告**: 见 `claudedocs/product-translatable-content-verification.md`

**实测结果**:

Product 的 `translatableContent` 包含 **6 个字段**：
1. `title` - 产品标题
2. `body_html` - 产品描述（富文本）
3. `handle` - URL 别名
4. `product_type` - 产品类型
5. `meta_title` - SEO 标题
6. `meta_description` - SEO 描述

**关键发现**:
- ❌ **0 个 option 相关字段**（搜索 "option" 和 "variant" 关键词）
- ✅ 只包含产品主体字段
- ✅ 结构是扁平的字段列表，无嵌套对象

**结论**: ❌ **Product 资源无法用于发布 option 翻译**
- 排除了 "通过 Product 资源发布" 这条路径
- 需要继续调研其他 API 方法

### 问题2: 是否存在 productOptionsUpdate mutation？

**调研方向**:
1. 查阅 Shopify GraphQL Admin API 2025-07 文档
2. 搜索关键词：`productOptionsUpdate`, `productOptionValueUpdate`
3. 检查是否有 `locale` 参数支持

**验证方法**:
```graphql
# 尝试查询 schema
{
  __type(name: "Mutation") {
    fields {
      name
      args {
        name
        type { name }
      }
    }
  }
}
# 搜索包含 "option" 和 "locale" 的 mutation
```

### 问题3: Shopify 2025-07 是否支持 option values 翻译？

**调研资源**:
- Shopify API 文档: https://shopify.dev/docs/api/admin-graphql/2025-07
- Shopify 多语言指南: https://shopify.dev/docs/apps/markets/translate-content
- Shopify Community 论坛

**关键问题**:
- ProductOption 和 ProductOptionValue 的 translatableContent 结构是否有文档说明？
- 是否有已知的 option values 翻译限制？
- 其他应用是如何处理 option values 翻译的？

---

## 📊 数据验证

### 数据库记录示例

**Resource 表**:
```json
{
  "id": 12345,
  "resourceType": "PRODUCT_OPTION",
  "gid": "gid://shopify/ProductOption/10361535758519",
  "title": "Color",
  "contentFields": {
    "name": "Color",
    "values": ["OD Green", "Tan"]
  }
}
```

**Translation 表**:
```json
{
  "id": 67890,
  "resourceId": 12345,
  "language": "de",
  "translationFields": {
    "name": "Farbe",
    "values": ["OD Grün", "Tan"]
  },
  "syncStatus": "pending"  // ← 永远无法变为 "synced"
}
```

### 验证命令

```bash
# 查询数据库中的 PRODUCT_OPTION 翻译
sqlite3 prisma/dev.sqlite "
  SELECT
    r.gid,
    r.title,
    r.contentFields,
    t.language,
    t.translationFields,
    t.syncStatus
  FROM Resource r
  JOIN Translation t ON r.id = t.resourceId
  WHERE r.resourceType = 'PRODUCT_OPTION'
  AND r.shopId = 'shop2'
  LIMIT 5;
"
```

---

## 🎯 下一步行动计划

### 立即执行（验证阶段）

1. **运行验证脚本**:
   ```bash
   node scripts/diagnostics/verify-product-translatable-fields.mjs
   ```
   - 确认 Product 资源是否包含 option 字段
   - 排除或确认通过 Product 发布的可能性

2. **查阅 Shopify 官方文档**:
   - 搜索 "ProductOption translation"
   - 搜索 "ProductOptionValue translation"
   - 查看 2025-07 API 的 translatable resources 列表

3. **尝试 Schema 查询**（如果有 GraphQL Playground 访问权限）:
   ```graphql
   {
     __type(name: "Mutation") {
       fields(includeDeprecated: false) {
         name
         description
       }
     }
   }
   # 搜索包含 "option" 的 mutation
   ```

### 根据验证结果决策

**场景A**: 找到替代发布路径
- 实现新的发布逻辑
- 测试验证
- 更新文档

**场景B**: 确认 Shopify 不支持
- 在 UI 显示透明提示
- 更新 syncStatus 逻辑（values 不计入发布失败）
- 文档说明限制
- 考虑是否通过 Shopify Admin 手动维护

**场景C**: 需要进一步调研
- 联系 Shopify 支持
- 查看其他翻译应用的实现
- 提交 GitHub Issue 请求社区帮助

---

## 📝 总结

### 核心发现

1. **数据流完整性**: 扫描 → 翻译 → 存储 → UI显示 全部正常 ✅
2. **发布断点**: 发布阶段因 translatableContent 不包含 values 而静默跳过 ❌
3. **API矛盾**: Shopify 允许读取 values，但不提供翻译接口
4. **用户体验问题**: 静默失败，用户不知道 values 无法发布

### 技术判断

基于当前证据：
- ProductOption 的 translatableContent 只有 `name` 字段
- ProductOptionValue 的 translatableContent 为空
- 现有代码逻辑正确，但 Shopify API 存在限制

### 待确认问题

- [ ] Product 资源是否支持 option 翻译？（运行验证脚本）
- [ ] Shopify 2025-07 文档是否明确说明限制？
- [ ] 是否存在未发现的 API 路径？

---

**报告日期**: 2025-10-14
**调查范围**: 扫描、翻译、发布完整流程
**证据文件**:
- `product-translation-enhanced.server.js`
- `shopify-graphql.server.js`
- `translation/core.server.js`
- `api.product-options.jsx`
- `ResourceDetail.jsx`
