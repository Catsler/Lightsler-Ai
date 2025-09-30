import { createApiRoute } from "../utils/base-route.server.js";

// GraphQL 查询获取翻译内容
const CHECK_TRANSLATION_QUERY = `
  query getTranslations($resourceId: ID!, $locale: String!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translations(locale: $locale) {
        key
        value
      }
    }
  }
`;

/**
 * 检查翻译内容处理函数
 */
async function handleCheckTranslation({ request, admin, params }) {
  const formData = await request.formData();
  
  const resourceId = formData.get("resourceId");
  const locale = formData.get("locale") || "fr";
  
  if (!resourceId) {
    throw new Error("resourceId is required");
  }
  
  const response = await admin.graphql(CHECK_TRANSLATION_QUERY, {
    variables: {
      resourceId,
      locale
    }
  });
  
  const data = await response.json();
  
  return {
    data: data.data,
    message: "翻译内容获取成功"
  };
}

export const action = createApiRoute(handleCheckTranslation, {
  requireAuth: true,
  operationName: '检查翻译内容'
});