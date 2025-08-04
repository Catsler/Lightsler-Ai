import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Select,
  Text,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";

/**
 * 基础UI测试页面 - 验证选择框和按键功能
 */
export default function BasicUITest() {
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [selectedType, setSelectedType] = useState('PRODUCT');
  const [clickCount, setClickCount] = useState(0);
  const [logs, setLogs] = useState([]);

  const languageOptions = [
    { label: 'Chinese (Simplified)', value: 'zh-CN' },
    { label: 'English', value: 'en' },
    { label: 'Japanese', value: 'ja' },
    { label: 'German', value: 'de' },
  ];

  const typeOptions = [
    { label: '产品', value: 'PRODUCT' },
    { label: '集合', value: 'COLLECTION' },
    { label: '页面', value: 'PAGE' },
  ];

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 4)]);
  };

  const handleLanguageChange = (value) => {
    setSelectedLanguage(value);
    addLog(`语言已切换到: ${languageOptions.find(opt => opt.value === value)?.label}`);
  };

  const handleTypeChange = (value) => {
    setSelectedType(value);
    addLog(`类型已切换到: ${typeOptions.find(opt => opt.value === value)?.label}`);
  };

  const handleButtonClick = () => {
    setClickCount(prev => prev + 1);
    addLog(`按钮被点击 #${clickCount + 1}`);
  };

  return (
    <Page title="基础UI功能测试">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">选择框和按键测试</Text>
              
              <BlockStack gap="300">
                <InlineStack gap="400" align="start">
                  <div style={{ minWidth: '200px' }}>
                    <Select
                      label="目标语言"
                      options={languageOptions}
                      value={selectedLanguage}
                      onChange={handleLanguageChange}
                    />
                  </div>
                  
                  <div style={{ minWidth: '200px' }}>
                    <Select
                      label="资源类型"
                      options={typeOptions}
                      value={selectedType}
                      onChange={handleTypeChange}
                    />
                  </div>
                </InlineStack>
                
                <InlineStack gap="200">
                  <Button onClick={handleButtonClick} variant="primary">
                    测试按钮 (点击次数: {clickCount})
                  </Button>
                  <Button onClick={() => setLogs([])} variant="secondary">
                    清空日志
                  </Button>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">当前状态</Text>
              <Text>选中语言: {selectedLanguage} ({languageOptions.find(opt => opt.value === selectedLanguage)?.label})</Text>
              <Text>选中类型: {selectedType} ({typeOptions.find(opt => opt.value === selectedType)?.label})</Text>
              <Text>按钮点击次数: {clickCount}</Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {logs.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">操作日志</Text>
                <BlockStack gap="100">
                  {logs.map((log, index) => (
                    <Text key={index} variant="bodySm" tone={index === 0 ? 'success' : undefined}>
                      {log}
                    </Text>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}