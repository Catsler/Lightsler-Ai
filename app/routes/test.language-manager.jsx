/**
 * 语言管理功能测试页面
 * 测试语言查询、添加、管理功能
 */

import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  DataTable,
  Divider,
  Select
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { LanguageManager } from '../components/LanguageManager';
import {
  getAvailableLocales,
  getShopLocales,
  checkLocaleLimit,
  formatLocalesForUI,
  groupLocalesByRegion
} from '../services/shopify-locales.server';

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    // 获取所有信息
    const [availableLocales, shopLocales, limitInfo] = await Promise.all([
      getAvailableLocales(admin),
      getShopLocales(admin),
      checkLocaleLimit(admin)
    ]);
    
    // 按地区分组
    const groupedLocales = groupLocalesByRegion(availableLocales);
    
    return json({
      available: {
        locales: formatLocalesForUI(availableLocales),
        grouped: groupedLocales,
        total: availableLocales.length
      },
      shop: {
        locales: formatLocalesForUI(shopLocales),
        count: shopLocales.length
      },
      limit: limitInfo,
      shopId: session.shop
    });
  } catch (error) {
    console.error('加载语言数据失败:', error);
    return json({
      error: error.message,
      available: { locales: [], grouped: {}, total: 0 },
      shop: { locales: [], count: 0 },
      limit: { currentCount: 0, maxLimit: 20, canAddMore: true, remainingSlots: 20 }
    });
  }
};

export default function LanguageManagerTest() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [testResults, setTestResults] = useState([]);
  const [currentLanguages, setCurrentLanguages] = useState(data.shop.locales);
  
  // 添加测试结果
  const addTestResult = useCallback((test, success, message) => {
    setTestResults(prev => [...prev, {
      test,
      success,
      message,
      timestamp: new Date().toLocaleTimeString()
    }]);
  }, []);
  
  // 测试语言启用
  const testEnableLanguage = async () => {
    const testLocale = 'fr'; // 测试添加法语
    
    fetcher.submit(
      { action: 'enable', locale: testLocale },
      { 
        method: 'POST', 
        action: '/api/locales',
        encType: 'application/json'
      }
    );
    
    addTestResult('启用语言', true, `尝试启用语言: ${testLocale}`);
  };
  
  // 测试批量启用
  const testEnableMultiple = async () => {
    const testLocales = ['de', 'es', 'it']; // 德语、西班牙语、意大利语
    
    fetcher.submit(
      { action: 'enableMultiple', locales: testLocales },
      { 
        method: 'POST', 
        action: '/api/locales',
        encType: 'application/json'
      }
    );
    
    addTestResult('批量启用', true, `尝试启用 ${testLocales.length} 个语言`);
  };
  
  // 测试同步功能
  const testSync = async () => {
    fetcher.submit(
      { action: 'sync' },
      { 
        method: 'POST', 
        action: '/api/locales',
        encType: 'application/json'
      }
    );
    
    addTestResult('同步语言', true, '同步店铺语言到数据库');
  };
  
  // 测试查询限制
  const testCheckLimit = async () => {
    fetcher.load('/api/locales?action=limit');
    addTestResult('检查限制', true, '查询语言数量限制');
  };
  
  // 处理fetcher响应
  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      if (fetcher.data.success) {
        addTestResult('API响应', true, `操作成功: ${fetcher.data.data?.message || 'OK'}`);
        
        // 更新当前语言列表（如果有）
        if (fetcher.data.data?.languages) {
          setCurrentLanguages(fetcher.data.data.languages);
        }
      } else {
        addTestResult('API响应', false, `操作失败: ${fetcher.data.error}`);
      }
    }
  }, [fetcher.data, fetcher.state, addTestResult]);
  
  // 处理语言更新
  const handleLanguagesUpdated = (languages) => {
    setCurrentLanguages(languages);
    addTestResult('语言更新', true, `语言列表已更新，共 ${languages.length} 个`);
  };
  
  // 处理语言添加
  const handleLanguageAdded = (languageCodes) => {
    addTestResult('语言添加', true, `添加了 ${languageCodes.length} 个语言`);
  };
  
  // 获取地区语言
  const getRegionLanguages = () => {
    if (selectedRegion === 'all') {
      return data.available.locales;
    }
    return data.available.grouped[selectedRegion] || [];
  };
  
  return (
    <Page
      title="语言管理测试"
      backAction={{ content: '返回', url: '/app' }}
    >
      <BlockStack gap="500">
        {/* 错误提示 */}
        {data.error && (
          <Banner tone="critical">
            <Text>加载错误: {data.error}</Text>
          </Banner>
        )}
        
        {/* 语言限制信息 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">语言配额信息</Text>
                <InlineStack gap="400">
                  <Badge tone="info">
                    当前: {data.limit.currentCount} / {data.limit.maxLimit}
                  </Badge>
                  <Badge tone={data.limit.canAddMore ? 'success' : 'critical'}>
                    {data.limit.canAddMore 
                      ? `可添加 ${data.limit.remainingSlots} 个` 
                      : '已达上限'}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* 当前启用的语言 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">
                  当前启用的语言 ({currentLanguages.length})
                </Text>
                <InlineStack gap="200" wrap>
                  {currentLanguages.map(locale => (
                    <Badge
                      key={locale.value}
                      tone={locale.isPrimary ? 'success' : locale.isPublished ? 'info' : undefined}
                    >
                      {locale.label} ({locale.value})
                    </Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* 语言管理器组件测试 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">语言管理器组件</Text>
                <LanguageManager
                  currentLanguages={currentLanguages}
                  onLanguageAdded={handleLanguageAdded}
                  onLanguagesUpdated={handleLanguagesUpdated}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* 测试操作 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">测试操作</Text>
                <InlineStack gap="300">
                  <Button onClick={testEnableLanguage}>
                    测试启用单个语言
                  </Button>
                  <Button onClick={testEnableMultiple}>
                    测试批量启用
                  </Button>
                  <Button onClick={testSync}>
                    测试同步功能
                  </Button>
                  <Button onClick={testCheckLimit}>
                    测试查询限制
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* 可用语言统计 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd">
                    可用语言统计 ({data.available.total})
                  </Text>
                  <Select
                    label=""
                    options={[
                      { label: '所有地区', value: 'all' },
                      { label: '亚洲', value: 'Asia' },
                      { label: '欧洲', value: 'Europe' },
                      { label: '美洲', value: 'Americas' },
                      { label: '非洲', value: 'Africa' },
                      { label: '大洋洲', value: 'Oceania' },
                      { label: '其他', value: 'Other' }
                    ]}
                    value={selectedRegion}
                    onChange={setSelectedRegion}
                  />
                </InlineStack>
                
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text']}
                    headings={['语言代码', '语言名称', '状态']}
                    rows={getRegionLanguages().slice(0, 20).map(locale => [
                      locale.value,
                      locale.label,
                      currentLanguages.some(l => l.value === locale.value) 
                        ? '已启用' 
                        : '未启用'
                    ])}
                  />
                </div>
                
                {getRegionLanguages().length > 20 && (
                  <Text variant="bodySm" tone="subdued">
                    ... 还有 {getRegionLanguages().length - 20} 个语言
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* 测试结果 */}
        {testResults.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">测试结果</Text>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <BlockStack gap="200">
                      {testResults.map((result, index) => (
                        <InlineStack key={index} gap="300">
                          <Badge tone={result.success ? 'success' : 'critical'}>
                            {result.success ? '✓' : '✗'}
                          </Badge>
                          <Text variant="bodySm">
                            [{result.timestamp}] {result.test}: {result.message}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
        
        <Divider />
        
        {/* 地区语言分布 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">地区语言分布</Text>
                <BlockStack gap="200">
                  {Object.entries(data.available.grouped).map(([region, locales]) => (
                    <InlineStack key={region} gap="300">
                      <Badge>{region}</Badge>
                      <Text variant="bodySm">
                        {locales.length} 个语言
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}