# Shopify GraphQL 翻译查询文档

**最后验证**: 2025-09-04  
**API版本**: 2025-07  
**项目文件**: shopify-graphql.server.js

## 基础查询结构

### 获取可翻译资源
```graphql
query getTranslatableResources($first: Int!, $resourceType: String!) {
  translatableResources(first: $first, resourceType: $resourceType) {
    edges {
      node {
        resourceId
        translatableContent {
          key
          value
          digest
          locale
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

## 项目特定查询

### 1. 批量获取产品资源
```javascript
// 文件: shopify-graphql.server.js
const FETCH_PRODUCTS_QUERY = `
  query FetchProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          descriptionHtml
          handle
          seo {
            title
            description
          }
          metafields(first: 10) {
            edges {
              node {
                key
                value
                namespace
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
```

### 2. 获取集合资源
```javascript
const FETCH_COLLECTIONS_QUERY = `
  query FetchCollections($cursor: String) {
    collections(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          descriptionHtml
          handle
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
`;
```

### 3. 获取主题资源
```javascript
const FETCH_THEME_QUERY = `
  query FetchOnlineStoreTheme {
    themes(first: 10, roles: [MAIN]) {
      edges {
        node {
          id
          name
          role
          files(first: 250) {
            edges {
              node {
                filename
                contentType
                body {
                  ... on OnlineStoreThemeFileBodyText {
                    content
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;
```

## 翻译内容更新 Mutations

### 更新资源翻译
```javascript
const UPDATE_TRANSLATION_MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors {
        field
        message
        code
      }
      translations {
        key
        value
        locale
        outdated
      }
    }
  }
`;
```

## 执行查询的标准方法

```javascript
// 项目标准执行方法（带重试机制）
async function executeGraphQLWithRetry(admin, query, variables = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await admin.graphql(query, { variables });
      const data = await response.json();
      
      // 检查用户错误
      if (data.errors) {
        console.error('GraphQL错误:', data.errors);
        if (attempt === maxRetries) {
          throw new Error(`GraphQL错误: ${JSON.stringify(data.errors)}`);
        }
      }
      
      return data;
    } catch (error) {
      console.log(`尝试 ${attempt}/${maxRetries} 失败:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 指数退避
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## 分页处理模式

```javascript
// 标准分页获取所有资源
async function fetchAllResources(admin, resourceType) {
  const resources = [];
  let hasNextPage = true;
  let cursor = null;
  
  while (hasNextPage) {
    const query = QUERIES[resourceType];
    const response = await executeGraphQLWithRetry(admin, query, { cursor });
    const data = response.data[resourceType.toLowerCase()];
    
    resources.push(...data.edges.map(edge => edge.node));
    
    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
  }
  
  return resources;
}
```

## 资源类型映射

```javascript
// RESOURCE_TYPES 常量定义
const RESOURCE_TYPES = {
  PRODUCT: {
    graphqlType: 'PRODUCT',
    queryField: 'products',
    hasTranslations: true,
    fields: ['title', 'descriptionHtml', 'handle']
  },
  COLLECTION: {
    graphqlType: 'COLLECTION', 
    queryField: 'collections',
    hasTranslations: true,
    fields: ['title', 'descriptionHtml']
  },
  PAGE: {
    graphqlType: 'PAGE',
    queryField: 'pages',
    hasTranslations: true,
    fields: ['title', 'body']
  },
  // ... 更多类型
};
```

## 错误处理最佳实践

```javascript
// 标准错误处理模式
try {
  const result = await executeGraphQLWithRetry(admin, query, variables);
  
  // 检查mutation的用户错误
  if (result.data?.translationsRegister?.userErrors?.length > 0) {
    const errors = result.data.translationsRegister.userErrors;
    throw new TranslationError(
      `翻译更新失败: ${errors.map(e => e.message).join(', ')}`,
      'TRANSLATION_UPDATE_FAILED'
    );
  }
  
  return result.data;
} catch (error) {
  // 记录错误到ErrorLog表
  await captureError(error, {
    operation: 'GraphQL Query',
    query: query.substring(0, 100),
    variables
  });
  throw error;
}
```

## API限流处理

```javascript
// 限流常量
const GRAPHQL_RATE_LIMIT = {
  COST_LIMIT: 1000,      // 每秒成本限制
  RESTORE_RATE: 50,      // 每秒恢复率
  BATCH_SIZE: 50,        // 批量大小
  MIN_DELAY: 100,        // 最小延迟(ms)
  MAX_DELAY: 10000       // 最大延迟(ms)
};

// 智能延迟计算
function calculateDelay(cost, available) {
  if (available < cost * 2) {
    // 接近限制，增加延迟
    return Math.min(GRAPHQL_RATE_LIMIT.MAX_DELAY, 
                   (cost / GRAPHQL_RATE_LIMIT.RESTORE_RATE) * 1000 * 2);
  }
  return GRAPHQL_RATE_LIMIT.MIN_DELAY;
}
```

## 注意事项

1. **API版本**: 当前使用2025-07，确保所有查询兼容
2. **成本计算**: 每个查询都有成本，注意优化查询复杂度
3. **批量操作**: 使用bulk operations处理大量数据
4. **错误重试**: 使用指数退避策略处理临时错误
5. **游标分页**: 始终使用游标而非偏移量分页

## 验证命令

```bash
# 检查GraphQL查询定义
grep -r "query.*{" app/services/shopify-graphql.server.js
# 检查mutation定义  
grep -r "mutation.*{" app/services/shopify-graphql.server.js
```