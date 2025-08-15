/**
 * 语言管理组件
 * 提供语言选择、添加和管理功能
 */

import { useState, useEffect, useCallback } from 'react';
import { useFetcher } from '@remix-run/react';
import {
  Modal,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  TextField,
  Checkbox,
  ProgressBar,
  Banner,
  Spinner,
  Grid,
  Divider,
  Select,
  Icon
} from '@shopify/polaris';

export function LanguageManager({ 
  currentLanguages = [], 
  onLanguageAdded,
  onLanguagesUpdated 
}) {
  const fetcher = useFetcher();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [languageData, setLanguageData] = useState({
    shop: { locales: [], count: 0 },
    available: { locales: [], grouped: {}, total: 0 },
    database: { languages: [], count: 0 },
    limit: { currentCount: 0, maxLimit: 20, canAddMore: true, remainingSlots: 20 }
  });

  // 加载语言数据
  const loadLanguageData = useCallback(() => {
    setLoading(true);
    fetcher.load('/api/locales?action=combined');
  }, []);

  // 处理fetcher响应
  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      setLoading(false);
      if (fetcher.data.success) {
        setLanguageData(fetcher.data.data);
        // 通知父组件语言更新
        if (onLanguagesUpdated) {
          onLanguagesUpdated(fetcher.data.data.database.languages);
        }
      }
    }
  }, [fetcher.data, fetcher.state, onLanguagesUpdated]);

  // 打开模态框时加载数据
  useEffect(() => {
    if (showModal && !languageData.available.locales.length) {
      loadLanguageData();
    }
  }, [showModal, languageData.available.locales.length, loadLanguageData]);

  // 启用选中的语言
  const enableSelectedLanguages = async () => {
    if (selectedLanguages.length === 0) return;

    setLoading(true);
    fetcher.submit(
      {
        action: 'enableMultiple',
        locales: selectedLanguages
      },
      {
        method: 'POST',
        action: '/api/locales',
        encType: 'application/json'
      }
    );

    // 清空选择并关闭模态框
    setSelectedLanguages([]);
    setShowModal(false);
    
    // 通知父组件
    if (onLanguageAdded) {
      onLanguageAdded(selectedLanguages);
    }
  };

  // 同步语言到数据库
  const syncLanguages = () => {
    setLoading(true);
    fetcher.submit(
      { action: 'sync' },
      {
        method: 'POST',
        action: '/api/locales',
        encType: 'application/json'
      }
    );
  };

  // 过滤语言列表
  const getFilteredLanguages = () => {
    let languages = [];

    if (selectedRegion === 'all') {
      languages = languageData.available.locales;
    } else {
      const grouped = languageData.available.grouped || {};
      languages = grouped[selectedRegion] || [];
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      languages = languages.filter(lang => 
        lang.label.toLowerCase().includes(term) ||
        lang.value.toLowerCase().includes(term)
      );
    }

    return languages;
  };

  // 切换语言选择
  const toggleLanguageSelection = (code) => {
    setSelectedLanguages(prev => {
      if (prev.includes(code)) {
        return prev.filter(c => c !== code);
      } else {
        // 检查是否超过限制
        if (prev.length >= languageData.limit.remainingSlots) {
          return prev;
        }
        return [...prev, code];
      }
    });
  };

  // 地区选项
  const regionOptions = [
    { label: '所有地区', value: 'all' },
    { label: '亚洲', value: 'Asia' },
    { label: '欧洲', value: 'Europe' },
    { label: '美洲', value: 'Americas' },
    { label: '非洲', value: 'Africa' },
    { label: '大洋洲', value: 'Oceania' },
    { label: '其他', value: 'Other' }
  ];

  return (
    <>
      {/* 触发按钮 */}
      <Button
        onClick={() => setShowModal(true)}
        size="slim"
      >
        管理语言
      </Button>

      {/* 语言管理模态框 */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="语言管理"
        primaryAction={{
          content: `添加选中的语言 (${selectedLanguages.length})`,
          onAction: enableSelectedLanguages,
          disabled: selectedLanguages.length === 0 || loading,
          loading: loading
        }}
        secondaryActions={[
          {
            content: '同步语言',
            onAction: syncLanguages,
            disabled: loading
          },
          {
            content: '取消',
            onAction: () => setShowModal(false)
          }
        ]}
        large
      >
        <Modal.Section>
          <BlockStack gap="400">
            {/* 语言限制提示 */}
            <Banner
              title={`语言配额: ${languageData.limit.currentCount} / ${languageData.limit.maxLimit}`}
              tone={languageData.limit.remainingSlots <= 3 ? 'warning' : 'info'}
            >
              <Text variant="bodySm">
                {languageData.limit.canAddMore 
                  ? `还可以添加 ${languageData.limit.remainingSlots} 个语言`
                  : '已达到最大语言数量限制'}
              </Text>
            </Banner>

            {/* 当前已启用的语言 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">已启用的语言 ({languageData.shop.count})</Text>
                <InlineStack gap="200" wrap>
                  {languageData.shop.locales.map(locale => (
                    <Badge
                      key={locale.value}
                      tone={locale.isPrimary ? 'success' : locale.isPublished ? 'info' : undefined}
                    >
                      {locale.label}
                      {locale.isPrimary && ' (主要)'}
                    </Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>

            <Divider />

            {/* 搜索和过滤 */}
            <InlineStack gap="300">
              <div style={{ flex: 1 }}>
                <TextField
                  label="搜索语言"
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="输入语言名称或代码..."
                  clearButton
                  onClearButtonClick={() => setSearchTerm('')}
                />
              </div>
              <Select
                label="地区筛选"
                options={regionOptions}
                value={selectedRegion}
                onChange={setSelectedRegion}
              />
            </InlineStack>

            {/* 可添加的语言列表 */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd">
                    可添加的语言 ({getFilteredLanguages().length})
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    已选择: {selectedLanguages.length} / {languageData.limit.remainingSlots}
                  </Text>
                </InlineStack>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spinner size="large" />
                  </div>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <BlockStack gap="100">
                      {getFilteredLanguages().map(locale => {
                        const isSelected = selectedLanguages.includes(locale.value);
                        const isDisabled = !isSelected && 
                          selectedLanguages.length >= languageData.limit.remainingSlots;

                        return (
                          <div
                            key={locale.value}
                            style={{
                              padding: '8px',
                              borderRadius: '4px',
                              backgroundColor: isSelected ? '#f4f6f8' : 'transparent',
                              opacity: isDisabled ? 0.5 : 1,
                              cursor: isDisabled ? 'not-allowed' : 'pointer'
                            }}
                            onClick={() => !isDisabled && toggleLanguageSelection(locale.value)}
                          >
                            <InlineStack align="space-between">
                              <InlineStack gap="200">
                                <Checkbox
                                  label=""
                                  checked={isSelected}
                                  disabled={isDisabled}
                                  onChange={() => toggleLanguageSelection(locale.value)}
                                />
                                <BlockStack gap="000">
                                  <Text variant="bodyMd" fontWeight="medium">
                                    {locale.label}
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    {locale.value}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              {isSelected && (
                                <Badge tone="success">✓</Badge>
                              )}
                            </InlineStack>
                          </div>
                        );
                      })}
                    </BlockStack>
                  </div>
                )}
              </BlockStack>
            </Card>

            {/* 选择进度 */}
            {selectedLanguages.length > 0 && (
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm">选择进度</Text>
                  <ProgressBar
                    progress={(selectedLanguages.length / languageData.limit.remainingSlots) * 100}
                    tone={selectedLanguages.length === languageData.limit.remainingSlots ? 'critical' : 'primary'}
                  />
                  <Text variant="bodySm" tone="subdued">
                    已选择 {selectedLanguages.length} 个语言，还可选择 {languageData.limit.remainingSlots - selectedLanguages.length} 个
                  </Text>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}