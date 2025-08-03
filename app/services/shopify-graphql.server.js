// import { authenticate } from "../shopify.server.js"; // 只在需要时导入

/**
 * Shopify GraphQL查询和变更操作
 */

// GraphQL查询：获取产品（包括富文本内容）
const GET_PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          description
          descriptionHtml
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

// GraphQL查询：获取集合（包括富文本内容）
const GET_COLLECTIONS_QUERY = `
  query getCollections($cursor: String) {
    collections(first: 50, after: $cursor) {
      edges {
        node {
          id
          title
          description
          descriptionHtml
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

// GraphQL查询：获取可翻译资源内容
const TRANSLATABLE_RESOURCES_QUERY = `
  query getTranslatableResources($resourceId: ID!) {
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
`;

// GraphQL变更：注册翻译内容
const TRANSLATIONS_REGISTER_MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors {
        message
        field
      }
      translations {
        locale
        key
        value
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
        descriptionHtml: product.descriptionHtml || '',
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
        descriptionHtml: collection.descriptionHtml || '',
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
export async function updateProductTranslation(admin, productGid, translations, targetLocale) {
  try {
    console.log('开始注册产品翻译:', {
      productGid,
      targetLocale,
      translations: Object.keys(translations).filter(key => translations[key])
    });

    // 第一步：获取可翻译内容和digest
    const translatableResponse = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
      variables: { resourceId: productGid }
    });

    const translatableData = await translatableResponse.json();
    
    if (translatableData.errors) {
      console.error('获取可翻译内容失败:', translatableData.errors);
      throw new Error(`获取可翻译内容失败: ${JSON.stringify(translatableData.errors)}`);
    }

    const translatableContent = translatableData.data.translatableResource?.translatableContent || [];
    console.log('获取到可翻译内容:', translatableContent.length, '个字段');

    // 第二步：准备翻译输入
    const translationInputs = [];

    // 标题翻译
    if (translations.titleTrans) {
      const titleContent = translatableContent.find(content => content.key === 'title');
      if (titleContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'title',
          value: translations.titleTrans,
          translatableContentDigest: titleContent.digest
        });
      }
    }

    // 描述翻译
    if (translations.descTrans) {
      const descContent = translatableContent.find(content => content.key === 'body_html');
      if (descContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'body_html',
          value: translations.descTrans,
          translatableContentDigest: descContent.digest
        });
      }
    }

    // SEO标题翻译
    if (translations.seoTitleTrans) {
      const seoTitleContent = translatableContent.find(content => content.key === 'meta_title');
      if (seoTitleContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'meta_title',
          value: translations.seoTitleTrans,
          translatableContentDigest: seoTitleContent.digest
        });
      }
    }

    // SEO描述翻译
    if (translations.seoDescTrans) {
      const seoDescContent = translatableContent.find(content => content.key === 'meta_description');
      if (seoDescContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'meta_description',
          value: translations.seoDescTrans,
          translatableContentDigest: seoDescContent.digest
        });
      }
    }

    if (translationInputs.length === 0) {
      console.log('没有找到可翻译的内容，跳过翻译注册');
      return { success: true, message: '没有可翻译的内容' };
    }

    console.log('准备注册', translationInputs.length, '个翻译');

    // 第三步：注册翻译
    const registerResponse = await admin.graphql(TRANSLATIONS_REGISTER_MUTATION, {
      variables: {
        resourceId: productGid,
        translations: translationInputs
      }
    });

    const registerData = await registerResponse.json();
    
    if (registerData.errors) {
      console.error('注册翻译失败:', registerData.errors);
      throw new Error(`注册翻译失败: ${JSON.stringify(registerData.errors)}`);
    }

    if (registerData.data.translationsRegister.userErrors.length > 0) {
      console.error('翻译注册用户错误:', registerData.data.translationsRegister.userErrors);
      throw new Error(`翻译注册错误: ${JSON.stringify(registerData.data.translationsRegister.userErrors)}`);
    }

    console.log('产品翻译注册成功:', {
      resourceId: productGid,
      locale: targetLocale,
      translationsCount: registerData.data.translationsRegister.translations.length
    });

    return {
      success: true,
      translations: registerData.data.translationsRegister.translations
    };

  } catch (error) {
    console.error('产品翻译注册过程中发生错误:', error);
    throw error;
  }
}

/**
 * 更新集合翻译到Shopify
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} collectionGid - 集合GID
 * @param {Object} translations - 翻译内容
 * @returns {Promise<Object>} 更新结果
 */
export async function updateCollectionTranslation(admin, collectionGid, translations, targetLocale) {
  try {
    console.log('开始注册集合翻译:', {
      collectionGid,
      targetLocale,
      translations: Object.keys(translations).filter(key => translations[key])
    });

    // 第一步：获取可翻译内容和digest
    const translatableResponse = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
      variables: { resourceId: collectionGid }
    });

    const translatableData = await translatableResponse.json();
    
    if (translatableData.errors) {
      console.error('获取可翻译内容失败:', translatableData.errors);
      throw new Error(`获取可翻译内容失败: ${JSON.stringify(translatableData.errors)}`);
    }

    const translatableContent = translatableData.data.translatableResource?.translatableContent || [];
    console.log('获取到可翻译内容:', translatableContent.length, '个字段');

    // 第二步：准备翻译输入
    const translationInputs = [];

    // 标题翻译
    if (translations.titleTrans) {
      const titleContent = translatableContent.find(content => content.key === 'title');
      if (titleContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'title',
          value: translations.titleTrans,
          translatableContentDigest: titleContent.digest
        });
      }
    }

    // 描述翻译
    if (translations.descTrans) {
      const descContent = translatableContent.find(content => content.key === 'body_html');
      if (descContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'body_html',
          value: translations.descTrans,
          translatableContentDigest: descContent.digest
        });
      }
    }

    // SEO标题翻译
    if (translations.seoTitleTrans) {
      const seoTitleContent = translatableContent.find(content => content.key === 'meta_title');
      if (seoTitleContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'meta_title',
          value: translations.seoTitleTrans,
          translatableContentDigest: seoTitleContent.digest
        });
      }
    }

    // SEO描述翻译
    if (translations.seoDescTrans) {
      const seoDescContent = translatableContent.find(content => content.key === 'meta_description');
      if (seoDescContent) {
        translationInputs.push({
          locale: targetLocale,
          key: 'meta_description',
          value: translations.seoDescTrans,
          translatableContentDigest: seoDescContent.digest
        });
      }
    }

    if (translationInputs.length === 0) {
      console.log('没有找到可翻译的内容，跳过翻译注册');
      return { success: true, message: '没有可翻译的内容' };
    }

    console.log('准备注册', translationInputs.length, '个翻译');

    // 第三步：注册翻译
    const registerResponse = await admin.graphql(TRANSLATIONS_REGISTER_MUTATION, {
      variables: {
        resourceId: collectionGid,
        translations: translationInputs
      }
    });

    const registerData = await registerResponse.json();
    
    if (registerData.errors) {
      console.error('注册翻译失败:', registerData.errors);
      throw new Error(`注册翻译失败: ${JSON.stringify(registerData.errors)}`);
    }

    if (registerData.data.translationsRegister.userErrors.length > 0) {
      console.error('翻译注册用户错误:', registerData.data.translationsRegister.userErrors);
      throw new Error(`翻译注册错误: ${JSON.stringify(registerData.data.translationsRegister.userErrors)}`);
    }

    console.log('集合翻译注册成功:', {
      resourceId: collectionGid,
      locale: targetLocale,
      translationsCount: registerData.data.translationsRegister.translations.length
    });

    return {
      success: true,
      translations: registerData.data.translationsRegister.translations
    };

  } catch (error) {
    console.error('集合翻译注册过程中发生错误:', error);
    throw error;
  }
}