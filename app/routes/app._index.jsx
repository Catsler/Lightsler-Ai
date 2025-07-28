import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Select,
  Checkbox,
  Banner,
  Spinner,
  Badge,
  DataTable,
  ProgressBar,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  return {
    supportedLanguages: [
      { label: '简体中文', value: 'zh-CN' },
      { label: '繁体中文', value: 'zh-TW' },
      { label: 'English', value: 'en' },
      { label: '日本語', value: 'ja' },
      { label: '한국어', value: 'ko' },
      { label: 'Français', value: 'fr' },
      { label: 'Deutsch', value: 'de' },
      { label: 'Español', value: 'es' },
    ]
  };
};

export default function Index() {
  const { supportedLanguages } = useLoaderData();
  const scanProductsFetcher = useFetcher();
  const scanCollectionsFetcher = useFetcher();
  const translateFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const clearFetcher = useFetcher();
  const shopify = useAppBridge();
  
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [selectedResources, setSelectedResources] = useState([]);
  const [resources, setResources] = useState([]);
  const [stats, setStats] = useState({ totalResources: 0, pendingResources: 0, completedResources: 0 });
  const [logs, setLogs] = useState([]);

  // 加载状态
  const isScanning = scanProductsFetcher.state === 'submitting' || scanCollectionsFetcher.state === 'submitting';
  const isTranslating = translateFetcher.state === 'submitting';
  const isClearing = clearFetcher.state === 'submitting';

  // 添加日志
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, message, type }, ...prev.slice(0, 9)]);
  };

  // 处理API响应
  useEffect(() => {
    if (scanProductsFetcher.data) {
      if (scanProductsFetcher.data.success) {
        addLog(`✅ ${scanProductsFetcher.data.message}`, 'success');
        shopify.toast.show(scanProductsFetcher.data.message);
        loadStatus();
      } else {
        addLog(`❌ ${scanProductsFetcher.data.message}`, 'error');
        shopify.toast.show(scanProductsFetcher.data.message, { isError: true });
      }
    }
  }, [scanProductsFetcher.data]);

  useEffect(() => {
    if (scanCollectionsFetcher.data) {
      if (scanCollectionsFetcher.data.success) {
        addLog(`✅ ${scanCollectionsFetcher.data.message}`, 'success');
        shopify.toast.show(scanCollectionsFetcher.data.message);
        loadStatus();
      } else {
        addLog(`❌ ${scanCollectionsFetcher.data.message}`, 'error');
        shopify.toast.show(scanCollectionsFetcher.data.message, { isError: true });
      }
    }
  }, [scanCollectionsFetcher.data]);

  useEffect(() => {
    if (translateFetcher.data) {
      if (translateFetcher.data.success) {
        addLog(`✅ ${translateFetcher.data.message}`, 'success');
        shopify.toast.show(translateFetcher.data.message);
        loadStatus();
      } else {
        addLog(`❌ ${translateFetcher.data.message}`, 'error');
        shopify.toast.show(translateFetcher.data.message, { isError: true });
      }
    }
  }, [translateFetcher.data]);

  useEffect(() => {
    if (statusFetcher.data && statusFetcher.data.success) {
      const { resources: resourcesData, stats: statsData } = statusFetcher.data.data;
      setResources(resourcesData || []);
      setStats(statsData?.database || { totalResources: 0, pendingResources: 0, completedResources: 0 });
    }
  }, [statusFetcher.data]);

  // 加载状态
  const loadStatus = () => {
    statusFetcher.load('/api/status');
  };

  // 页面加载时获取状态
  useEffect(() => {
    loadStatus();
  }, []);

  // 扫描产品
  const scanProducts = () => {
    addLog('🔍 开始扫描产品...', 'info');
    scanProductsFetcher.submit({}, { 
      method: 'POST', 
      action: '/api/scan-products' 
    });
  };

  // 扫描集合
  const scanCollections = () => {
    addLog('🔍 开始扫描集合...', 'info');
    scanCollectionsFetcher.submit({}, { 
      method: 'POST', 
      action: '/api/scan-collections' 
    });
  };

  // 开始翻译
  const startTranslation = () => {
    const resourceIds = selectedResources.length > 0 ? selectedResources : [];
    addLog(`🔄 开始翻译到 ${selectedLanguage}...`, 'info');
    
    translateFetcher.submit({
      language: selectedLanguage,
      resourceIds: JSON.stringify(resourceIds)
    }, { 
      method: 'POST', 
      action: '/api/translate' 
    });
  };

  // 清空数据
  const clearData = () => {
    addLog('🗑️ 清空所有数据...', 'info');
    clearFetcher.submit({ type: 'all' }, { 
      method: 'POST', 
      action: '/api/clear' 
    });
    setResources([]);
    setSelectedResources([]);
  };

  // 处理资源选择
  const handleResourceSelection = (resourceId, checked) => {
    if (checked) {
      setSelectedResources(prev => [...prev, resourceId]);
    } else {
      setSelectedResources(prev => prev.filter(id => id !== resourceId));
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedResources.length === resources.length) {
      setSelectedResources([]);
    } else {
      setSelectedResources(resources.map(r => r.id));
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending': return <Badge tone="attention">待翻译</Badge>;
      case 'processing': return <Badge tone="info">翻译中</Badge>;
      case 'completed': return <Badge tone="success">已完成</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <Page>
      <TitleBar title="翻译应用测试">
        <Button variant="primary" onClick={loadStatus}>
          刷新状态
        </Button>
      </TitleBar>
      
      <BlockStack gap="500">
        {/* 配置区域 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">翻译配置</Text>
                
                <InlineStack gap="400" align="start">
                  <Box minWidth="200px">
                    <Select
                      label="目标语言"
                      options={supportedLanguages}
                      value={selectedLanguage}
                      onChange={setSelectedLanguage}
                    />
                  </Box>
                  
                  <InlineStack gap="200">
                    <Button 
                      onClick={scanProducts} 
                      loading={isScanning}
                      variant="secondary"
                    >
                      扫描产品
                    </Button>
                    <Button 
                      onClick={scanCollections} 
                      loading={isScanning}
                      variant="secondary"
                    >
                      扫描集合
                    </Button>
                    <Button 
                      onClick={startTranslation} 
                      loading={isTranslating}
                      variant="primary"
                      disabled={resources.length === 0}
                    >
                      开始翻译
                    </Button>
                    <Button 
                      onClick={clearData} 
                      loading={isClearing}
                      variant="tertiary"
                      tone="critical"
                    >
                      清空数据
                    </Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* 统计信息 */}
        <Layout>
          <Layout.Section>
            <InlineStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">总资源数</Text>
                  <Text as="p" variant="headingLg">{stats.totalResources}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">待翻译</Text>
                  <Text as="p" variant="headingLg" tone="critical">{stats.pendingResources}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">已完成</Text>
                  <Text as="p" variant="headingLg" tone="success">{stats.completedResources}</Text>
                </BlockStack>
              </Card>
            </InlineStack>
          </Layout.Section>
        </Layout>

        {/* 资源列表 */}
        {resources.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">资源列表</Text>
                    <Button 
                      onClick={toggleSelectAll}
                      variant="tertiary"
                    >
                      {selectedResources.length === resources.length ? '取消全选' : '全选'}
                    </Button>
                  </InlineStack>
                  
                  <Box style={{maxHeight: "400px", overflowY: "scroll"}}>
                    <BlockStack gap="200">
                      {resources.map((resource) => (
                        <Card key={resource.id} subdued>
                          <InlineStack align="space-between">
                            <InlineStack gap="300">
                              <Checkbox
                                checked={selectedResources.includes(resource.id)}
                                onChange={(checked) => handleResourceSelection(resource.id, checked)}
                              />
                              <BlockStack gap="100">
                                <Text as="h4" variant="headingSm">{resource.title}</Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {resource.resourceType} | 翻译数: {resource.translationCount}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                            {getStatusBadge(resource.status)}
                          </InlineStack>
                        </Card>
                      ))}
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* 操作日志 */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">操作日志</Text>
                <Box style={{maxHeight: "300px", overflowY: "scroll"}}>
                  <BlockStack gap="200">
                    {logs.length === 0 ? (
                      <Text variant="bodyMd" tone="subdued">暂无日志</Text>
                    ) : (
                      logs.map((log, index) => (
                        <Box key={index} padding="200" borderRadius="100" background="bg-surface-secondary">
                          <Text as="p" variant="bodySm">
                            <Text as="span" tone="subdued">{log.timestamp}</Text> {log.message}
                          </Text>
                        </Box>
                      ))
                    )}
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
