# Shopify GraphQL API：主题资源查询和变更

## 文档信息
- **版本**：Shopify GraphQL Admin API 2025-07
- **最后更新**：2025-09-04
- **适用**：多语言翻译应用

## 概述

本文档详细描述主题资源相关的GraphQL查询和变更操作，专注于多语言翻译和动态内容处理。

## 主题查询

### 1. 获取在线主题列表

```graphql
query OnlineStoreThemes {
  onlineStoreThemes {
    edges {
      node {
        id
        name
        role
        previewUrl
        supportedLocales {
          locale
          name
        }
        themeStore {
          id
          author
          demoUrl
        }
      }
    }
  }
}
```

### 2. 主题资源和文件详情

```graphql
query ThemeAssets($themeId: ID!) {
  onlineStoreTheme(id: $themeId) {
    id
    name
    assets {
      edges {
        node {
          key
          contentType
          size
          translations(locale: "zh-CN") {
            key
          }
        }
      }
    }
    jsonTemplates {
      edges {
        node {
          key
          content
          translations(locale: "zh-CN") {
            content
          }
        }
      }
    }
  }
}
```

### 3. 动态字段提取查询

```graphql
query DynamicThemeFields($themeId: ID!) {
  onlineStoreTheme(id: $themeId) {
    id
    dynamicFields {
      key
      type
      value
      translations(locale: "zh-CN") {
        value
      }
    }
    localeContents {
      locale
      content
    }
  }
}
```

## 主题变更操作

### 1. 主题文件上传

```graphql
mutation ThemeAssetCreate($input: ThemeAssetCreateInput!) {
  themeAssetCreate(input: $input) {
    asset {
      id
      key
      size
      contentType
    }
    userErrors {
      field
      message
    }
  }
}
```

### 2. 主题文件翻译注册

```graphql
mutation ThemeAssetTranslationRegister($input: ThemeAssetTranslationRegisterInput!) {
  themeAssetTranslationRegister(input: $input) {
    asset {
      id
      translations(locale: "zh-CN") {
        key
        content
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

## JSON模板处理

### 1. JSON模板查询

```graphql
query JSONTemplates($themeId: ID!) {
  onlineStoreTheme(id: $themeId) {
    jsonTemplates {
      edges {
        node {
          key
          content
          translations(locale: "zh-CN") {
            key
            content
          }
        }
      }
    }
  }
}
```

### 2. JSON模板更新

```graphql
mutation UpdateJSONTemplate($input: JSONTemplateUpdateInput!) {
  jsonTemplateUpdate(input: $input) {
    jsonTemplate {
      id
      key
      content
    }
    userErrors {
      field
      message
    }
  }
}
```

## 错误处理和最佳实践

### 常见错误场景

1. **主题资源不存在**
   - 错误代码：`THEME_ASSET_NOT_FOUND`
   - 处理建议：验证主题ID和资源key

2. **文件上传权限**
   - 错误代码：`THEME_EDIT_ACCESS_DENIED`
   - 处理建议：检查应用权限范围

3. **翻译约束冲突**
   - 错误代码：`TRANSLATION_CONSTRAINT_VIOLATION`
   - 处理建议：检查现有翻译状态

## 代码示例：主题资源批量处理

```javascript
async function processThemeTranslations(admin, themeId, locale = 'zh-CN') {
  const assets = await fetchThemeAssets(admin, themeId);
  
  for (const asset of assets) {
    // 智能文件名解析
    const parsedKey = intelligentFileNameParse(asset.key);
    
    // 翻译处理
    const translatedContent = await translateThemeAsset(
      asset.content, 
      locale, 
      parsedKey
    );
    
    // 上传翻译后资源
    await uploadTranslatedAsset(
      admin, 
      themeId, 
      asset.key, 
      translatedContent
    );
  }
}
```

## 性能和限制

- **最大资源上传大小**：100MB
- **每分钟主题操作**：25个请求
- **动态字段**：每个主题最多50个自定义字段
- **JSON模板**：每个主题最多100个模板

## 建议

1. 使用 `intelligentFileNameParse` 处理文件名
2. 保留原始资源结构和嵌套
3. 处理 `userErrors`
4. 实现增量更新策略
5. 缓存和复用翻译结果