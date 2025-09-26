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
  primaryLanguage = null,
  onLanguageAdded,
  onLanguagesUpdated,
  shopId 
}) {
  const fetcher = useFetcher();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedLanguages, setSelectedLanguages] = useState([]);

  const [languageData, setLanguageData] = useState({
    shop: { primary: primaryLanguage ? { ...primaryLanguage } : null, locales: [], count: 0 },
    available: { locales: [], grouped: {}, total: 0 },
    database: { languages: [], count: 0 },
    limit: {
      primaryLocale: null,
      currentCount: 0,
      maxLimit: 20,
      canAddMore: true,
      remainingSlots: 20,
      totalLocales: 0
    }
  });

  useEffect(() => {
    if (primaryLanguage) {
      setLanguageData((prev) => ({
        ...prev,
        shop: {
          ...prev.shop,
          primary: primaryLanguage
        },
        limit: {
          ...prev.limit,
          primaryLocale: prev.limit.primaryLocale ?? primaryLanguage
        }
      }));
    }
  }, [primaryLanguage]);

  // 加载语言数据
  const loadLanguageData = useCallback(() => {
    setLoading(true);
    setError('');
    const url = shopId ? `/api/locales?action=combined&shop=${encodeURIComponent(shopId)}` : '/api/locales?action=combined';
    fetcher.load(url);
  }, [shopId]);

  const normalizeLanguageData = useCallback((data) => {
    const primary = data?.shop?.primary ?? null;
    const locales = data?.shop?.locales ?? [];
    const alternateCount = data?.limit?.alternateCount ?? data?.limit?.currentCount ?? (data?.shop?.count ?? locales.length);
    const maxLimit = data?.limit?.maxAlternate ?? data?.limit?.maxLimit ?? 20;
    const remainingSlots = data?.limit?.remainingAlternateSlots ?? data?.limit?.remainingSlots ?? Math.max(maxLimit - alternateCount, 0);

    return {
      shop: {
        primary,
        locales,
        count: data?.shop?.count ?? locales.length
      },
      available: {
        locales: data?.available?.locales ?? [],
        grouped: data?.available?.grouped ?? {},
        total: data?.available?.total ?? 0
      },
      database: {
        languages: data?.database?.languages ?? [],
        count: data?.database?.count ?? 0
      },
      limit: {
        primaryLocale: data?.limit?.primaryLocale ?? primary,
        currentCount: alternateCount,
        maxLimit,
        canAddMore: data?.limit?.canAddMore ?? remainingSlots > 0,
        remainingSlots,
        totalLocales: data?.limit?.totalLocales ?? (alternateCount + (primary ? 1 : 0))
      }
    };
  }, []);

  // 处理fetcher响应
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) {
      return;
    }

    setLoading(false);

    if (!fetcher.data.success) {
      setError(fetcher.data.message || '加载语言数据失败');
      return;
    }

    const normalizedData = normalizeLanguageData(fetcher.data.data);
    setLanguageData(normalizedData);
    setError('');

    if (onLanguagesUpdated) {
      onLanguagesUpdated({
        languages: normalizedData.database.languages,
        primary: normalizedData.shop.primary ?? normalizedData.limit.primaryLocale ?? null
      });
    }
  }, [fetcher.data, fetcher.state, normalizeLanguageData, onLanguagesUpdated]);

  // 打开模态框时加载数据
  useEffect(() => {
    if (showModal && ((languageData?.available?.locales?.length ?? 0) === 0)) {
      loadLanguageData();
    }
  }, [showModal, languageData?.available?.locales?.length, loadLanguageData]);

  // 启用选中的语言
  const enableSelectedLanguages = async () => {
    if (selectedLanguages.length === 0) return;

    setLoading(true);
    fetcher.submit(
      {
        action: 'enableMultiple',
        locales: selectedLanguages,
        ...(shopId ? { shop: shopId } : {})
      },
      {
        method: 'POST',
        action: shopId ? `/api/locales?shop=${encodeURIComponent(shopId)}` : '/api/locales',
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
      { action: 'sync', ...(shopId ? { shop: shopId } : {}) },
      {
        method: 'POST',
        action: shopId ? `/api/locales?shop=${encodeURIComponent(shopId)}` : '/api/locales',
        encType: 'application/json'
      }
    );
  };

  // 过滤语言列表
  const getFilteredLanguages = () => {
    const grouped = languageData?.available?.grouped ?? {};
    const all = languageData?.available?.locales ?? [];

    let languages = selectedRegion === 'all'
      ? all
      : grouped[selectedRegion] ?? [];

    if (!searchTerm) {
      return languages;
    }

    const term = searchTerm.toLowerCase();

    return languages.filter(lang => {
      const label = lang.label?.toLowerCase() ?? '';
      const value = lang.value?.toLowerCase() ?? '';
      return label.includes(term) || value.includes(term);
    });
  };

  // 切换语言选择
  const toggleLanguageSelection = (code) => {
    setSelectedLanguages(prev => {
      if (prev.includes(code)) {
        return prev.filter(c => c !== code);
      }

      const remainingSlots = languageData?.limit?.remainingSlots ?? 0;

      if (remainingSlots <= 0 || prev.length >= remainingSlots) {
        return prev;
      }

      return [...prev, code];
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

  const remainingSlots = languageData?.limit?.remainingSlots ?? 0;
  const currentCount = languageData?.limit?.currentCount ?? 0;
  const maxLimit = languageData?.limit?.maxLimit ?? 20;
  const canAddMore = languageData?.limit?.canAddMore ?? true;
  const primaryLocale = languageData?.shop?.primary ?? languageData?.limit?.primaryLocale ?? null;
  const selectionProgress = maxLimit === 0
    ? 0
    : Math.min(((currentCount + selectedLanguages.length) / maxLimit) * 100, 100);
  const selectionTone = remainingSlots > 0 && selectedLanguages.length >= remainingSlots ? 'critical' : 'primary';
  const remainingSelectable = Math.max(remainingSlots - selectedLanguages.length, 0);
  const filteredLanguages = getFilteredLanguages();

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
            {error && (
              <Banner tone="critical">
                <Text variant="bodySm">{error}</Text>
              </Banner>
            )}
            <Banner
              title={`目标语言配额: ${currentCount} / ${maxLimit}`}
              tone={remainingSlots <= 3 ? 'warning' : 'info'}
            >
              <BlockStack gap="100">
                <Text variant="bodySm">
                  {canAddMore
                    ? `还可以添加 ${remainingSlots} 个语言`
                    : '已达到最大目标语言数量限制'}
                </Text>
                {primaryLocale && (
                  <Text variant="bodySm" tone="subdued">
                    默认语言：{primaryLocale.label || primaryLocale.value}
                  </Text>
                )}
              </BlockStack>
            </Banner>

            {/* 当前已启用的语言 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">已启用的目标语言 ({languageData.shop.count})</Text>
                <InlineStack gap="200" wrap>
                  {primaryLocale && (
                    <Badge tone="success">
                      {primaryLocale.label || primaryLocale.value} (默认)
                    </Badge>
                  )}
                  {(languageData?.shop?.locales ?? []).map((locale) => (
                    <Badge
                      key={locale.value}
                      tone={locale.isPublished ? 'info' : undefined}
                    >
                      {locale.label}
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
                    可添加的语言 ({filteredLanguages.length})
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    已选择: {selectedLanguages.length} / {remainingSlots}
                  </Text>
                </InlineStack>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spinner size="large" />
                  </div>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <BlockStack gap="100">
                      {filteredLanguages.map(locale => {
                        const isSelected = selectedLanguages.includes(locale.value);
                        const canSelectMore = remainingSlots > 0 && selectedLanguages.length < remainingSlots;
                        const isDisabled = !isSelected && !canSelectMore;

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
                    progress={selectionProgress}
                    tone={selectionTone}
                  />
                  <Text variant="bodySm" tone="subdued">
                    {`已选择 ${selectedLanguages.length} 个语言，还可选择 ${remainingSelectable} 个`}
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