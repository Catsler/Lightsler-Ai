import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";

export const action = async ({ request }) => {
  try {
    console.log('测试认证开始');
    
    const { admin, session } = await authenticate.admin(request);
    
    console.log('认证成功，session:', {
      shop: session.shop,
      accessToken: session.accessToken ? '***' : '无',
    });
    
    return json({
      success: true,
      shop: session.shop,
      message: "认证测试成功"
    });
    
  } catch (error) {
    console.error('认证测试错误:', error);
    return json({
      success: false,
      error: error.message,
      message: "认证测试失败"
    }, { status: 500 });
  }
};