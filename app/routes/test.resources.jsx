import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Select,
  Text,
  Banner,
  DataTable,
  Badge,
  BlockStack,
  InlineStack,
  Spinner,
  TextField
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { getAllResources } from "../services/database.server.js";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  // 获取所有已扫描的资源用于测试
  try {
    const resources = await getAllResources();
    return json({ resources: resources || [] });
  } catch (error) {
    console.error('获取资源失败:', error);
    return json({ resources: [] });
  }
};

// 页面翻译调试测试组件
function PageTranslationDebug() {
  const [resourceId, setResourceId] = useState('');
  const [debugResult, setDebugResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleDebug = async () => {
    if (!resourceId.trim()) {
      alert('请输入资源ID');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/debug-translation?resourceId=${encodeURIComponent(resourceId)}`);
      const result = await response.json();
      setDebugResult(result);
    } catch (error) {
      console.error('调试失败:', error);
      alert('调试失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <Text variant="headingMd" as="h2">页面翻译调试工具</Text>
      <div style={{ marginTop: '1rem' }}>
        <TextField
          label="页面资源ID (例如: gid://shopify/Page/12345)"
          value={resourceId}
          onChange={setResourceId}
          placeholder="输入完整的GID"
        />
        <div style={{ marginTop: '1rem' }}>
          <Button
            primary
            onClick={handleDebug}
            loading={isLoading}
          >
            调试页面翻译字段
          </Button>
        </div>
      </div>
      
      {debugResult && (
        <div style={{ marginTop: '2rem' }}>
          <Text variant="headingMd" as="h3">调试结果</Text>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f6f6f7', borderRadius: '4px' }}>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(debugResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function TestResources() {
  const { resources } = useLoaderData();
  const [selectedResource, setSelectedResource] = useState(null);

  return (
    <Page title="资源测试">
      <Layout>
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">扫描到的资源</Text>
            <div style={{ marginTop: '1rem' }}>
              {resources.length === 0 ? (
                <Text>暂无资源数据，请先扫描资源</Text>
              ) : (
                <div>
                  <Text>共找到 {resources.length} 个资源</Text>
                  <div style={{ marginTop: '1rem' }}>
                    {resources.slice(0, 10).map(resource => (
                      <div key={resource.id} style={{ 
                        padding: '1rem', 
                        border: '1px solid #e1e3e5', 
                        marginBottom: '0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: selectedResource?.id === resource.id ? '#f6f6f7' : 'white'
                      }} onClick={() => setSelectedResource(resource)}>
                        <Text variant="headingSm" as="h3">{resource.title}</Text>
                        <Text variant="bodyMd" color="subdued">
                          类型: {resource.resourceType} | ID: {resource.id} | GID: {resource.gid}
                        </Text>
                        {resource.description && (
                          <Text variant="bodyMd">
                            描述: {resource.description.substring(0, 100)}...
                          </Text>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <PageTranslationDebug />
        </Layout.Section>

        {selectedResource && (
          <Layout.Section>
            <Card>
              <Text variant="headingMd" as="h2">选中资源详情</Text>
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f6f6f7', borderRadius: '4px' }}>
                <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                  {JSON.stringify(selectedResource, null, 2)}
                </pre>
              </div>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}