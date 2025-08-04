// import { authenticate } from "../shopify.server.js"; // 只在需要时导入

/**
 * Shopify GraphQL查询和变更操作
 */

// 资源类型配置
export const RESOURCE_TYPES = {
  PRODUCT: 'PRODUCT',
  COLLECTION: 'COLLECTION', 
  ARTICLE: 'ARTICLE',
  BLOG: 'BLOG',
  PAGE: 'PAGE',
  MENU: 'MENU',
  LINK: 'LINK',
  FILTER: 'FILTER'
};

// 字段映射配置 - 定义翻译字段到GraphQL字段的映射
export const FIELD_MAPPINGS = {
  [RESOURCE_TYPES.PRODUCT]: {
    titleTrans: 'title',
    descTrans: 'body_html',
    handleTrans: 'handle',
    seoTitleTrans: 'meta_title',
    seoDescTrans: 'meta_description'
  },
  [RESOURCE_TYPES.COLLECTION]: {
    titleTrans: 'title',
    descTrans: 'body_html',
    handleTrans: 'handle',
    seoTitleTrans: 'meta_title',
    seoDescTrans: 'meta_description'
  },
  [RESOURCE_TYPES.ARTICLE]: {
    titleTrans: 'title',
    descTrans: 'body_html',
    handleTrans: 'handle',
    summaryTrans: 'summary_html',
    seoTitleTrans: 'meta_title',
    seoDescTrans: 'meta_description'
  },
  [RESOURCE_TYPES.BLOG]: {
    titleTrans: 'title',
    handleTrans: 'handle',
    seoTitleTrans: 'meta_title',
    seoDescTrans: 'meta_description'
  },
  [RESOURCE_TYPES.PAGE]: {
    titleTrans: 'title',
    descTrans: 'body_html', // 修正：Page资源在translatableContent中使用'body_html'作为主要内容字段
    handleTrans: 'handle',
    seoTitleTrans: 'meta_title',
    seoDescTrans: 'meta_description'
  },
  [RESOURCE_TYPES.MENU]: {
    titleTrans: 'title'
  },
  [RESOURCE_TYPES.LINK]: {
    titleTrans: 'title'
  },
  [RESOURCE_TYPES.FILTER]: {
    labelTrans: 'label'
  }
};

// 资源类型到可翻译字段的映射配置
export const RESOURCE_FIELD_MAPPINGS = {
  [RESOURCE_TYPES.PRODUCT]: ['title', 'body_html', 'handle', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.COLLECTION]: ['title', 'body_html', 'handle', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.ARTICLE]: ['title', 'body_html', 'handle', 'summary', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.BLOG]: ['title', 'handle', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.PAGE]: ['title', 'body', 'handle', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.MENU]: ['title'],
  [RESOURCE_TYPES.LINK]: ['title'],
  [RESOURCE_TYPES.FILTER]: ['label']
};

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

// GraphQL查询：获取单个可翻译资源内容
export const TRANSLATABLE_RESOURCE_QUERY = `
  query getTranslatableResource($resourceId: ID!) {
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

// GraphQL查询：按类型获取可翻译资源列表
const TRANSLATABLE_RESOURCES_BY_TYPE_QUERY = `
  query getTranslatableResourcesByType($resourceType: TranslatableResourceType!, $first: Int, $after: String) {
    translatableResources(resourceType: $resourceType, first: $first, after: $after) {
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
        handle: product.handle || '',
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
        handle: collection.handle || '',
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
  return await updateTranslationByType(admin, productGid, translations, targetLocale, RESOURCE_TYPES.PRODUCT);
}


/**
 * 更新集合翻译到Shopify
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} collectionGid - 集合GID
 * @param {Object} translations - 翻译内容
 * @returns {Promise<Object>} 更新结果
 */
export async function updateCollectionTranslation(admin, collectionGid, translations, targetLocale) {
  return await updateTranslationByType(admin, collectionGid, translations, targetLocale, RESOURCE_TYPES.COLLECTION);
}

/**
 * 通用GraphQL请求执行器，包含重试机制
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} query - GraphQL查询字符串
 * @param {Object} variables - 查询变量
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<Object>} 查询结果
 */
export async function executeGraphQLWithRetry(admin, query, variables = {}, maxRetries = 3) {
  let retryCount = 0;
  let success = false;
  let response, data;

  while (retryCount < maxRetries && !success) {
    try {
      console.log(`执行GraphQL查询 - 尝试: ${retryCount + 1}/${maxRetries}`);
      
      // 设置超时控制
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('GraphQL请求超时')), 30000)
      );
      
      const requestPromise = admin.graphql(query, { variables });
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

  return data;
}

/**
 * 根据资源类型获取正确的描述字段（纯文本）
 * @param {Object} content - 资源内容对象
 * @param {string} resourceType - 资源类型
 * @returns {string} 描述内容
 */
function getDescriptionForResourceType(content, resourceType) {
  if (resourceType === RESOURCE_TYPES.PAGE) {
    // Page资源使用body_html字段存储内容
    return content.body_html || content.body || '';
  } else {
    // 其他资源类型优先使用body_html，然后是body
    return content.body_html || content.body || '';
  }
}

/**
 * 根据资源类型获取正确的HTML描述字段
 * @param {Object} content - 资源内容对象
 * @param {string} resourceType - 资源类型
 * @returns {string} HTML描述内容
 */
function getDescriptionHtmlForResourceType(content, resourceType) {
  if (resourceType === RESOURCE_TYPES.PAGE) {
    // Page资源的body_html字段包含HTML内容
    return content.body_html || content.body || '';
  } else {
    // 其他资源类型使用body_html
    return content.body_html || '';
  }
}

/**
 * 通用资源获取函数 - 使用translatableResources API
 * @param {Object} admin - Shopify Admin API客户端  
 * @param {string} resourceType - 资源类型 (PRODUCT, COLLECTION, ARTICLE, etc.)
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<Array>} 资源列表
 */
export async function fetchResourcesByType(admin, resourceType, maxRetries = 3) {
  const resources = [];
  let cursor = null;
  let hasNextPage = true;

  console.log(`开始获取${resourceType}类型的可翻译资源`);

  while (hasNextPage) {
    const data = await executeGraphQLWithRetry(
      admin, 
      TRANSLATABLE_RESOURCES_BY_TYPE_QUERY, 
      { 
        resourceType: resourceType,
        first: 50,
        after: cursor 
      }, 
      maxRetries
    );

    if (!data.data || !data.data.translatableResources) {
      throw new Error('GraphQL响应数据格式异常');
    }

    const edges = data.data.translatableResources.edges;
    console.log(`成功获取 ${edges.length} 个${resourceType}资源`);
    
    for (const edge of edges) {
      const resource = edge.node;
      
      // 提取基础信息从translatableContent
      const content = {};
      for (const item of resource.translatableContent) {
        content[item.key] = item.value;
      }
      
      // 构建标准化资源对象
      const resourceId = resource.resourceId;
      const numericId = resourceId.split('/').pop();
      
      // 为PAGE资源添加调试日志
      if (resourceType === RESOURCE_TYPES.PAGE) {
        console.log(`[PAGE调试] 资源 ${resourceId} 的可翻译字段:`, Object.keys(content));
        console.log(`[PAGE调试] body_html字段内容:`, content.body_html ? `${content.body_html.substring(0, 100)}...` : '空');
      }
      
      // 根据资源类型构建特定字段
      const resourceData = {
        id: numericId,
        gid: resourceId,
        resourceType: resourceType.toLowerCase(),
        title: content.title || '',
        // 根据资源类型使用正确的内容字段
        description: getDescriptionForResourceType(content, resourceType),
        descriptionHtml: getDescriptionHtmlForResourceType(content, resourceType),
        handle: content.handle || '',
        seoTitle: content.meta_title || '',
        seoDescription: content.meta_description || '',
        // 存储所有可翻译内容供后续使用
        translatableContent: resource.translatableContent
      };

      // 根据资源类型添加特定字段
      if (resourceType === RESOURCE_TYPES.ARTICLE) {
        resourceData.summary = content.summary || '';
      } else if (resourceType === RESOURCE_TYPES.FILTER) {
        resourceData.label = content.label || '';
      }

      // 将其他字段存储在contentFields中
      const otherFields = {};
      for (const [key, value] of Object.entries(content)) {
        if (!['title', 'body', 'body_html', 'handle', 'meta_title', 'meta_description', 'summary', 'label'].includes(key)) {
          otherFields[key] = value;
        }
      }
      if (Object.keys(otherFields).length > 0) {
        resourceData.contentFields = otherFields;
      }

      resources.push(resourceData);
    }

    hasNextPage = data.data.translatableResources.pageInfo.hasNextPage;
    cursor = data.data.translatableResources.pageInfo.endCursor;
  }

  console.log(`总共获取 ${resources.length} 个${resourceType}资源`);
  return resources;
}

/**
 * 通用翻译注册函数
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} resourceGid - 资源GID
 * @param {Object} translations - 翻译内容
 * @param {string} targetLocale - 目标语言
 * @param {Array} fieldMapping - 字段映射配置
 * @returns {Promise<Object>} 注册结果
 */
export async function updateResourceTranslation(admin, resourceGid, translations, targetLocale, resourceType) {
  try {
    // 如果传入的是资源类型字符串，获取对应的字段映射
    const fieldMapping = typeof resourceType === 'string' 
      ? FIELD_MAPPINGS[resourceType] 
      : resourceType;
      
    if (!fieldMapping) {
      throw new Error(`不支持的资源类型或无效的字段映射: ${resourceType}`);
    }
    
    console.log('🚀 开始注册资源翻译:', {
      resourceGid,
      targetLocale,
      resourceType,
      translations: Object.keys(translations).filter(key => translations[key])
    });

    // 第一步：获取可翻译内容和digest
    console.log('📋 第一步：查询可翻译资源...');
    const data = await executeGraphQLWithRetry(
      admin, 
      TRANSLATABLE_RESOURCE_QUERY, 
      { resourceId: resourceGid }
    );

    const translatableContent = data.data.translatableResource?.translatableContent || [];
    console.log(`✅ 获取到可翻译内容: ${translatableContent.length} 个字段`);
    
    // 详细输出可翻译内容
    console.log('📝 可翻译内容详情:');
    translatableContent.forEach((item, index) => {
      console.log(`  ${index + 1}. Key: "${item.key}"`);
      console.log(`     Value: "${item.value?.substring(0, 100)}..."`);
      console.log(`     Digest: ${item.digest}`);
      console.log(`     Locale: ${item.locale}`);
    });

    // 第二步：准备翻译输入
    console.log('🔧 第二步：准备翻译输入...');
    const translationInputs = [];

    // 使用字段映射配置来处理翻译
    console.log('🗺️ 字段映射配置:', fieldMapping);
    console.log('📥 收到的翻译数据:', Object.keys(translations).filter(key => translations[key]));
    
    for (const [translationKey, contentKey] of Object.entries(fieldMapping)) {
      if (translations[translationKey]) {
        console.log(`🔍 处理字段映射: ${translationKey} -> ${contentKey}`);
        const content = translatableContent.find(item => item.key === contentKey);
        if (content) {
          const translationInput = {
            locale: targetLocale,
            key: contentKey,
            value: translations[translationKey],
            translatableContentDigest: content.digest
          };
          translationInputs.push(translationInput);
          console.log(`✅ 成功添加翻译输入:`, {
            key: contentKey,
            valueLength: translations[translationKey].length,
            valuePreview: translations[translationKey].substring(0, 50) + '...'
          });
        } else {
          console.log(`❌ 警告：未找到对应的可翻译内容，字段key: "${contentKey}"`);
          console.log(`   可用的字段keys: [${translatableContent.map(item => `"${item.key}"`).join(', ')}]`);
        }
      }
    }

    if (translationInputs.length === 0) {
      console.log('⚠️ 警告：没有找到可翻译的内容，跳过翻译注册');
      return { 
        success: true, 
        message: '没有可翻译的内容',
        details: {
          availableKeys: translatableContent.map(item => item.key),
          mappedKeys: Object.values(fieldMapping),
          providedTranslations: Object.keys(translations).filter(key => translations[key])
        }
      };
    }

    console.log(`🎯 准备注册 ${translationInputs.length} 个翻译`);
    console.log('📤 翻译输入详情:', JSON.stringify(translationInputs, null, 2));

    // 第三步：注册翻译
    console.log('💾 第三步：注册翻译到Shopify...');
    const registerData = await executeGraphQLWithRetry(
      admin,
      TRANSLATIONS_REGISTER_MUTATION,
      {
        resourceId: resourceGid,
        translations: translationInputs
      }
    );

    console.log('📊 翻译注册响应:', JSON.stringify(registerData, null, 2));

    if (registerData.data.translationsRegister.userErrors.length > 0) {
      console.error('❌ 翻译注册用户错误:', registerData.data.translationsRegister.userErrors);
      throw new Error(`翻译注册错误: ${JSON.stringify(registerData.data.translationsRegister.userErrors)}`);
    }

    console.log('🎉 资源翻译注册成功:', {
      resourceId: resourceGid,
      locale: targetLocale,
      translationsCount: registerData.data.translationsRegister.translations.length,
      successfulTranslations: registerData.data.translationsRegister.translations.map(t => ({
        key: t.key,
        locale: t.locale
      }))
    });

    return {
      success: true,
      translations: registerData.data.translationsRegister.translations,
      details: {
        processedInputs: translationInputs.length,
        successfulRegistrations: registerData.data.translationsRegister.translations.length
      }
    };

  } catch (error) {
    console.error('💥 资源翻译注册过程中发生错误:', error);
    console.error('错误堆栈:', error.stack);
    throw error;
  }
}

/**
 * 根据资源类型获取对应的字段映射并调用通用翻译函数
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} resourceGid - 资源GID
 * @param {Object} translations - 翻译内容
 * @param {string} targetLocale - 目标语言
 * @param {string} resourceType - 资源类型
 * @returns {Promise<Object>} 注册结果
 */
export async function updateTranslationByType(admin, resourceGid, translations, targetLocale, resourceType) {
  const fieldMapping = FIELD_MAPPINGS[resourceType];
  if (!fieldMapping) {
    throw new Error(`不支持的资源类型: ${resourceType}`);
  }
  
  return await updateResourceTranslation(admin, resourceGid, translations, targetLocale, fieldMapping);
}

/**
 * 便捷函数：获取文章资源
 */
export async function fetchAllArticles(admin, maxRetries = 3) {
  return await fetchResourcesByType(admin, RESOURCE_TYPES.ARTICLE, maxRetries);
}

/**
 * 便捷函数：获取博客资源
 */
export async function fetchAllBlogs(admin, maxRetries = 3) {
  return await fetchResourcesByType(admin, RESOURCE_TYPES.BLOG, maxRetries);
}

/**
 * 便捷函数：获取页面资源
 */
export async function fetchAllPages(admin, maxRetries = 3) {
  return await fetchResourcesByType(admin, RESOURCE_TYPES.PAGE, maxRetries);
}

/**
 * 便捷函数：获取菜单资源
 */
export async function fetchAllMenus(admin, maxRetries = 3) {
  return await fetchResourcesByType(admin, RESOURCE_TYPES.MENU, maxRetries);
}

/**
 * 便捷函数：获取过滤器资源
 */
export async function fetchAllFilters(admin, maxRetries = 3) {
  return await fetchResourcesByType(admin, RESOURCE_TYPES.FILTER, maxRetries);
}