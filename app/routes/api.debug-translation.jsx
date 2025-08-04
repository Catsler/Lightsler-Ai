import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { 
  withErrorHandling, 
  validationErrorResponse, 
  successResponse 
} from "../utils/api-response.server.js";
import { 
  executeGraphQLWithRetry, 
  FIELD_MAPPINGS, 
  RESOURCE_TYPES,
  TRANSLATABLE_RESOURCE_QUERY 
} from "../services/shopify-graphql.server.js";

// GraphQL 查询获取所有可翻译内容（包括原始内容）
const DEBUG_TRANSLATION_QUERY = `
  query debugTranslation($resourceId: ID!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
      }
      translations(locale: "fr") {
        key
        value
        outdated
      }
    }
  }
`;

// 查询所有支持的语言
const SHOP_LOCALES_QUERY = `
  query getShopLocales {
    shopLocales {
      locale
      primary
      published
    }
  }
`;

export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const resourceId = formData.get("resourceId");
    
    if (!resourceId) {
      return json({
        success: false,
        error: "resourceId is required"
      }, { status: 400 });
    }
    
    console.log('开始调试翻译，资源ID:', resourceId);
    
    // 获取店铺支持的语言
    const localesResponse = await admin.graphql(SHOP_LOCALES_QUERY);
    const localesData = await localesResponse.json();
    
    console.log('店铺语言数据:', localesData);
    
    if (localesData.errors) {
      throw new Error(`GraphQL错误: ${JSON.stringify(localesData.errors)}`);
    }
    
    // 获取资源的所有内容和翻译
    const response = await admin.graphql(DEBUG_TRANSLATION_QUERY, {
      variables: {
        resourceId
      }
    });
    
    const data = await response.json();
    
    console.log('调试翻译数据:', data);
    
    if (data.errors) {
      throw new Error(`GraphQL错误: ${JSON.stringify(data.errors)}`);
    }
    
    // 整理数据
    const resource = data.data.translatableResource;
    const originalContent = {};
    const frenchTranslations = {};
    
    if (resource) {
      // 原始内容
      resource.translatableContent.forEach(item => {
        originalContent[item.key] = {
          value: item.value,
          digest: item.digest,
          locale: item.locale
        };
      });
      
      // 法语翻译
      if (resource.translations) {
        resource.translations.forEach(item => {
          frenchTranslations[item.key] = {
            value: item.value,
            outdated: item.outdated
          };
        });
      }
    }
    
    return json({
      success: true,
      data: {
        resourceId,
        shopLocales: localesData.data.shopLocales,
        originalContent,
        frenchTranslations,
        raw: data.data
      },
      message: "调试信息获取成功"
    });
    
  }, "调试翻译", request.headers.get("shopify-shop-domain") || "");
};

// 新增：页面翻译调试端点
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const resourceId = url.searchParams.get('resourceId');
    
    if (!resourceId) {
      return validationErrorResponse([{
        field: 'resourceId',
        message: '需要提供resourceId参数'
      }]);
    }

    console.log('🔍 调试页面翻译 - 资源ID:', resourceId);

    try {
      // 查询可翻译资源的详细信息
      const data = await executeGraphQLWithRetry(
        admin, 
        TRANSLATABLE_RESOURCE_QUERY, 
        { resourceId }
      );

      const translatableContent = data.data.translatableResource?.translatableContent || [];
      
      console.log('📋 可翻译内容详情:');
      translatableContent.forEach((item, index) => {
        console.log(`${index + 1}. Key: "${item.key}" | Value: "${item.value?.substring(0, 100)}..." | Digest: ${item.digest}`);
      });

      // 同时查询资源的基本信息以便对比
      const RESOURCE_INFO_QUERY = `
        query getResourceInfo($resourceId: ID!) {
          node(id: $resourceId) {
            ... on Page {
              id
              title
              body
              handle
              seo {
                title
                description
              }
            }
          }
        }
      `;

      const resourceInfo = await executeGraphQLWithRetry(
        admin,
        RESOURCE_INFO_QUERY,
        { resourceId }
      );

      return successResponse({
        resourceId,
        translatableContent: translatableContent.map(item => ({
          key: item.key,
          value: item.value,
          digest: item.digest,
          locale: item.locale
        })),
        resourceInfo: resourceInfo.data.node,
        fieldMappings: FIELD_MAPPINGS[RESOURCE_TYPES.PAGE],
        analysis: {
          availableKeys: translatableContent.map(item => item.key),
          mappedKeys: Object.values(FIELD_MAPPINGS[RESOURCE_TYPES.PAGE]),
          missingMappings: Object.values(FIELD_MAPPINGS[RESOURCE_TYPES.PAGE])
            .filter(key => !translatableContent.some(item => item.key === key))
        }
      }, `找到 ${translatableContent.length} 个可翻译字段`);

    } catch (error) {
      console.error('❌ 调试页面翻译失败:', error);
      throw error;
    }

  }, "调试页面翻译", request.headers.get("shopify-shop-domain") || "");
};
