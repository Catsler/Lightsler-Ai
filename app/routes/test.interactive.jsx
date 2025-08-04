import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Select,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  Checkbox,
  TextField
} from "@shopify/polaris";

/**
 * 交互测试页面 - 专门测试用户交互功能
 * 用于诊断按键和选择框问题
 */
export default function InteractiveTest() {
  // 状态管理
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [selectedType, setSelectedType] = useState('PRODUCT');
  const [textValue, setTextValue] = useState('');
  const [checkboxValue, setCheckboxValue] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [interactionLogs, setInteractionLogs] = useState([]);
  const [testResults, setTestResults] = useState({
    selectWorking: null,
    buttonWorking: null,
    textFieldWorking: null,
    checkboxWorking: null
  });

  // 选项数据
  const languageOptions = [
    { label: 'Chinese (Simplified)', value: 'zh-CN' },
    { label: 'English', value: 'en' },
    { label: 'Japanese', value: 'ja' },
    { label: 'German', value: 'de' },
    { label: 'French', value: 'fr' },
    { label: 'Spanish', value: 'es' }
  ];

  const typeOptions = [
    { label: 'Product (产品)', value: 'PRODUCT' },
    { label: 'Collection (集合)', value: 'COLLECTION' },
    { label: 'Page (页面)', value: 'PAGE' },
    { label: 'Article (文章)', value: 'ARTICLE' }
  ];

  // 添加日志的函数
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      timestamp,
      message,
      type
    };
    
    setInteractionLogs(prev => [logEntry, ...prev.slice(0, 19)]); // 保留最近20条
    console.log(`[${timestamp}] ${message}`);
  }, []);

  // 语言选择处理
  const handleLanguageChange = useCallback((value) => {
    try {
      setSelectedLanguage(value);
      const selectedOption = languageOptions.find(opt => opt.value === value);
      addLog(`✅ 语言选择成功: ${selectedOption?.label || value}`, 'success');
      setTestResults(prev => ({ ...prev, selectWorking: true }));
    } catch (error) {
      addLog(`❌ 语言选择失败: ${error.message}`, 'error');
      setTestResults(prev => ({ ...prev, selectWorking: false }));
    }
  }, [addLog, languageOptions]);

  // 类型选择处理
  const handleTypeChange = useCallback((value) => {
    try {
      setSelectedType(value);
      const selectedOption = typeOptions.find(opt => opt.value === value);
      addLog(`✅ 类型选择成功: ${selectedOption?.label || value}`, 'success');
      setTestResults(prev => ({ ...prev, selectWorking: true }));
    } catch (error) {
      addLog(`❌ 类型选择失败: ${error.message}`, 'error');
      setTestResults(prev => ({ ...prev, selectWorking: false }));
    }
  }, [addLog, typeOptions]);

  // 按钮点击处理
  const handleButtonClick = useCallback(() => {
    try {
      setClickCount(prev => prev + 1);
      addLog(`🖱️ 按钮点击成功 #${clickCount + 1}`, 'success');
      setTestResults(prev => ({ ...prev, buttonWorking: true }));
    } catch (error) {
      addLog(`❌ 按钮点击失败: ${error.message}`, 'error');
      setTestResults(prev => ({ ...prev, buttonWorking: false }));
    }
  }, [addLog, clickCount]);

  // 文本输入处理
  const handleTextChange = useCallback((value) => {
    try {
      setTextValue(value);
      addLog(`📝 文本输入成功: "${value}"`, 'success');
      setTestResults(prev => ({ ...prev, textFieldWorking: true }));
    } catch (error) {
      addLog(`❌ 文本输入失败: ${error.message}`, 'error');
      setTestResults(prev => ({ ...prev, textFieldWorking: false }));
    }
  }, [addLog]);

  // 复选框处理
  const handleCheckboxChange = useCallback((checked) => {
    try {
      setCheckboxValue(checked);
      addLog(`☑️ 复选框${checked ? '选中' : '取消'}成功`, 'success');
      setTestResults(prev => ({ ...prev, checkboxWorking: true }));
    } catch (error) {
      addLog(`❌ 复选框操作失败: ${error.message}`, 'error');
      setTestResults(prev => ({ ...prev, checkboxWorking: false }));
    }
  }, [addLog]);

  // 清空日志
  const clearLogs = useCallback(() => {
    setInteractionLogs([]);
    addLog('🗑️ 日志已清空');
  }, [addLog]);

  // 运行所有测试
  const runAllTests = useCallback(async () => {
    addLog('🧪 开始运行自动化测试...', 'info');
    
    // 重置测试结果
    setTestResults({
      selectWorking: null,
      buttonWorking: null,
      textFieldWorking: null,
      checkboxWorking: null
    });

    // 测试延迟函数
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // 测试语言选择
      await delay(500);
      handleLanguageChange('en');
      
      await delay(500);
      handleLanguageChange('ja');
      
      await delay(500);
      handleLanguageChange('zh-CN');

      // 测试类型选择
      await delay(500);
      handleTypeChange('COLLECTION');
      
      await delay(500);
      handleTypeChange('PRODUCT');

      // 测试按钮点击
      await delay(500);
      handleButtonClick();
      
      await delay(300);
      handleButtonClick();

      // 测试文本输入
      await delay(500);
      handleTextChange('自动测试文本');
      
      await delay(500);
      handleTextChange('');

      // 测试复选框
      await delay(500);
      handleCheckboxChange(true);
      
      await delay(500);
      handleCheckboxChange(false);

      await delay(1000);
      addLog('✅ 自动化测试完成', 'success');

    } catch (error) {
      addLog(`❌ 自动化测试失败: ${error.message}`, 'error');
    }
  }, [handleLanguageChange, handleTypeChange, handleButtonClick, handleTextChange, handleCheckboxChange, addLog]);

  // 获取测试状态徽章
  const getTestStatusBadge = (status) => {
    if (status === true) return <Badge tone="success">✅ 正常</Badge>;
    if (status === false) return <Badge tone="critical">❌ 异常</Badge>;
    return <Badge tone="info">⏳ 未测试</Badge>;
  };

  // 页面加载时的初始化
  useEffect(() => {
    addLog('🚀 交互测试页面已加载', 'info');
    addLog('💡 请手动测试各个组件，或点击"运行自动测试"', 'info');
  }, [addLog]);

  return (
    <Page title="交互功能测试页面">
      <Layout>
        {/* 测试状态概览 */}
        <Layout.Section>
          <Banner 
            title="组件交互测试" 
            tone={Object.values(testResults).some(r => r === false) ? "critical" : "info"}
          >
            <p>这个页面用于测试Shopify Polaris组件的交互功能。如果某些组件无法响应，我们可以快速定位问题。</p>
          </Banner>
        </Layout.Section>

        {/* 测试结果状态 */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">测试状态</Text>
              <InlineStack gap="400" wrap>
                <InlineStack gap="200" align="center">
                  <Text>Select组件:</Text>
                  {getTestStatusBadge(testResults.selectWorking)}
                </InlineStack>
                <InlineStack gap="200" align="center">
                  <Text>Button组件:</Text>
                  {getTestStatusBadge(testResults.buttonWorking)}
                </InlineStack>
                <InlineStack gap="200" align="center">
                  <Text>TextField组件:</Text>
                  {getTestStatusBadge(testResults.textFieldWorking)}
                </InlineStack>
                <InlineStack gap="200" align="center">
                  <Text>Checkbox组件:</Text>
                  {getTestStatusBadge(testResults.checkboxWorking)}
                </InlineStack>
              </InlineStack>
              
              <InlineStack gap="200">
                <Button onClick={runAllTests} variant="primary">
                  🧪 运行自动测试
                </Button>
                <Button onClick={clearLogs} variant="secondary">
                  🗑️ 清空日志
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 手动测试区域 */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">手动测试区域</Text>
              
              <InlineStack gap="400" align="start">
                {/* Select组件测试 */}
                <div style={{ minWidth: '200px' }}>
                  <Select
                    label="目标语言"
                    options={languageOptions}
                    value={selectedLanguage}
                    onChange={handleLanguageChange}
                    helpText="选择不同选项测试Select组件"
                  />
                </div>
                
                <div style={{ minWidth: '200px' }}>
                  <Select
                    label="资源类型"
                    options={typeOptions}
                    value={selectedType}
                    onChange={handleTypeChange}
                    helpText="测试第二个Select组件"
                  />
                </div>
              </InlineStack>

              {/* Button组件测试 */}
              <InlineStack gap="200">
                <Button onClick={handleButtonClick} variant="primary">
                  主要按钮 (点击: {clickCount})
                </Button>
                <Button onClick={handleButtonClick} variant="secondary">
                  次要按钮
                </Button>
                <Button onClick={handleButtonClick} variant="tertiary">
                  第三按钮
                </Button>
              </InlineStack>

              {/* 其他表单组件测试 */}
              <InlineStack gap="400" align="start">
                <div style={{ minWidth: '300px' }}>
                  <TextField
                    label="文本输入测试"
                    value={textValue}
                    onChange={handleTextChange}
                    placeholder="输入任何文本..."
                    helpText="测试文本输入功能"
                  />
                </div>
                
                <Checkbox
                  label="复选框测试"
                  checked={checkboxValue}
                  onChange={handleCheckboxChange}
                  helpText="测试复选框功能"
                />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 当前状态显示 */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">当前状态</Text>
              <BlockStack gap="200">
                <Text>
                  <strong>选中语言:</strong> {selectedLanguage} 
                  ({languageOptions.find(opt => opt.value === selectedLanguage)?.label})
                </Text>
                <Text>
                  <strong>选中类型:</strong> {selectedType} 
                  ({typeOptions.find(opt => opt.value === selectedType)?.label})
                </Text>
                <Text>
                  <strong>文本内容:</strong> "{textValue}"
                </Text>
                <Text>
                  <strong>复选框状态:</strong> {checkboxValue ? '选中' : '未选中'}
                </Text>
                <Text>
                  <strong>按钮点击次数:</strong> {clickCount}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 交互日志 */}
        {interactionLogs.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">交互日志</Text>
                  <Badge tone="info">{interactionLogs.length} 条记录</Badge>
                </InlineStack>
                
                <div style={{ 
                  maxHeight: '300px', 
                  overflowY: 'auto',
                  padding: '10px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'monospace'
                }}>
                  <BlockStack gap="100">
                    {interactionLogs.map((log) => (
                      <Text 
                        key={log.id} 
                        variant="bodySm"
                        tone={
                          log.type === 'error' ? 'critical' : 
                          log.type === 'success' ? 'success' : 
                          undefined
                        }
                      >
                        [{log.timestamp}] {log.message}
                      </Text>
                    ))}
                  </BlockStack>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* 诊断信息 */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">诊断信息</Text>
              <BlockStack gap="200">
                <Text variant="bodySm">
                  <strong>用户代理:</strong> {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
                </Text>
                <Text variant="bodySm">
                  <strong>视口大小:</strong> {typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}
                </Text>
                <Text variant="bodySm">
                  <strong>页面加载时间:</strong> {new Date().toLocaleString('zh-CN')}
                </Text>
                <Text variant="bodySm">
                  <strong>React版本:</strong> {typeof React !== 'undefined' ? React.version : 'Unknown'}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}