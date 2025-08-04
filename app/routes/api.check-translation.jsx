import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

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

export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const resourceId = formData.get("resourceId");
    const locale = formData.get("locale") || "fr";
    
    if (!resourceId) {
      return json({
        success: false,
        error: "resourceId is required"
      }, { status: 400 });
    }
    
    const response = await admin.graphql(CHECK_TRANSLATION_QUERY, {
      variables: {
        resourceId,
        locale
      }
    });
    
    const data = await response.json();
    
    return json({
      success: true,
      data: data.data,
      message: "翻译内容获取成功"
    });
    
  }, "检查翻译", request.headers.get("shopify-shop-domain") || "");
};