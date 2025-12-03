import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  shopId,
  languageLimit = null
}) {
  const { t } = useTranslation();
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
      currentCount: languageLimit?.activeLanguagesCount ?? 0,
      maxLimit: languageLimit?.maxLanguages ?? 20,
      canAddMore:
        languageLimit?.remainingLanguageSlots == null
          ? true
          : languageLimit.remainingLanguageSlots > 0,
      remainingSlots:
        languageLimit?.remainingLanguageSlots == null
          ? languageLimit?.remainingLanguageSlots ?? 20
          : Math.max(languageLimit.remainingLanguageSlots, 0),
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

  // 同步套餐语言上限信息
  useEffect(() => {
    if (!languageLimit) return;
    setLanguageData((prev) => ({
      ...prev,
      limit: {
        ...prev.limit,
        currentCount: languageLimit.activeLanguagesCount ?? prev.limit.currentCount,
        maxLimit: languageLimit.maxLanguages ?? prev.limit.maxLimit,
        remainingSlots:
          languageLimit.remainingLanguageSlots == null
            ? languageLimit.remainingLanguageSlots
            : Math.max(languageLimit.remainingLanguageSlots, 0),
        canAddMore:
          languageLimit.remainingLanguageSlots == null
            ? true
            : languageLimit.remainingLanguageSlots > 0
      }
    }));
  }, [languageLimit]);

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
      setError(fetcher.data.message || t('languages.errorLoad'));
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

  // {t('languages.sync')}到数据库
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

      if (!isFinite(remainingSlots)) {
        return [...prev, code];
      }

      if (remainingSlots <= 0 || prev.length >= remainingSlots) {
        return prev;
      }

      return [...prev, code];
    });
  };

  // 地区选项
  const regionOptions = [
    { label: t('languages.regions.all'), value: 'all' },
    { label: t('languages.regions.asia'), value: 'Asia' },
    { label: t('languages.regions.europe'), value: 'Europe' },
    { label: t('languages.regions.americas'), value: 'Americas' },
    { label: t('languages.regions.africa'), value: 'Africa' },
    { label: t('languages.regions.oceania'), value: 'Oceania' },
    { label: t('languages.regions.other'), value: 'Other' }
  ];

  const rawRemainingSlots = languageData?.limit?.remainingSlots;
  const remainingSlots = rawRemainingSlots == null ? Infinity : rawRemainingSlots;
  const currentCount = languageData?.limit?.currentCount ?? 0;
  const maxLimit = languageData?.limit?.maxLimit ?? null;
  const hasLimit = maxLimit !== null;
  const canAddMore = languageData?.limit?.canAddMore ?? true;
  const primaryLocale = languageData?.shop?.primary ?? languageData?.limit?.primaryLocale ?? null;
  const selectionProgress = hasLimit
    ? Math.min(((currentCount + selectedLanguages.length) / (maxLimit || 1)) * 100, 100)
    : 0;
  const selectionTone = remainingSlots > 0 && selectedLanguages.length >= remainingSlots ? 'critical' : 'primary';
  const remainingSelectable = !isFinite(remainingSlots)
    ? Infinity
    : Math.max(remainingSlots - selectedLanguages.length, 0);
  const filteredLanguages = getFilteredLanguages();

  return (
    <>
      <Button onClick={() => setShowModal(true)} size="slim">
        {t('languages.manage')}
      </Button>
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={t('languages.modalTitle')}
        primaryAction={{
          content: t('languages.addSelected', { count: selectedLanguages.length }),
          onAction: enableSelectedLanguages,
          disabled: selectedLanguages.length === 0 || loading,
          loading: loading
        }}
        secondaryActions={[
          {
            content: t('languages.sync'),
            onAction: syncLanguages,
            disabled: loading
          },
          {
            content: t('languages.cancel'),
            onAction: () => setShowModal(false)
          }
        ]}
        large
      >
        <Modal.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical">
                <Text variant="bodySm">{error}</Text>
              </Banner>
            )}
            <Banner
              title={t('languages.quotaTitle', { current: currentCount, max: maxLimit })}
              tone={remainingSlots <= 3 ? 'warning' : 'info'}
            >
              <BlockStack gap="100">
                <Text variant="bodySm">
                  {canAddMore
                    ? t('languages.quotaRemaining', { count: remainingSlots })
                    : t('languages.quotaFull')}
                </Text>
                {primaryLocale && (
                  <Text variant="bodySm" tone="subdued">
                    ${t('languages.primary', { label: primaryLocale.label || primaryLocale.value })}
                  </Text>
                )}
              </BlockStack>
            </Banner>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">${t('languages.enabledTitle', { count: languageData.shop.count })}</Text>
                <InlineStack gap="200" wrap>
                  {primaryLocale && (
                    <Badge tone="success">
                      {primaryLocale.label || primaryLocale.value} ()
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
            <InlineStack gap="300">
              <div style={{ flex: 1 }}>
                <TextField
                  label="${t('languages.searchLabel')}"
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="${t('languages.searchPlaceholder')}"
                  clearButton
                  onClearButtonClick={() => setSearchTerm('')}
                />
              </div>
              <Select
                label="${t('languages.regionFilter')}"
                options={regionOptions}
                value={selectedRegion}
                onChange={setSelectedRegion}
              />
            </InlineStack>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd">
                    ${t('languages.availableTitle', { count: filteredLanguages.length })}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    ${t('languages.selectedCount', { selected: selectedLanguages.length, remaining: remainingSlots })}
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
            {selectedLanguages.length > 0 && (
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm">${t('languages.progress')}</Text>
                  <ProgressBar
                    progress={selectionProgress}
                    tone={selectionTone}
                  />
                  <Text variant="bodySm" tone="subdued">
                    ${t('languages.progressDesc', { selected: selectedLanguages.length, remaining: remainingSelectable })}
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
