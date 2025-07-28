// import { authenticate } from "../shopify.server.js"; // 只在需要时导入

/**
 * Shopify GraphQL查询和变更操作
 */

// GraphQL查询：获取产品
const GET_PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          description
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

// GraphQL查询：获取集合
const GET_COLLECTIONS_QUERY = `
  query getCollections($cursor: String) {
    collections(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          description
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

// GraphQL变更：更新产品翻译
const UPDATE_PRODUCT_MUTATION = `
  mutation updateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        descriptionHtml
        seo {
          title
          description
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// GraphQL变更：更新集合翻译
const UPDATE_COLLECTION_MUTATION = `
  mutation updateCollection($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection {
        id
        title
        descriptionHtml
        seo {
          title
          description
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * 获取店铺所有产品，支持重试机制
 * @param {Object} admin - Shopify Admin API客户端
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<Array>} 产品列表
 */
export async function fetchAllProducts(admin, maxRetries = 3) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    let retryCount = 0;
    let success = false;
    let response, data;

    while (retryCount < maxRetries && !success) {
      try {
        console.log(`获取产品数据 - 游标: ${cursor || 'null'}, 尝试: ${retryCount + 1}/${maxRetries}`);
        
        // 设置超时控制
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('GraphQL请求超时')), 30000)
        );
        
        const requestPromise = admin.graphql(GET_PRODUCTS_QUERY, {
          variables: { cursor }
        });
        
        response = await Promise.race([requestPromise, timeoutPromise]);
        data = await response.json();
        success = true;
        
      } catch (error) {
        retryCount++;
        console.error(`GraphQL请求失败 (尝试 ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000); // 指数退避，最大5秒
          console.log(`${delay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error(`GraphQL请求失败，已达最大重试次数: ${error.message}`);
        }
      }
    }
    
    if (data.errors) {
      throw new Error(`GraphQL错误: ${JSON.stringify(data.errors)}`);
    }

    if (!data.data || !data.data.products) {
      throw new Error('GraphQL响应数据格式异常');
    }

    const productEdges = data.data.products.edges;
    console.log(`成功获取 ${productEdges.length} 个产品`);
    
    for (const edge of productEdges) {
      const product = edge.node;
      products.push({
        id: product.id.replace('gid://shopify/Product/', ''),
        gid: product.id,
        title: product.title,
        description: product.description || '',
        seoTitle: product.seo?.title || '',
        seoDescription: product.seo?.description || '',
        resourceType: 'product'
      });
    }

    hasNextPage = data.data.products.pageInfo.hasNextPage;
    cursor = data.data.products.pageInfo.endCursor;
  }

  console.log(`总共获取 ${products.length} 个产品`);
  return products;
}

/**
 * 获取店铺所有集合，支持重试机制
 * @param {Object} admin - Shopify Admin API客户端
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<Array>} 集合列表
 */
export async function fetchAllCollections(admin, maxRetries = 3) {
  const collections = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    let retryCount = 0;
    let success = false;
    let response, data;

    while (retryCount < maxRetries && !success) {
      try {
        console.log(`获取集合数据 - 游标: ${cursor || 'null'}, 尝试: ${retryCount + 1}/${maxRetries}`);
        
        // 设置超时控制
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('GraphQL请求超时')), 30000)
        );
        
        const requestPromise = admin.graphql(GET_COLLECTIONS_QUERY, {
          variables: { cursor }
        });
        
        response = await Promise.race([requestPromise, timeoutPromise]);
        data = await response.json();
        success = true;
        
      } catch (error) {
        retryCount++;
        console.error(`GraphQL请求失败 (尝试 ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000); // 指数退避，最大5秒
          console.log(`${delay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error(`GraphQL请求失败，已达最大重试次数: ${error.message}`);
        }
      }
    }
    
    if (data.errors) {
      throw new Error(`GraphQL错误: ${JSON.stringify(data.errors)}`);
    }

    if (!data.data || !data.data.collections) {
      throw new Error('GraphQL响应数据格式异常');
    }

    const collectionEdges = data.data.collections.edges;
    console.log(`成功获取 ${collectionEdges.length} 个集合`);
    
    for (const edge of collectionEdges) {
      const collection = edge.node;
      collections.push({
        id: collection.id.replace('gid://shopify/Collection/', ''),
        gid: collection.id,
        title: collection.title,
        description: collection.description || '',
        seoTitle: collection.seo?.title || '',
        seoDescription: collection.seo?.description || '',
        resourceType: 'collection'
      });
    }

    hasNextPage = data.data.collections.pageInfo.hasNextPage;
    cursor = data.data.collections.pageInfo.endCursor;
  }

  return collections;
}

/**
 * 更新产品翻译到Shopify
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} productGid - 产品GID
 * @param {Object} translations - 翻译内容
 * @returns {Promise<Object>} 更新结果
 */
export async function updateProductTranslation(admin, productGid, translations) {
  const input = {
    id: productGid,
  };

  // 添加翻译内容 - 使用正确的字段名
  if (translations.titleTrans) {
    input.title = translations.titleTrans;
  }
  
  if (translations.descTrans) {
    input.descriptionHtml = translations.descTrans;
  }

  if (translations.seoTitleTrans || translations.seoDescTrans) {
    input.seo = {};
    if (translations.seoTitleTrans) {
      input.seo.title = translations.seoTitleTrans;
    }
    if (translations.seoDescTrans) {
      input.seo.description = translations.seoDescTrans;
    }
  }

  console.log('更新产品翻译 - 输入参数:', JSON.stringify(input, null, 2));

  const response = await admin.graphql(UPDATE_PRODUCT_MUTATION, {
    variables: { input }
  });

  const data = await response.json();
  
  if (data.errors) {
    console.error('GraphQL错误详情:', JSON.stringify(data.errors, null, 2));
    throw new Error(`更新产品失败: ${JSON.stringify(data.errors)}`);
  }

  if (data.data.productUpdate.userErrors.length > 0) {
    console.error('用户错误详情:', JSON.stringify(data.data.productUpdate.userErrors, null, 2));
    throw new Error(`用户错误: ${JSON.stringify(data.data.productUpdate.userErrors)}`);
  }

  console.log('产品更新成功:', data.data.productUpdate.product.id);
  return data.data.productUpdate.product;
}

/**
 * 更新集合翻译到Shopify
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} collectionGid - 集合GID
 * @param {Object} translations - 翻译内容
 * @returns {Promise<Object>} 更新结果
 */
export async function updateCollectionTranslation(admin, collectionGid, translations) {
  const input = {
    id: collectionGid,
  };

  // 添加翻译内容 - 使用正确的字段名
  if (translations.titleTrans) {
    input.title = translations.titleTrans;
  }
  
  if (translations.descTrans) {
    input.descriptionHtml = translations.descTrans;
  }

  if (translations.seoTitleTrans || translations.seoDescTrans) {
    input.seo = {};
    if (translations.seoTitleTrans) {
      input.seo.title = translations.seoTitleTrans;
    }
    if (translations.seoDescTrans) {
      input.seo.description = translations.seoDescTrans;
    }
  }

  console.log('更新集合翻译 - 输入参数:', JSON.stringify(input, null, 2));

  const response = await admin.graphql(UPDATE_COLLECTION_MUTATION, {
    variables: { input }
  });

  const data = await response.json();
  
  if (data.errors) {
    console.error('GraphQL错误详情:', JSON.stringify(data.errors, null, 2));
    throw new Error(`更新集合失败: ${JSON.stringify(data.errors)}`);
  }

  if (data.data.collectionUpdate.userErrors.length > 0) {
    console.error('用户错误详情:', JSON.stringify(data.data.collectionUpdate.userErrors, null, 2));
    throw new Error(`用户错误: ${JSON.stringify(data.data.collectionUpdate.userErrors)}`);
  }

  console.log('集合更新成功:', data.data.collectionUpdate.collection.id);
  return data.data.collectionUpdate.collection;
}