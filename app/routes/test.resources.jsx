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
  Stack,
  Spinner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  // 获取支持的资源类型
  const resourceTypes = [
    { label: '产品 (PRODUCT)', value: 'PRODUCT' },
    { label: '产品集合 (COLLECTION)', value: 'COLLECTION' },
    { label: '博客文章 (ARTICLE)', value: 'ARTICLE' },
    { label: '博客 (BLOG)', value: 'BLOG' },
    { label: '页面 (PAGE)', value: 'PAGE' },
    { label: '菜单 (MENU)', value: 'MENU' },
    { label: '链接 (LINK)', value: 'LINK' },
    { label: '过滤器 (FILTER)', value: 'FILTER' }
  ];

  return json({ resourceTypes });
};

export default function TestResources() {
  const { resourceTypes } = useLoaderData();
  const scanFetcher = useFetcher();
  const [selectedResourceType, setSelectedResourceType] = useState('PRODUCT');
  const [scanResults, setScanResults] = useState(null);

  const handleResourceTypeChange = useCallback((value) => {
    setSelectedResourceType(value);
    setScanResults(null);
  }, []);

  const handleScanResources = useCallback(() => {
    setScanResults(null);
    scanFetcher.submit(
      { resourceType: selectedResourceType },
      {
        method: "POST",
        action: "/api/scan-resources",
        encType: "application/json",
      }
    );
  }, [selectedResourceType, scanFetcher]);

  // 处理扫描结果
  const isScanning = scanFetcher.state === 'submitting';
  const scanResult = scanFetcher.data;

  // 构建数据表格行
  const tableRows = scanResult?.resources ? scanResult.resources.map(resource => [
    resource.id,
    resource.title || '无标题',
    resource.resourceType,
    resource.handle || '无',
    resource.seoTitle || '无',
    resource.status === 'pending' ? <Badge status="attention">待翻译</Badge> : <Badge status="success">已完成</Badge>
  ]) : [];

  return (
    <Page title="资源扫描测试">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Stack vertical>
              <Text variant="headingMd">选择资源类型进行扫描</Text>
              
              <Select
                label="资源类型"
                options={resourceTypes}
                value={selectedResourceType}
                onChange={handleResourceTypeChange}
              />

              <Button
                primary
                onClick={handleScanResources}
                loading={isScanning}
                disabled={isScanning}
              >
                {isScanning ? '正在扫描...' : `扫描${selectedResourceType}资源`}
              </Button>
            </Stack>
          </Card>
        </Layout.Section>

        {isScanning && (
          <Layout.Section>
            <Card sectioned>
              <Stack alignment="center">
                <Spinner accessibilityLabel="正在扫描资源" size="small" />
                <Text>正在扫描{selectedResourceType}资源，请稍候...</Text>
              </Stack>
            </Card>
          </Layout.Section>
        )}

        {scanResult && (
          <Layout.Section>
            <Card sectioned>
              {scanResult.success ? (
                <Stack vertical>
                  <Banner status="success">
                    <p>{scanResult.message}</p>
                  </Banner>

                  {scanResult.resources && scanResult.resources.length > 0 && (
                    <>
                      <Text variant="headingMd">
                        扫描结果 ({scanResult.count} 个资源)
                      </Text>
                      
                      <DataTable
                        columnContentTypes={[
                          'text',
                          'text', 
                          'text',
                          'text',
                          'text',
                          'text'
                        ]}
                        headings={[
                          'ID',
                          '标题',
                          '类型',
                          'Handle',
                          'SEO标题',
                          '状态'
                        ]}
                        rows={tableRows}
                      />
                    </>
                  )}
                </Stack>
              ) : (
                <Banner status="critical">
                  <p>扫描失败: {scanResult.error}</p>
                </Banner>
              )}
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}