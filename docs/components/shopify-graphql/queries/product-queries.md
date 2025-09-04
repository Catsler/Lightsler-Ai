# Shopify GraphQL API：产品查询和变更

## 文档信息
- **版本**：Shopify GraphQL Admin API 2025-07
- **最后更新**：2025-09-04
- **适用**：多语言翻译应用

## 概述

本文档详细描述了与产品相关的GraphQL查询和变更操作，专门针对多语言翻译场景优化。

## 产品查询

### 1. 批量获取产品

```graphql
query ProductsWithDetails($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    edges {
      node {
        id
        title
        handle
        descriptionHtml
        translations(locale: "zh-CN") {
          title
          descriptionHtml
        }
        variants(first: 10) {
          edges {
            node {
              id
              price
              sku
              availableForSale
            }
          }
        }
        seo {
          title
          description
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### 2. 产品详细查询（包含翻译）

```graphql
query SingleProductWithTranslations($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    descriptionHtml
    translations(locale: "zh-CN") {
      title
      descriptionHtml
      handle
    }
    metafields(namespace: "translations", first: 10) {
      edges {
        node {
          key
          value
        }
      }
    }
  }
}
```

## 产品变更操作

### 1. 产品翻译注册

```graphql
mutation ProductTranslationRegister($input: ProductTranslationRegisterInput!) {
  productTranslationRegister(input: $input) {
    product {
      id
      translations(locale: "zh-CN") {
        title
        descriptionHtml
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### 2. 产品更新（包含多语言处理）

```graphql
mutation UpdateProductWithTranslation($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
      descriptionHtml
      seo {
        title
        description
      }
      translations(locale: "zh-CN") {
        title
        descriptionHtml
      }
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

1. **产品不存在**
   - 错误代码：`PRODUCT_NOT_FOUND`
   - 处理建议：检查产品ID，确认产品是否已删除

2. **权限不足**
   - 错误代码：`ACCESS_DENIED`
   - 处理建议：验证应用的Shopify权限范围

3. **翻译冲突**
   - 错误代码：`TRANSLATION_CONSTRAINT_VIOLATION`
   - 处理建议：检查现有翻译，解决版本冲突

### 批量操作优化

- 使用游标分页（`after`参数）
- 单次请求建议不超过50个产品
- 使用 `executeGraphQLWithRetry` 处理API限制

## 代码示例

```javascript
// 批量获取和翻译产品的实现示例
async function translateProducts(admin, locale = 'zh-CN') {
  const batchSize = 50;
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await admin.graphql(`
      query ProductsForTranslation($first: Int!, $after: String, $locale: String!) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              translations(locale: $locale) {
                title
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, {
      variables: {
        first: batchSize,
        after: cursor,
        locale: locale
      }
    });

    const data = await response.json();
    // 处理翻译逻辑
    
    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }
}
```

## 性能和限制

- **最大请求频率**：每分钟最多40个请求
- **批量操作**：单次mutation建议不超过10个资源
- **重试策略**：指数退避，最多3次重试

## 建议

1. 总是使用游标分页
2. 处理 `userErrors`
3. 实现幂等性操作
4. 使用重试机制处理暂时性错误
