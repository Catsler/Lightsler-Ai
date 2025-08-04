import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
  Banner,
} from "@shopify/polaris";

// 这个版本完全绕过Shopify认证，用于测试
export const loader = async ({ request }) => {
  return json({
    supportedLanguages: [
      { label: 'Chinese (Simplified)', value: 'zh-CN' },
      { label: 'Chinese (Traditional)', value: 'zh-TW' },
      { label: 'English', value: 'en' },
      { label: 'Japanese', value: 'ja' },
      { label: 'Korean', value: 'ko' },
      { label: 'French', value: 'fr' },
      { label: 'German', value: 'de' },
      { label: 'Spanish', value: 'es' },
    ],
    bypassMode: true
  });
};

export default function BypassApp() {
  const { supportedLanguages } = useLoaderData();
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [selectedResourceType, setSelectedResourceType] = useState('PRODUCT');
  const [isScanning, setIsScanning] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ totalResources: 0, pendingResources: 0, completedResources: 0 });

  const resourceTypeOptions = [
    { label: '产品', value: 'PRODUCT' },
    { label: '产品集合', value: 'COLLECTION' },
    { label: '页面', value: 'PAGE' },
  ];

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, message, type }, ...prev.slice(0, 9)]);
  };

  const simulateScan = async () => {
    setIsScanning(true);
    addLog('🔍 开始扫描产品...', 'info');
    
    try {
      const response = await fetch('/api/scan-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) throw new Error('扫描失败');
      
      const data = await response.json();
      addLog(`✅ ${data.message || '扫描完成'}`, 'success');
      
      // 模拟更新统计
      setStats(prev => ({
        ...prev,
        totalResources: prev.totalResources + 10,
        pendingResources: prev.pendingResources + 10
      }));
    } catch (error) {
      addLog(`❌ 扫描失败: ${error.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const simulateTranslate = async () => {
    setIsTranslating(true);
    addLog(`🔄 开始翻译到 ${selectedLanguage}...`, 'info');
    
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLanguage,
          resourceIds: []
        }),
      });
      
      if (!response.ok) throw new Error('翻译失败');
      
      const data = await response.json();
      addLog(`✅ ${data.message || '翻译完成'}`, 'success');
      
      // 模拟更新统计
      setStats(prev => ({
        ...prev,
        pendingResources: 0,
        completedResources: prev.totalResources
      }));
    } catch (error) {
      addLog(`❌ 翻译失败: ${error.message}`, 'error');
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <Page title="翻译应用（绕过模式）">
      <BlockStack gap="500">
        <Banner
          title="绕过模式"
          tone="warning"
        >
          <p>此页面绕过了Shopify认证，仅用于测试基本功能。</p>
        </Banner>

        {/* 浏览器扩展提示 */}
        <Banner
          title="遇到网络错误？"
          tone="info"
          action={{
            content: '查看解决方案',
            url: '/DEV-ENVIRONMENT.md'
          }}
        >
          <p>如果遇到 "Failed to fetch" 错误，请禁用浏览器扩展或使用隐身模式。</p>
        </Banner>

        {/* 配置区域 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">翻译配置</Text>
                
                <BlockStack gap="400">
                  <InlineStack gap="400" align="start">
                    <Box minWidth="200px">
                      <Select
                        label="目标语言"
                        options={supportedLanguages}
                        value={selectedLanguage}
                        onChange={setSelectedLanguage}
                      />
                    </Box>
                    
                    <Box minWidth="200px">
                      <Select
                        label="资源类型"
                        options={resourceTypeOptions}
                        value={selectedResourceType}
                        onChange={setSelectedResourceType}
                      />
                    </Box>
                  </InlineStack>
                  
                  <InlineStack gap="200">
                    <Button 
                      onClick={simulateScan} 
                      loading={isScanning}
                      variant="secondary"
                    >
                      扫描产品
                    </Button>
                    <Button 
                      onClick={simulateTranslate} 
                      loading={isTranslating}
                      variant="primary"
                      disabled={stats.totalResources === 0}
                    >
                      开始翻译
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

        {/* 操作日志 */}
        {logs.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">操作日志</Text>
                  <Box style={{maxHeight: "200px", overflowY: "scroll"}}>
                    <BlockStack gap="100">
                      {logs.map((log, index) => (
                        <Text 
                          key={index} 
                          variant="bodySm" 
                          tone={log.type === 'error' ? 'critical' : log.type === 'success' ? 'success' : undefined}
                        >
                          [{log.timestamp}] {log.message}
                        </Text>
                      ))}
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* 调试信息 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">调试信息</Text>
                <Text>当前URL: {typeof window !== 'undefined' ? window.location.href : 'N/A'}</Text>
                <Text>浏览器: {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}</Text>
                <InlineStack gap="200">
                  <Button url="/app" variant="tertiary">主应用（需认证）</Button>
                  <Button url="/app/simple" variant="tertiary">简化版（需认证）</Button>
                  <Button url="/test/ui" variant="tertiary">纯HTML测试</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}