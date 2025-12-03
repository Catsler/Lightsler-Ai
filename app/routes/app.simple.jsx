import { useEffect, useState, useCallback } from "react";
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
  Badge,
} from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { getResourceDisplayTitle } from "../utils/resource-display-helpers";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  return {
    supportedLanguages: [
      { label: 'Chinese (Simplified)', value: 'zh-CN' },
      { label: 'Chinese (Traditional)', value: 'zh-TW' },
      { label: 'English', value: 'en' },
      { label: 'Japanese', value: 'ja' },
      { label: 'Korean', value: 'ko' },
      { label: 'French', value: 'fr' },
      { label: 'German', value: 'de' },
      { label: 'Spanish', value: 'es' },
    ]
  };
};

export default function SimpleApp() {
  const { supportedLanguages } = useLoaderData();
  const scanProductsFetcher = useFetcher();
  const translateFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const { t, i18n } = useTranslation('home');
  
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [selectedResourceType, setSelectedResourceType] = useState('PRODUCT');
  const [resources, setResources] = useState([]);
  const [stats, setStats] = useState({ totalResources: 0, pendingResources: 0, completedResources: 0 });
  const [logs, setLogs] = useState([]);

  // 资源类型选项
  const resourceTypeOptions = [
    { label: t('resourceTypes.PRODUCT', { defaultValue: 'Product' }), value: 'PRODUCT' },
    { label: t('resourceTypes.COLLECTION', { defaultValue: 'Collection' }), value: 'COLLECTION' },
    { label: t('resourceTypes.PAGE', { defaultValue: 'Page' }), value: 'PAGE' },
  ];

  // 加载状态
  const isScanning = scanProductsFetcher.state === 'submitting';
  const isTranslating = translateFetcher.state === 'submitting';

  // 添加日志
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, message, type }, ...prev.slice(0, 9)]);
  }, []);

  // 加载状态
  const loadStatus = useCallback(() => {
    statusFetcher.load('/api/status');
  }, [statusFetcher]);

  // 处理状态响应
  useEffect(() => {
    if (statusFetcher.data && statusFetcher.data.success) {
      const { resources: resourcesData, stats: statsData } = statusFetcher.data.data;
      setResources(resourcesData || []);
      setStats(statsData?.database || { totalResources: 0, pendingResources: 0, completedResources: 0 });
    }
  }, [statusFetcher.data]);

  // 页面加载时获取状态
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // 扫描产品
  const scanProducts = useCallback(() => {
    addLog(t('logs.scanningProducts', { defaultValue: 'Scanning products...' }), 'info');
    scanProductsFetcher.submit({}, { 
      method: 'POST', 
      action: '/api/scan-products' 
    });
  }, [addLog, scanProductsFetcher, t]);

  // 开始翻译
  const startTranslation = useCallback(() => {
    addLog(t('logs.translationStart', { lang: selectedLanguage, scope: '', cacheNote: '', count: 0, defaultValue: `Translating to ${selectedLanguage}...` }), 'info');
    translateFetcher.submit({
      language: selectedLanguage,
      resourceIds: JSON.stringify([])
    }, { 
      method: 'POST', 
      action: '/api/translate' 
    });
  }, [selectedLanguage, addLog, translateFetcher]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending': return <Badge tone="attention">{t('status.pending', { ns: 'home', defaultValue: 'Pending' })}</Badge>;
      case 'processing': return <Badge tone="info">{t('status.processing', { ns: 'home', defaultValue: 'Processing' })}</Badge>;
      case 'completed': return <Badge tone="success">{t('status.completed', { ns: 'home', defaultValue: 'Completed' })}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <Page title={t('ui.simpleTitle', { ns: 'home', defaultValue: 'Translation app' })}>
      <BlockStack gap="500">
        {/* 配置区域 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t('ui.simpleConfig', { ns: 'home', defaultValue: 'Translation settings' })}</Text>
                
                <BlockStack gap="400">
                  <InlineStack gap="400" align="start">
                    <Box minWidth="200px">
                      <Select
                        label={t('ui.simpleTargetLanguage', { ns: 'home', defaultValue: 'Target language' })}
                        options={supportedLanguages}
                        value={selectedLanguage}
                        onChange={setSelectedLanguage}
                      />
                    </Box>
                    
                    <Box minWidth="200px">
                      <Select
                        label={t('ui.simpleResourceType', { ns: 'home', defaultValue: 'Resource type' })}
                        options={resourceTypeOptions}
                        value={selectedResourceType}
                        onChange={setSelectedResourceType}
                      />
                    </Box>
                  </InlineStack>
                  
                  <InlineStack gap="200">
                    <Button 
                      onClick={scanProducts} 
                      loading={isScanning}
                      variant="secondary"
                    >
                      {t('ui.simpleScan', { ns: 'home', defaultValue: 'Scan products' })}
                    </Button>
                    <Button 
                      onClick={startTranslation} 
                      loading={isTranslating}
                      variant="primary"
                      disabled={resources.length === 0}
                    >
                      {t('ui.simpleTranslate', { ns: 'home', defaultValue: 'Start translation' })}
                    </Button>
                    <Button 
                      onClick={loadStatus}
                      variant="tertiary"
                    >
                      {t('ui.simpleRefresh', { ns: 'home', defaultValue: 'Refresh status' })}
                    </Button>
                  </InlineStack>
                </BlockStack>
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
                  <Text as="h3" variant="headingMd">{t('ui.simpleTotal', { ns: 'home', defaultValue: 'Total resources' })}</Text>
                  <Text as="p" variant="headingLg">{stats.totalResources}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{t('ui.simplePending', { ns: 'home', defaultValue: 'Pending' })}</Text>
                  <Text as="p" variant="headingLg" tone="critical">{stats.pendingResources}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{t('ui.simpleCompleted', { ns: 'home', defaultValue: 'Completed' })}</Text>
                  <Text as="p" variant="headingLg" tone="success">{stats.completedResources}</Text>
                </BlockStack>
              </Card>
            </InlineStack>
          </Layout.Section>
        </Layout>

        {/* 操作日志 */}
        {logs.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">{t('ui.simpleLogs', { ns: 'home', defaultValue: 'Operation logs' })}</Text>
                  <Box style={{maxHeight: "200px", overflowY: "scroll"}}>
                    <BlockStack gap="100">
                      {logs.map((log, index) => (
                        <Text 
                          key={index} 
                          variant="bodySm" 
                          tone={log.type === 'error' ? 'critical' : log.type === 'success' ? 'success' : undefined}
                        >
                          {t('ui.simpleLogEntry', { ns: 'home', time: log.timestamp, message: log.message, defaultValue: `[${log.timestamp}] ${log.message}` })}
                        </Text>
                      ))}
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* 资源列表 */}
        {resources.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">{t('ui.simpleResources', { ns: 'home', defaultValue: 'Resource list' })}</Text>
                  <Box style={{maxHeight: "400px", overflowY: "scroll"}}>
                    <BlockStack gap="200">
                      {resources.map((resource) => (
                        <Card key={resource.id} subdued>
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <Text as="h4" variant="headingSm">
                                {getResourceDisplayTitle(resource, i18n.language, t)}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {t('ui.resourceRow', { ns: 'home', type: resource.resourceType, count: resource.translationCount, defaultValue: `${resource.resourceType} | Translations: ${resource.translationCount}` })}
                              </Text>
                            </BlockStack>
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
      </BlockStack>
    </Page>
  );
}
