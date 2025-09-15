// import { authenticate } from "../shopify.server.js"; // 只在需要时导入

/**
 * Shopify GraphQL查询和变更操作
 */

/**
 * 清洗翻译值，确保数据有效
 * @param {any} value - 待清洗的值
 * @param {any} fallback - 回退值（可选）
 * @returns {{value: string, skipped: boolean, reason?: string}} 清洗结果
 */
function sanitizeTranslationValue(value, fallback = null) {
  // 处理字符串类型
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return {
        value: fallback || '',
        skipped: true,
        reason: 'empty_string'
      };
    }
    return {
      value: trimmed,
      skipped: false
    };
  }

  // 处理非字符串类型（转JSON）
  if (value != null) {
    const jsonString = JSON.stringify(value);
    if (jsonString === '{}' || jsonString === '[]' || jsonString === 'null') {
      return {
        value: fallback || '',
        skipped: true,
        reason: 'empty_object'
      };
    }
    return {
      value: jsonString,
      skipped: false
    };
  }

  // null或undefined
  return {
    value: fallback || '',
    skipped: true,
    reason: 'null_value'
  };
}

// 资源类型配置
export const RESOURCE_TYPES = {
  // 现有资源类型
  PRODUCT: 'PRODUCT',
  COLLECTION: 'COLLECTION', 
  ARTICLE: 'ARTICLE',
  BLOG: 'BLOG',
  PAGE: 'PAGE',
  MENU: 'MENU',
  LINK: 'LINK',
  FILTER: 'FILTER',
  
  // A. Theme相关资源 (7个)
  ONLINE_STORE_THEME: 'ONLINE_STORE_THEME',
  ONLINE_STORE_THEME_APP_EMBED: 'ONLINE_STORE_THEME_APP_EMBED',
  ONLINE_STORE_THEME_JSON_TEMPLATE: 'ONLINE_STORE_THEME_JSON_TEMPLATE',
  ONLINE_STORE_THEME_LOCALE_CONTENT: 'ONLINE_STORE_THEME_LOCALE_CONTENT',
  ONLINE_STORE_THEME_SECTION_GROUP: 'ONLINE_STORE_THEME_SECTION_GROUP',
  ONLINE_STORE_THEME_SETTINGS_CATEGORY: 'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
  ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS: 'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS',
  
  // B. 产品相关资源 (4个)
  PRODUCT_OPTION: 'PRODUCT_OPTION',
  PRODUCT_OPTION_VALUE: 'PRODUCT_OPTION_VALUE',
  SELLING_PLAN: 'SELLING_PLAN',
  SELLING_PLAN_GROUP: 'SELLING_PLAN_GROUP',
  
  // C. 店铺设置相关 (2个)
  SHOP: 'SHOP',
  SHOP_POLICY: 'SHOP_POLICY',
  
  // D. 其他尝试（按官方分类）
  METAFIELD: 'METAFIELD' // 若后端不支持，该类型不会返回数据
};;

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
// 新增资源类型的字段映射
export const EXTENDED_FIELD_MAPPINGS = {
  // A. Theme相关资源 - 动态字段，需要在运行时获取
  [RESOURCE_TYPES.ONLINE_STORE_THEME]: {
    // 动态字段，基于theme data
    dynamic: true
  },
  [RESOURCE_TYPES.ONLINE_STORE_THEME_APP_EMBED]: {
    // 动态字段，基于theme data
    dynamic: true
  },
  [RESOURCE_TYPES.ONLINE_STORE_THEME_JSON_TEMPLATE]: {
    // 动态字段，基于theme data
    dynamic: true
  },
  [RESOURCE_TYPES.ONLINE_STORE_THEME_LOCALE_CONTENT]: {
    // 动态字段，基于theme data
    dynamic: true
  },
  [RESOURCE_TYPES.ONLINE_STORE_THEME_SECTION_GROUP]: {
    // 动态字段，基于theme data
    dynamic: true
  },
  [RESOURCE_TYPES.ONLINE_STORE_THEME_SETTINGS_CATEGORY]: {
    // 动态字段，基于theme data
    dynamic: true
  },
  [RESOURCE_TYPES.ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS]: {
    // 动态字段，基于theme data
    dynamic: true
  },
  
  // B. 产品相关资源
  [RESOURCE_TYPES.PRODUCT_OPTION]: {
    nameTrans: 'name'
  },
  [RESOURCE_TYPES.PRODUCT_OPTION_VALUE]: {
    nameTrans: 'name'
  },
  [RESOURCE_TYPES.SELLING_PLAN]: {
    nameTrans: 'name',
    descriptionTrans: 'description'
  },
  [RESOURCE_TYPES.SELLING_PLAN_GROUP]: {
    nameTrans: 'name',
    descriptionTrans: 'description',
    optionsTitleTrans: 'options.title'
  },
  
  // C. 店铺设置相关
  [RESOURCE_TYPES.SHOP]: {
    nameTrans: 'name',
    descriptionTrans: 'description',
    announcementTrans: 'announcement'
  },
  [RESOURCE_TYPES.SHOP_POLICY]: {
    // 店铺政策有多种类型
    titleTrans: 'title',
    bodyTrans: 'body'
  }
};

// 合并所有字段映射
export const ALL_FIELD_MAPPINGS = {
  ...FIELD_MAPPINGS,
  ...EXTENDED_FIELD_MAPPINGS
};

// 资源类型到可翻译字段的映射配置
export const RESOURCE_FIELD_MAPPINGS = {
  [RESOURCE_TYPES.PRODUCT]: ['title', 'body_html', 'handle', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.COLLECTION]: ['title', 'body_html', 'handle', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.ARTICLE]: ['title', 'body_html', 'handle', 'summary', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.BLOG]: ['title', 'handle', 'meta_title', 'meta_description'],
  [RESOURCE_TYPES.PAGE]: ['title', 'body_html', 'handle', 'meta_title', 'meta_description'], // 修复：统一使用body_html与翻译字段映射保持一致
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
      const productId = product.id.replace('gid://shopify/Product/', '');
      products.push({
        id: productId,
        originalId: productId, // 添加originalId字段
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
      const collectionId = collection.id.replace('gid://shopify/Collection/', '');
      collections.push({
        id: collectionId,
        originalId: collectionId, // 添加originalId字段
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
        originalId: numericId, // 添加originalId字段
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

// 获取单个产品的选项（按需懒加载）
export async function fetchOptionsForProduct(admin, productGid, maxRetries = 3) {
  const QUERY = `#graphql
    query ProductOptions($id: ID!) {
      product(id: $id) {
        id
        options {
          name
          values
        }
      }
    }
  `;
  const data = await executeGraphQLWithRetry(admin, QUERY, { id: productGid }, maxRetries);
  const options = data?.data?.product?.options || [];
  return options.map(opt => ({ name: opt.name, values: opt.values || [] }));
}

// 翻译单个metafield
export async function updateMetafieldTranslation(admin, metafieldGid, translatedValue, targetLocale, maxRetries = 3) {
  try {
    console.log(`🔧 开始翻译metafield: ${metafieldGid} -> ${targetLocale}`);

    // 第一步：获取metafield的可翻译内容digest
    const data = await executeGraphQLWithRetry(
      admin,
      TRANSLATABLE_RESOURCE_QUERY,
      { resourceId: metafieldGid },
      maxRetries
    );

    const translatableContent = data.data.translatableResource?.translatableContent || [];
    console.log(`📋 获取到 ${translatableContent.length} 个可翻译字段`);

    if (translatableContent.length === 0) {
      console.log('⚠️ 未找到可翻译内容，可能是metafield不支持翻译');
      return {
        success: false,
        message: 'Metafield不支持翻译或未找到可翻译内容'
      };
    }

    // 对于metafield，通常使用'value'作为可翻译字段的key
    const valueContent = translatableContent.find(item => item.key === 'value');
    if (!valueContent) {
      console.log('❌ 未找到value字段的可翻译内容');
      return {
        success: false,
        message: '未找到metafield的value字段可翻译内容'
      };
    }

    // 第二步：准备翻译输入
    const translationInput = {
      locale: targetLocale,
      key: 'value',
      value: translatedValue,
      translatableContentDigest: valueContent.digest
    };

    console.log('📤 准备翻译注册:', JSON.stringify(translationInput, null, 2));

    // 第三步：注册翻译
    const registerData = await executeGraphQLWithRetry(
      admin,
      TRANSLATIONS_REGISTER_MUTATION,
      {
        resourceId: metafieldGid,
        translations: [translationInput]
      },
      maxRetries
    );

    console.log('📊 翻译注册响应:', JSON.stringify(registerData, null, 2));

    if (registerData.data.translationsRegister.userErrors.length > 0) {
      console.error('❌ 翻译注册失败:', registerData.data.translationsRegister.userErrors);
      return {
        success: false,
        message: `翻译注册失败: ${registerData.data.translationsRegister.userErrors.map(e => e.message).join(', ')}`,
        errors: registerData.data.translationsRegister.userErrors
      };
    }

    const registeredTranslations = registerData.data.translationsRegister.translations || [];
    console.log(`✅ Metafield翻译注册成功，注册了 ${registeredTranslations.length} 个翻译`);

    return {
      success: true,
      message: 'Metafield翻译注册成功',
      translations: registeredTranslations
    };

  } catch (error) {
    console.error('❌ updateMetafieldTranslation错误:', error);
    return {
      success: false,
      message: `翻译metafield失败: ${error.message}`,
      error: error.message
    };
  }
}

// 获取单个产品的 metafields（按需懒加载）
export async function fetchMetafieldsForProduct(admin, productGid, maxRetries = 3) {
  const QUERY = `#graphql
    query ProductMetafields($id: ID!, $first: Int = 50) {
      product(id: $id) {
        id
        metafields(first: $first) {
          edges {
            node {
              id
              namespace
              key
              type
              value
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQLWithRetry(admin, QUERY, { id: productGid, first: 50 }, maxRetries);
  const edges = data?.data?.product?.metafields?.edges || [];
  return edges.map(({ node }) => ({
    id: node.id,
    namespace: node.namespace,
    key: node.key,
    type: node.type,
    value: node.value
  }));
}

// 获取Theme相关资源
export async function fetchThemeResources(admin, resourceType, maxRetries = 3) {
  const resources = [];
  let cursor = null;
  let hasNextPage = true;

  console.log(`开始获取Theme类型 ${resourceType} 的可翻译资源`);

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
      throw new Error('Theme资源GraphQL响应数据格式异常');
    }

    const edges = data.data.translatableResources.edges;
    console.log(`成功获取 ${edges.length} 个${resourceType}资源`);
    
    for (const edge of edges) {
      const resource = edge.node;
      const resourceId = resource.resourceId;
      
      // Theme资源有动态字段，需要动态构建
      const dynamicContent = {};
      const translatableFields = [];
      
      // 定义标题字段的优先级规则
      const TITLE_KEY_PRIORITIES = [
        { pattern: /^title$/i, priority: 1 },           // 精确匹配 title
        { pattern: /^heading$/i, priority: 2 },         // 精确匹配 heading
        { pattern: /^name$/i, priority: 3 },            // 精确匹配 name
        { pattern: /\.title$/i, priority: 4 },          // 以.title结尾（如page.title）
        { pattern: /^subheading$/i, priority: 5 },      // subheading
        { pattern: /title/i, priority: 6 },             // 包含title
        { pattern: /heading/i, priority: 7 },           // 包含heading
        { pattern: /name/i, priority: 8 },              // 包含name
      ];
      
      // 使用优先级系统查找最合适的标题
      let bestTitle = null;
      let bestPriority = Infinity;
      
      for (const item of resource.translatableContent) {
        dynamicContent[item.key] = {
          value: item.value,
          digest: item.digest,
          locale: item.locale
        };
        translatableFields.push({
          key: item.key,
          label: item.key.split('.').pop(), // 简化的标签
          value: item.value
        });
        
        // 检查是否是更好的标题字段
        for (const rule of TITLE_KEY_PRIORITIES) {
          if (rule.pattern.test(item.key) && rule.priority < bestPriority) {
            // 排除Liquid模板变量（包含{{和}}的内容）
            const value = item.value;
            if (value && typeof value === 'string' && !value.includes('{{') && !value.includes('}}')) {
              bestTitle = value;
              bestPriority = rule.priority;
              break; // 找到匹配就跳出内层循环
            }
          }
        }
      }
      
      // 从resourceId中提取信息
      const idParts = resourceId.split('/');
      let rawLastIdPart = idParts[idParts.length - 1];
      
      // 立即清理查询参数和锚点
      const cleanedId = rawLastIdPart.split('?')[0].split('#')[0];
      
      // 初始化变量
      // 对于Theme资源，优先使用文件名作为标题
      let displayTitle = bestTitle;
      let fileId = cleanedId; // 使用清理后的ID作为默认fileId
      let filePath = null;
      
      // 对于Theme JSON Template，不使用从内容中提取的标题
      if (resourceType === 'ONLINE_STORE_THEME_JSON_TEMPLATE' && bestTitle && bestTitle.includes('{{')) {
        displayTitle = null; // 清除包含Liquid变量的标题
        bestTitle = null;
      }
      
      // 检查是否是标准的Theme文件格式（type.name）
      const themeFilePattern = /^(product|products?|page|collection|collections?|article|articles?|blog|blogs?|password|index|cart|search|404|gift_card|customers?|account|activate_account|addresses|login|order|register|reset_password)\.(.+)$/i;
      const themeMatch = cleanedId.match(themeFilePattern);
      
      if (themeMatch) {
        // 处理标准Theme文件格式（如 product.1-tent, page.affiliate）
        const [, fileType, fileName] = themeMatch;
        
        // 基于文件名生成标题（优先使用文件名，而不是内容中的标题）
        displayTitle = fileName
          .replace(/[-_]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        displayTitle = `${fileType.charAt(0).toUpperCase() + fileType.slice(1)}: ${displayTitle}`;
        
        // 使用原始的清理后ID作为fileId（保持原格式）
        fileId = cleanedId;
        
      } else if (cleanedId.includes('/')) {
        // 处理包含路径的资源ID（如 templates/index, sections/header）
        filePath = cleanedId;
        
        // 生成友好的显示标题
        const pathParts = filePath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        const directory = pathParts.slice(0, -1).join('/');
        
        // 格式化文件名作为标题（优先使用文件路径）
        displayTitle = fileName
          .replace(/[-_]/g, ' ')
          .replace(/\.(json|liquid)$/i, '')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        if (directory) {
          displayTitle = `${directory.charAt(0).toUpperCase() + directory.slice(1)}: ${displayTitle}`;
        }
        
        // 使用原始路径作为文件ID（规范化）
        fileId = filePath
          .replace(/\.(json|liquid)$/i, '')
          .replace(/[^a-z0-9\/\-_\.]/gi, '-')
          .replace(/\/+/g, '.')  // 将路径分隔符转换为点
          .toLowerCase();
      } else {
        // 处理其他情况（没有匹配标准格式或路径格式）
        // 对于Theme资源，始终基于ID生成标题，而不使用内容中的标题
        if (!displayTitle || resourceType.startsWith('ONLINE_STORE_THEME')) {
          // 如果没有找到标题或名称，尝试从ID解析
          if (cleanedId.includes('-')) {
            // 移除最后的随机ID部分（如-FNwr3q）
            let cleanId = cleanedId;
            
            // 检查是否有类似 -XXXXX 的随机后缀（5个或更多字符）
            const randomSuffixMatch = cleanedId.match(/^(.+)-[A-Za-z0-9]{5,}$/);
            if (randomSuffixMatch) {
              cleanId = randomSuffixMatch[1];
            }
            
            // 将连字符转换为空格，并首字母大写
            displayTitle = cleanId
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
          } else {
            // 使用资源类型的友好名称
            const typeMap = {
              'ONLINE_STORE_THEME': '主题',
              'ONLINE_STORE_THEME_APP_EMBED': '应用嵌入',
              'ONLINE_STORE_THEME_JSON_TEMPLATE': 'JSON模板',
              'ONLINE_STORE_THEME_LOCALE_CONTENT': '本地化内容',
              'ONLINE_STORE_THEME_SECTION_GROUP': '区块组',
              'ONLINE_STORE_THEME_SETTINGS_CATEGORY': '主题设置分类',
              'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS': '静态区块'
            };
            displayTitle = typeMap[resourceType] || `Theme ${resourceType.replace(/_/g, ' ').toLowerCase()}`;
            
            // 如果有ID信息，添加到标题中
            if (cleanedId && cleanedId !== resourceId) {
              displayTitle += ` - ${cleanedId}`;
            }
          }
        }
        
        // 如果fileId还没有被设置或需要重新生成
        if (fileId === cleanedId && cleanedId.includes('-')) {
          // 对于包含随机后缀的ID，尝试清理
          const randomSuffixMatch = cleanedId.match(/^(.+)-[A-Za-z0-9]{5,}$/);
          if (randomSuffixMatch) {
            fileId = randomSuffixMatch[1];
          }
        }
      }
      
      // 如果处理后为空或太短，使用清理后的ID
      if (!fileId || fileId.length < 2) {
        // 使用cleanedId作为fileId，保留点号作为分隔符
        const cleanedFileId = cleanedId
          .replace(/[^a-z0-9.-]/gi, '-')  // 清理特殊字符，保留点号
          .replace(/-+/g, '-')  // 合并连字符
          .replace(/^-|-$/g, '');  // 移除首尾连字符
        
        fileId = cleanedFileId || 'theme-resource';
      }
      
      const resourceData = {
        id: fileId,  // 使用清理后的fileId（如 product.1-tent）
        // 不再使用 originalId，因为数据库中没有对应字段
        filePath: filePath || cleanedId,  // 使用文件路径或清理后的ID
        gid: resourceId,
        resourceType: resourceType.toLowerCase(),
        title: displayTitle,
        description: `${translatableFields.length} 个可翻译字段`,
        // 将Theme特定字段存储在contentFields中
        contentFields: {
          dynamicFields: dynamicContent,
          translatableFields: translatableFields,
          translatableContent: resource.translatableContent
        }
      };

      resources.push(resourceData);
    }

    hasNextPage = data.data.translatableResources.pageInfo.hasNextPage;
    cursor = data.data.translatableResources.pageInfo.endCursor;
  }

  console.log(`总共获取 ${resources.length} 个${resourceType}资源`);
  return resources;
}

// 获取产品选项和选项值
export async function fetchProductOptions(admin, maxRetries = 3) {
  const resources = [];
  let cursor = null;
  let hasNextPage = true;

  console.log('开始获取产品选项资源');

  while (hasNextPage) {
    const data = await executeGraphQLWithRetry(
      admin, 
      TRANSLATABLE_RESOURCES_BY_TYPE_QUERY, 
      { 
        resourceType: RESOURCE_TYPES.PRODUCT_OPTION,
        first: 50,
        after: cursor 
      }, 
      maxRetries
    );

    if (!data.data || !data.data.translatableResources) {
      throw new Error('产品选项GraphQL响应数据格式异常');
    }

    const edges = data.data.translatableResources.edges;
    
    for (const edge of edges) {
      const resource = edge.node;
      const content = {};
      
      for (const item of resource.translatableContent) {
        content[item.key] = item.value;
      }
      
      const resourceId = resource.resourceId.split('/').pop();
      const resourceData = {
        id: resourceId,
        originalId: resourceId, // 添加originalId字段
        gid: resource.resourceId,
        resourceType: 'product_option',
        title: content.name || '',
        description: '产品选项',
        name: content.name || '',
        translatableContent: resource.translatableContent
      };

      resources.push(resourceData);
    }

    hasNextPage = data.data.translatableResources.pageInfo.hasNextPage;
    cursor = data.data.translatableResources.pageInfo.endCursor;
  }

  console.log(`总共获取 ${resources.length} 个产品选项`);
  return resources;
}

// 获取销售计划
export async function fetchSellingPlans(admin, maxRetries = 3) {
  const resources = [];
  let cursor = null;
  let hasNextPage = true;

  console.log('开始获取销售计划资源');

  while (hasNextPage) {
    const data = await executeGraphQLWithRetry(
      admin, 
      TRANSLATABLE_RESOURCES_BY_TYPE_QUERY, 
      { 
        resourceType: RESOURCE_TYPES.SELLING_PLAN,
        first: 50,
        after: cursor 
      }, 
      maxRetries
    );

    if (!data.data || !data.data.translatableResources) {
      throw new Error('销售计划GraphQL响应数据格式异常');
    }

    const edges = data.data.translatableResources.edges;
    
    for (const edge of edges) {
      const resource = edge.node;
      const content = {};
      
      for (const item of resource.translatableContent) {
        content[item.key] = item.value;
      }
      
      const resourceId = resource.resourceId.split('/').pop();
      const resourceData = {
        id: resourceId,
        originalId: resourceId, // 添加originalId字段
        gid: resource.resourceId,
        resourceType: 'selling_plan',
        title: content.name || '',
        description: content.description || '',
        name: content.name || '',
        translatableContent: resource.translatableContent
      };

      resources.push(resourceData);
    }

    hasNextPage = data.data.translatableResources.pageInfo.hasNextPage;
    cursor = data.data.translatableResources.pageInfo.endCursor;
  }

  console.log(`总共获取 ${resources.length} 个销售计划`);
  return resources;
}

// 获取店铺信息和政策
export async function fetchShopInfo(admin, resourceType, maxRetries = 3) {
  const resources = [];
  
  console.log(`开始获取店铺资源: ${resourceType}`);

  const data = await executeGraphQLWithRetry(
    admin, 
    TRANSLATABLE_RESOURCES_BY_TYPE_QUERY, 
    { 
      resourceType: resourceType,
      first: 50
    }, 
    maxRetries
  );

  if (!data.data || !data.data.translatableResources) {
    throw new Error('店铺资源GraphQL响应数据格式异常');
  }

  const edges = data.data.translatableResources.edges;
  
  for (const edge of edges) {
    const resource = edge.node;
    const content = {};
    
    for (const item of resource.translatableContent) {
      content[item.key] = item.value;
    }
    
    const resourceId = resource.resourceId.split('/').pop();
    const resourceData = {
      id: resourceId,
      originalId: resourceId, // 添加originalId字段
      gid: resource.resourceId,
      resourceType: resourceType.toLowerCase(),
      title: content.title || content.name || '店铺信息',
      description: content.body || content.description || '',
      translatableContent: resource.translatableContent
    };

    // 特定字段处理
    if (resourceType === RESOURCE_TYPES.SHOP) {
      resourceData.name = content.name || '';
      resourceData.announcement = content.announcement || '';
    } else if (resourceType === RESOURCE_TYPES.SHOP_POLICY) {
      resourceData.body = content.body || '';
      resourceData.policyType = resource.resourceId.includes('RefundPolicy') ? 'refund' :
                               resource.resourceId.includes('PrivacyPolicy') ? 'privacy' :
                               resource.resourceId.includes('TermsOfService') ? 'terms' :
                               resource.resourceId.includes('ShippingPolicy') ? 'shipping' : 'other';
    }

    resources.push(resourceData);
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
    let fieldMapping = typeof resourceType === 'string' 
      ? (ALL_FIELD_MAPPINGS[resourceType] || FIELD_MAPPINGS[resourceType])
      : resourceType;
      
    // 检查是否为动态字段资源（Theme相关）
    if (fieldMapping && fieldMapping.dynamic) {
      console.log(`🎨 检测到动态字段资源类型: ${resourceType}`);
      // 对于动态字段资源，从translationFields构建映射
      if (translations.translationFields && typeof translations.translationFields === 'object') {
        const translationFieldsKeys = Object.keys(translations.translationFields);
        if (translationFieldsKeys.length === 0) {
          console.warn('⚠️ Theme资源translationFields为空，可能是contentFields数据缺失');
          return { 
            success: false, 
            message: 'Theme资源翻译字段为空，请确认资源已正确扫描并包含contentFields数据' 
          };
        }
        fieldMapping = {};
        // 将translationFields中的每个字段添加到映射
        for (const [key, value] of Object.entries(translations.translationFields)) {
          fieldMapping[key] = key; // 动态字段直接使用相同的key
        }
        console.log('🔧 动态构建的字段映射:', fieldMapping);
      } else {
        console.log('⚠️ 动态字段资源缺少translationFields');
        return { 
          success: false, 
          message: '动态字段资源缺少翻译内容，请重新扫描Theme资源' 
        };
      }
    }
      
    if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
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

    // 数据清洗统计
    const sanitizationStats = {
      total: 0,
      skipped: 0,
      reasons: {}
    };

    // 使用字段映射配置来处理翻译
    console.log('🗺️ 字段映射配置:', fieldMapping);
    console.log('📥 收到的翻译数据:', Object.keys(translations).filter(key => translations[key]));
    
    // 处理标准字段翻译
    for (const [translationKey, contentKey] of Object.entries(fieldMapping)) {
      // 先检查标准字段
      if (translations[translationKey]) {
        console.log(`🔍 处理字段映射: ${translationKey} -> ${contentKey}`);
        const content = translatableContent.find(item => item.key === contentKey);
        if (content) {
          // 应用数据清洗
          sanitizationStats.total++;
          const sanitizedValue = sanitizeTranslationValue(translations[translationKey]);

          if (sanitizedValue.shouldSkip) {
            sanitizationStats.skipped++;
            sanitizationStats.reasons[sanitizedValue.reason] = (sanitizationStats.reasons[sanitizedValue.reason] || 0) + 1;
            console.log(`⏭️ 跳过标准字段 "${contentKey}": ${sanitizedValue.reason}`);
            continue;
          }

          const translationInput = {
            locale: targetLocale,
            key: contentKey,
            value: sanitizedValue.value,
            translatableContentDigest: content.digest
          };
          translationInputs.push(translationInput);
          console.log(`✅ 成功添加翻译输入:`, {
            key: contentKey,
            valueLength: sanitizedValue.value.length,
            valuePreview: sanitizedValue.value.substring(0, 50) + '...'
          });
        } else {
          console.log(`❌ 警告：未找到对应的可翻译内容，字段key: "${contentKey}"`);
          console.log(`   可用的字段keys: [${translatableContent.map(item => `"${item.key}"`).join(', ')}]`);
        }
      }
    }
    
    // 特别处理translationFields中的动态字段
    if (translations.translationFields) {
      console.log('🎯 处理动态字段翻译...');
      
      // 检查是否是Theme资源的嵌套结构（包含dynamicFields）
      if (translations.translationFields.dynamicFields) {
        console.log('📦 检测到Theme资源的dynamicFields结构');
        
        // 处理Theme资源的dynamicFields
        for (const [fieldKey, fieldData] of Object.entries(translations.translationFields.dynamicFields)) {
          console.log(`🔍 处理Theme动态字段: ${fieldKey}`);
          const content = translatableContent.find(item => item.key === fieldKey);
          
          if (content && fieldData) {
            // 提取value（可能是字符串或对象中的value属性）
            // 使用hasOwnProperty避免空字符串被误判为falsy
            const fieldValue = Object.prototype.hasOwnProperty.call(fieldData, 'value')
              ? fieldData.value
              : fieldData;

            // 应用数据清洗
            sanitizationStats.total++;
            const sanitizedValue = sanitizeTranslationValue(fieldValue);

            if (sanitizedValue.shouldSkip) {
              sanitizationStats.skipped++;
              sanitizationStats.reasons[sanitizedValue.reason] = (sanitizationStats.reasons[sanitizedValue.reason] || 0) + 1;
              console.log(`⏭️ 跳过Theme动态字段 "${fieldKey}": ${sanitizedValue.reason}`);
              continue;
            }

            const translationInput = {
              locale: targetLocale,
              key: fieldKey,
              value: sanitizedValue.value,
              translatableContentDigest: fieldData.digest || content.digest
            };
            translationInputs.push(translationInput);
            console.log(`✅ 成功添加Theme动态字段翻译:`, {
              key: fieldKey,
              valueType: typeof sanitizedValue.value,
              hasDigest: !!(fieldData.digest || content.digest),
              valuePreview: sanitizedValue.value.substring(0, 50) + '...',
              originalValueType: typeof fieldValue
            });
          } else {
            console.log(`⚠️ Theme动态字段未找到可翻译内容: "${fieldKey}"`);
          }
        }
      }
      
      // 处理Theme资源的translatableFields（如果存在）
      if (translations.translationFields.translatableFields && Array.isArray(translations.translationFields.translatableFields)) {
        console.log('📦 检测到Theme资源的translatableFields数组');
        
        for (const field of translations.translationFields.translatableFields) {
          if (field.key && field.value) {
            const content = translatableContent.find(item => item.key === field.key);

            if (content) {
              // 应用数据清洗
              sanitizationStats.total++;
              const sanitizedValue = sanitizeTranslationValue(field.value);

              if (sanitizedValue.shouldSkip) {
                sanitizationStats.skipped++;
                sanitizationStats.reasons[sanitizedValue.reason] = (sanitizationStats.reasons[sanitizedValue.reason] || 0) + 1;
                console.log(`⏭️ 跳过Theme translatable字段 "${field.key}": ${sanitizedValue.reason}`);
                continue;
              }

              const translationInput = {
                locale: targetLocale,
                key: field.key,
                value: sanitizedValue.value,
                translatableContentDigest: field.digest || content.digest
              };
              translationInputs.push(translationInput);
              console.log(`✅ 成功添加Theme translatable字段:`, {
                key: field.key,
                valuePreview: sanitizedValue.value.substring(0, 50) + '...'
              });
            }
          }
        }
      }
      
      // 处理普通的translationFields（非Theme资源）
      const isThemeResource = translations.translationFields.dynamicFields || translations.translationFields.translatableFields;
      if (!isThemeResource) {
        console.log('📝 处理标准translationFields结构');
        for (const [fieldKey, fieldValue] of Object.entries(translations.translationFields)) {
          console.log(`🔍 处理标准动态字段: ${fieldKey}`);
          const content = translatableContent.find(item => item.key === fieldKey);
          if (content) {
            // 标准化字段值
            const standardizedValue = typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue);

            // 应用数据清洗
            sanitizationStats.total++;
            const sanitizedValue = sanitizeTranslationValue(standardizedValue);

            if (sanitizedValue.shouldSkip) {
              sanitizationStats.skipped++;
              sanitizationStats.reasons[sanitizedValue.reason] = (sanitizationStats.reasons[sanitizedValue.reason] || 0) + 1;
              console.log(`⏭️ 跳过标准动态字段 "${fieldKey}": ${sanitizedValue.reason}`);
              continue;
            }

            const translationInput = {
              locale: targetLocale,
              key: fieldKey,
              value: sanitizedValue.value,
              translatableContentDigest: content.digest
            };
            translationInputs.push(translationInput);
            console.log(`✅ 成功添加标准动态字段翻译:`, {
              key: fieldKey,
              valueType: typeof fieldValue,
              valuePreview: sanitizedValue.value.substring(0, 50) + '...'
            });
          } else {
            console.log(`⚠️ 标准动态字段未找到可翻译内容: "${fieldKey}"`);
          }
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

    // 输出数据清洗统计报告
    console.log('🧹 数据清洗统计报告:', {
      总处理字段数: sanitizationStats.total,
      跳过字段数: sanitizationStats.skipped,
      有效字段数: sanitizationStats.total - sanitizationStats.skipped,
      跳过原因分布: sanitizationStats.reasons,
      清洗成功率: sanitizationStats.total > 0 ?
        `${((sanitizationStats.total - sanitizationStats.skipped) / sanitizationStats.total * 100).toFixed(1)}%` : 'N/A'
    });

    console.log(`🎯 准备注册 ${translationInputs.length} 个翻译`);
    console.log('📤 翻译输入详情:', JSON.stringify(translationInputs, null, 2));

    // 第三步：注册翻译（分批处理）
    console.log('💾 第三步：注册翻译到Shopify...');
    
    // 分批处理大量翻译字段
    const BATCH_SIZE = 80; // 每批最多80个字段，留有安全余量
    const allTranslations = [];
    const errors = [];
    
    // 将翻译输入分成多批
    const chunks = [];
    for (let i = 0; i < translationInputs.length; i += BATCH_SIZE) {
      chunks.push(translationInputs.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 将 ${translationInputs.length} 个翻译分成 ${chunks.length} 批处理，每批最多 ${BATCH_SIZE} 个`);
    
    // 逐批提交
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🚀 处理第 ${i + 1}/${chunks.length} 批，包含 ${chunk.length} 个翻译`);
      
      try {
        const registerData = await executeGraphQLWithRetry(
          admin,
          TRANSLATIONS_REGISTER_MUTATION,
          {
            resourceId: resourceGid,
            translations: chunk
          }
        );
        
        console.log(`📊 第 ${i + 1} 批翻译注册响应:`, JSON.stringify(registerData, null, 2));
        
        if (registerData.data.translationsRegister.userErrors.length > 0) {
          console.error(`❌ 第 ${i + 1} 批翻译注册用户错误:`, registerData.data.translationsRegister.userErrors);
          errors.push({
            batch: i + 1,
            errors: registerData.data.translationsRegister.userErrors
          });
        } else {
          allTranslations.push(...(registerData.data.translationsRegister.translations || []));
          console.log(`✅ 第 ${i + 1} 批翻译注册成功，已注册 ${registerData.data.translationsRegister.translations?.length || 0} 个翻译`);
        }
      } catch (error) {
        console.error(`❌ 第 ${i + 1} 批翻译注册失败:`, error);
        errors.push({
          batch: i + 1,
          error: error.message
        });
        // 继续处理下一批，不中断整个流程
      }
    }
    
    // 检查是否有错误
    if (errors.length > 0) {
      console.error('❌ 部分批次翻译注册失败:', errors);
      // 如果所有批次都失败，抛出错误
      if (errors.length === chunks.length) {
        throw new Error(`所有批次翻译注册失败: ${JSON.stringify(errors)}`);
      }
      // 部分成功，返回成功的结果
      console.warn(`⚠️ ${errors.length}/${chunks.length} 批次失败，但 ${allTranslations.length} 个翻译成功注册`);
    }
    
    console.log('🎉 资源翻译注册完成:', {
      resourceId: resourceGid,
      locale: targetLocale,
      totalBatches: chunks.length,
      successfulBatches: chunks.length - errors.length,
      totalTranslations: allTranslations.length,
      successfulTranslations: allTranslations.map(t => ({
        key: t.key,
        locale: t.locale
      }))
    });

    return {
      success: true,
      translations: allTranslations,
      details: {
        processedInputs: translationInputs.length,
        successfulRegistrations: allTranslations.length,
        totalBatches: chunks.length,
        failedBatches: errors.length
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
 * 批量更新资源翻译（用于同步服务）
 * 与 updateTranslationByType 功能相同，但名称更明确
 * @param {Object} admin - Shopify Admin API客户端
 * @param {string} resourceGid - 资源GID
 * @param {Object} translations - 翻译内容
 * @param {string} targetLocale - 目标语言
 * @param {string} resourceType - 资源类型
 * @returns {Promise<Object>} 注册结果
 */
export async function updateResourceTranslationBatch(admin, resourceGid, translations, targetLocale, resourceType) {
  return await updateTranslationByType(admin, resourceGid, translations, targetLocale, resourceType);
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

/**
 * 简化的 Metafield 翻译注册函数（别名）
 * 为了保持与现有函数的一致性，提供一个更简洁的名称
 * @param {Object} admin - Shopify Admin API 客户端
 * @param {string} metafieldGid - Metafield 的 GID
 * @param {string} translatedValue - 翻译后的值
 * @param {string} locale - 目标语言代码
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<Object>} 注册结果
 */
export async function registerMetafieldTranslation(admin, metafieldGid, translatedValue, locale, maxRetries = 3) {
  return await updateMetafieldTranslation(admin, metafieldGid, translatedValue, locale, maxRetries);
}
