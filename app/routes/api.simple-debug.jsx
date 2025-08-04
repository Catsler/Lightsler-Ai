import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const resourceId = formData.get("resourceId") || "gid://shopify/Page/117448212669";
    
    console.log('简单调试测试，资源ID:', resourceId);
    
    // 简单的GraphQL查询测试
    const SIMPLE_QUERY = `
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
    
    const response = await admin.graphql(SIMPLE_QUERY, {
      variables: { resourceId }
    });
    
    const data = await response.json();
    
    console.log('GraphQL响应:', JSON.stringify(data, null, 2));
    
    return json({
      success: true,
      data: data,
      message: "简单调试成功"
    });
    
  } catch (error) {
    console.error('简单调试错误:', error);
    return json({
      success: false,
      error: error.message,
      message: "简单调试失败"
    }, { status: 500 });
  }
};