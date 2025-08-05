import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  TextField,
  Select,
  Banner,
  Divider,
  List
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { translateResource } from "../services/translation.server.js";
import { useState } from "react";

/**
 * 实时翻译测试工具
 * 用于测试和验证翻译功能，特别是SEO字段翻译
 */
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  return json({
    shopDomain: session.shop,
    success: true
  });
};

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const originalText = formData.get('originalText');
    const resourceType = formData.get('resourceType');
    const targetLanguage = formData.get('targetLanguage');
    const fieldType = formData.get('fieldType');
    
    if (!originalText || !resourceType || !targetLanguage || !fieldType) {
      return json({
        success: false,
        error: '请填写所有必需字段'
      });
    }

    console.log('🧪 实时翻译测试:', {
      originalText: originalText.substring(0, 100),
      resourceType,
      targetLanguage,
      fieldType
    });

    // 构建模拟资源对象进行翻译测试
    const mockResource = {
      id: 'test-resource',
      resourceType: resourceType.toLowerCase(),
      title: fieldType === 'title' ? originalText : 'Test Title',
      description: fieldType === 'description' ? originalText : 'Test Description',
      descriptionHtml: fieldType === 'descriptionHtml' ? originalText : 'Test Description HTML',
      seoTitle: fieldType === 'seoTitle' ? originalText : 'Test SEO Title',
      seoDescription: fieldType === 'seoDescription' ? originalText : 'Test SEO Description',
      handle: fieldType === 'handle' ? originalText : 'test-handle',
      summary: fieldType === 'summary' ? originalText : null,
      label: fieldType === 'label' ? originalText : null
    };

    // 执行翻译测试
    const translationResult = await translateResource(
      mockResource,
      targetLanguage
    );

    // 提取对应字段的翻译结果
    let translatedText = '';
    let validationInfo = null;
    
    if (translationResult.success && translationResult.translations) {
      const fieldMap = {
        'title': 'titleTrans',
        'description': 'descTrans', 
        'descriptionHtml': 'descTrans',
        'seoTitle': 'seoTitleTrans',
        'seoDescription': 'seoDescTrans',
        'handle': 'handleTrans',
        'summary': 'summaryTrans',
        'label': 'labelTrans'
      };
      
      const translationField = fieldMap[fieldType];
      translatedText = translationResult.translations[translationField] || '';
      
      // 获取验证信息
      if (translationResult.validationResults) {
        validationInfo = translationResult.validationResults.find(v => 
          v.fieldName && (
            v.fieldName.includes(fieldType) || 
            (fieldType.includes('seo') && v.fieldName.includes('seo'))
          )
        );
      }
    }

    return json({
      success: translationResult.success,
      originalText,
      translatedText,
      translationResult,
      validationInfo,
      fieldType,
      resourceType,
      targetLanguage,
      processingTime: translationResult.processingTime,
      translationStats: translationResult.translationStats
    });

  } catch (error) {
    console.error('❌ 翻译测试失败:', error);
    return json({
      success: false,
      error: error.message
    });
  }
};

export default function TranslationTest() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  
  const [originalText, setOriginalText] = useState('');
  const [resourceType, setResourceType] = useState('page');
  const [targetLanguage, setTargetLanguage] = useState('zh-CN');
  const [fieldType, setFieldType] = useState('seoTitle');
  
  const resourceTypeOptions = [
    { label: '页面 (Page)', value: 'page' },
    { label: '产品 (Product)', value: 'product' },
    { label: '集合 (Collection)', value: 'collection' },
    { label: '文章 (Article)', value: 'article' },
    { label: '博客 (Blog)', value: 'blog' }
  ];
  
  const fieldTypeOptions = [
    { label: 'SEO标题 (SEO Title)', value: 'seoTitle' },
    { label: 'SEO描述 (SEO Description)', value: 'seoDescription' },
    { label: '标题 (Title)', value: 'title' },
    { label: '描述 (Description)', value: 'description' },
    { label: '富文本描述 (Description HTML)', value: 'descriptionHtml' },
    { label: 'URL句柄 (Handle)', value: 'handle' },
    { label: '摘要 (Summary)', value: 'summary' },
    { label: '标签 (Label)', value: 'label' }
  ];
  
  const languageOptions = [
    { label: '简体中文 (zh-CN)', value: 'zh-CN' },
    { label: '繁体中文 (zh-TW)', value: 'zh-TW' },
    { label: '英文 (en)', value: 'en' },
    { label: '法文 (fr)', value: 'fr' },
    { label: '德文 (de)', value: 'de' },
    { label: '日文 (ja)', value: 'ja' }
  ];

  const handleTest = () => {
    if (!originalText.trim()) {
      return;
    }
    
    const formData = new FormData();
    formData.append('originalText', originalText);
    formData.append('resourceType', resourceType);
    formData.append('targetLanguage', targetLanguage);
    formData.append('fieldType', fieldType);
    
    fetcher.submit(formData, { method: 'post' });
  };

  const isLoading = fetcher.state === 'submitting';
  const testResult = fetcher.data;

  return (
    <Page title="实时翻译测试工具">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">翻译参数配置</Text>
              
              <TextField
                label="原始文本"
                value={originalText}
                onChange={setOriginalText}
                multiline={4}
                placeholder="输入要翻译的文本..."
                helpText="输入要测试翻译的原始内容"
              />
              
              <InlineStack gap="300">
                <div style={{ flex: 1 }}>
                  <Select
                    label="资源类型"
                    options={resourceTypeOptions}
                    value={resourceType}
                    onChange={setResourceType}
                  />
                </div>
                
                <div style={{ flex: 1 }}>
                  <Select
                    label="字段类型"
                    options={fieldTypeOptions}
                    value={fieldType}
                    onChange={setFieldType}
                  />
                </div>
                
                <div style={{ flex: 1 }}>
                  <Select
                    label="目标语言"
                    options={languageOptions}
                    value={targetLanguage}
                    onChange={setTargetLanguage}
                  />
                </div>
              </InlineStack>
              
              <InlineStack align="end">
                <Button 
                  onClick={handleTest}
                  variant="primary"
                  loading={isLoading}
                  disabled={!originalText.trim()}
                >
                  {isLoading ? '翻译测试中...' : '开始翻译测试'}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 测试结果显示 */}
        {testResult && (
          <Layout.Section>
            {testResult.success ? (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">翻译结果</Text>
                    <Badge tone="success">翻译成功</Badge>
                  </InlineStack>
                  
                  {/* 翻译对比 */}
                  <Card subdued>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">翻译对比</Text>
                      
                      <div>
                        <Text variant="bodySm" tone="subdued">
                          原文 ({testResult.originalText.length} 字符)
                        </Text>
                        <Text as="p" variant="bodyMd">
                          {testResult.originalText}
                        </Text>
                      </div>
                      
                      <Divider />
                      
                      <div>
                        <Text variant="bodySm" tone="subdued">
                          译文 ({testResult.translatedText.length} 字符)
                        </Text>
                        <Text as="p" variant="bodyMd">
                          {testResult.translatedText}
                        </Text>
                      </div>
                    </BlockStack>
                  </Card>
                  
                  {/* 验证信息 */}
                  {testResult.validationInfo && (
                    <Card subdued>
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">翻译验证</Text>
                        
                        <InlineStack gap="200">
                          <Badge tone={testResult.validationInfo.isValid ? "success" : "critical"}>
                            {testResult.validationInfo.isValid ? "验证通过" : "验证警告"}
                          </Badge>
                          <Text variant="bodySm">
                            字段: {testResult.validationInfo.fieldName}
                          </Text>
                        </InlineStack>
                        
                        {testResult.validationInfo.issues && testResult.validationInfo.issues.length > 0 && (
                          <div>
                            <Text variant="bodySm" tone="subdued">验证问题:</Text>
                            <List>
                              {testResult.validationInfo.issues.map((issue, index) => (
                                <List.Item key={index}>{issue}</List.Item>
                              ))}
                            </List>
                          </div>
                        )}
                      </BlockStack>
                    </Card>
                  )}
                  
                  {/* 性能统计 */}
                  {testResult.processingTime && (
                    <Card subdued>
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">性能统计</Text>
                        <InlineStack gap="400">
                          <Text variant="bodySm">
                            处理时间: {testResult.processingTime}ms
                          </Text>
                          {testResult.translationStats && (
                            <Text variant="bodySm">
                              翻译统计: {JSON.stringify(testResult.translationStats)}
                            </Text>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  )}
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <Banner title="翻译失败" tone="critical">
                  <p>{testResult.error}</p>
                </Banner>
              </Card>
            )}
          </Layout.Section>
        )}

        {/* 使用说明 */}
        <Layout.Section>
          <Card subdued>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">使用说明</Text>
              <BlockStack gap="200">
                <Text variant="bodySm">
                  1. 输入要测试的原始文本内容
                </Text>
                <Text variant="bodySm">
                  2. 选择资源类型（页面、产品、集合等）
                </Text>
                <Text variant="bodySm">
                  3. 选择要测试的字段类型（特别关注SEO标题和SEO描述）
                </Text>
                <Text variant="bodySm">
                  4. 选择目标翻译语言
                </Text>
                <Text variant="bodySm">
                  5. 点击"开始翻译测试"查看翻译结果和验证状态
                </Text>
                <Text variant="bodySm" tone="subdued">
                  此工具专门用于测试SEO字段翻译修复效果，可以实时验证翻译质量和验证逻辑。
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}