import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

/**
 * 调试页面 - 检查Shopify认证状态
 */
export const loader = async ({ request }) => {
  let authStatus = {
    authenticated: false,
    error: null,
    shop: null,
    accessToken: false,
    scope: null
  };

  try {
    const { session, admin } = await authenticate.admin(request);
    
    authStatus = {
      authenticated: true,
      error: null,
      shop: session?.shop || null,
      accessToken: !!session?.accessToken,
      scope: session?.scope || null
    };
  } catch (error) {
    authStatus = {
      authenticated: false,
      error: error.message,
      shop: null,
      accessToken: false,
      scope: null
    };
  }

  return json({ authStatus });
};

export default function DebugAuth() {
  const { authStatus } = useLoaderData();
  
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Shopify认证调试</h1>
      
      <div style={{ 
        padding: '20px', 
        backgroundColor: authStatus.authenticated ? '#d4edda' : '#f8d7da',
        border: '1px solid',
        borderColor: authStatus.authenticated ? '#c3e6cb' : '#f5c6cb',
        borderRadius: '4px',
        marginBottom: '20px'
      }}>
        <h2>认证状态: {authStatus.authenticated ? '✅ 已认证' : '❌ 未认证'}</h2>
        
        {authStatus.error && (
          <div style={{ color: '#721c24', marginTop: '10px' }}>
            <strong>错误信息:</strong> {authStatus.error}
          </div>
        )}
        
        {authStatus.authenticated && (
          <div style={{ marginTop: '10px' }}>
            <p><strong>店铺:</strong> {authStatus.shop}</p>
            <p><strong>访问令牌:</strong> {authStatus.accessToken ? '✅ 存在' : '❌ 不存在'}</p>
            <p><strong>权限范围:</strong> {authStatus.scope || '无'}</p>
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <h3>测试链接:</h3>
        <ul>
          <li><a href="/test/standalone">独立测试页面（无需认证）</a></li>
          <li><a href="/test/basic-ui">Polaris UI测试页面</a></li>
          <li><a href="/app">主应用页面</a></li>
        </ul>
      </div>
      
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h3>调试提示:</h3>
        <p>1. 如果未认证，请通过Shopify Admin访问应用</p>
        <p>2. 确保应用已正确安装在店铺中</p>
        <p>3. 检查环境变量配置是否正确</p>
      </div>
    </div>
  );
}