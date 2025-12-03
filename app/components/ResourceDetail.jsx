import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getResourceDisplayTitle, getResourceDisplayDescription } from '../utils/resource-display-helpers.js';
import {
  Card,
  Layout,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  Divider,
  Box,
  Checkbox,
  Banner
} from '@shopify/polaris';
import { createResourceAdapter } from '../utils/resource-adapters';
import { STANDARD_TRANSLATION_MAP } from '../routes/api.resource-detail';
import { getSyncErrorMessage } from '../utils/sync-error-helper.js';

/**
 * Generic resource detail component (supports all resource types).
 * Keep nesting shallow and avoid branching where possible.
 */

// Field renderer - pure function
const FieldRenderer = ({ label, value, isHtml = false }) => {
  if (!value) return null;
  
  return (
    <Box paddingBlockEnd="200">
      <Text variant="bodyMd" fontWeight="semibold">{label}</Text>
      {isHtml ? (
        <div dangerouslySetInnerHTML={{ __html: value }} />
      ) : (
        <Text variant="bodyMd" tone="subdued">{value}</Text>
      )}
    </Box>
  );
};

// Badge group renderer
const BadgeGroup = ({ badges }) => {
  if (!badges || badges.length === 0) return null;
  
  return (
    <InlineStack gap="200">
      {badges.map((badge, index) => (
        <Badge key={index} tone={badge.tone}>
          {badge.label}
        </Badge>
      ))}
    </InlineStack>
  );
};

// Translation status card
const TranslationCard = ({ translations, currentLanguage, t }) => {
  if (!currentLanguage) return null;

  const translation = translations[currentLanguage];
  if (!translation) return null;
  
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd">{t('resources.detail.title', { language: currentLanguage })}</Text>
        <InlineStack gap="400">
          <Badge tone={translation.status === 'completed' ? 'success' : 'warning'}>
            {translation.status}
          </Badge>
          <Badge tone={
            translation.syncStatus === 'synced' ? 'success' :
            translation.syncStatus === 'partial' ? 'warning' :
            translation.syncStatus === 'failed' ? 'critical' :
            'info'
          }>
            {t('resources.detail.sync', { status: translation.syncStatus })}
          </Badge>
          <Text variant="bodySm">{t('resources.detail.quality', { score: (translation.qualityScore * 100).toFixed(0) })}%</Text>
        </InlineStack>
        {(translation.syncStatus === 'partial' || translation.syncStatus === 'failed') && translation.syncError && (
          <Box paddingBlockStart="200">
            <Text variant="bodySm" tone={translation.syncStatus === 'failed' ? 'critical' : 'caution'}>
              {getSyncErrorMessage(translation.syncError)}
            </Text>
          </Box>
        )}
        <Divider />
        <BlockStack gap="200">
          {Object.entries(translation.fields).map(([key, value]) => (
            <FieldRenderer key={key} label={key} value={value} />
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
};

// JSON viewer
const JsonViewer = ({ data, collapsed = true, t }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  
  const jsonString = useMemo(() => {
    return JSON.stringify(data, null, 2);
  }, [data]);
  
  return (
    <Box>
      <Button onClick={() => setIsCollapsed(!isCollapsed)} plain>
        {isCollapsed ? t('resources.actions.expand') : t('resources.actions.collapse')} {t('resources.detail.jsonOriginal', { count: Object.keys(data).length })}
      </Button>
      {!isCollapsed && (
        <Box paddingBlockStart="200">
          <pre style={{ 
            backgroundColor: '#f6f6f7', 
            padding: '12px', 
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '400px'
          }}>
            {jsonString}
          </pre>
        </Box>
      )}
    </Box>
  );
};

// Main component - handles all resource types with bilingual view\n*** End Patch
export function ResourceDetail({
  resource,
  currentLanguage,
  hasNoSecondaryLanguages = false,
  onTranslate,
  onEdit,
  onViewHistory,
  translatableKeys = [],
  billingInfo = {}
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  // 创建适配器 - 核心：通过配置而非代码处理差异
  const adapter = useMemo(() => {
    return createResourceAdapter(resource.type);
  }, [resource.type]);

  const displayTitle = getResourceDisplayTitle(resource, locale, t);
  const displayDescription = getResourceDisplayDescription(resource, locale, t);

  // Theme JSON差异展示状态
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);

  // 分析JSON字段的翻译状态（轻量版）
  const analyzeThemeFieldsStatus = useMemo(() => {
    const translation = resource?.translations?.[currentLanguage] || null;
    const translationFields = translation?.fields || {};
    const originalFields = resource?.fields?.extended?.dynamicFields || {};

    const originalKeys = new Set(Object.keys(originalFields));
    const translatedKeys = new Set(Object.keys(translationFields));

    return {
      translated: [...translatedKeys],
      untranslated: [...originalKeys].filter(k => !translatedKeys.has(k)),
      added: [...translatedKeys].filter(k => !originalKeys.has(k)),
      total: originalKeys.size
    };
  }, [resource, currentLanguage]);

  // 检查是否是高风险Theme路径
  const isHighRiskTheme = useMemo(() => {
    const resourceId = resource?.fields?.standard?.resourceId || '';
    const HIGH_RISK_PATTERNS = [
      /^sections\/(header|footer|announcement)/i,  // 全站可见区块
      /^templates\/(index|product|collection)/i,   // 核心页面模板
      /^config\/settings_data/i,                   // 全局设置
      /^locales\//i                               // 语言文件本身
    ];
    return HIGH_RISK_PATTERNS.some(pattern => pattern.test(resourceId));
  }, [resource]);

  // 获取显示配置
  const displayConfig = adapter.getDisplayConfig();
  const formattedResource = adapter.formatForDisplay(resource);
  
  // 使用从适配器导入的统一映射表（KISS原则：单一事实来源）

  // 计算可翻译字段列表
  const translatableFields = useMemo(() => {
    const extended = resource?.fields?.extended || null;
    try {
      return adapter.getTranslatableFields(extended) || [];
    } catch (e) {
      return [];
    }
  }, [adapter, resource?.fields?.extended]);

  // 渲染双语对照的字段行
  const BilingualRow = ({ label, original, translated, isHtml = false }) => {
    // 不再过滤null值，显示所有字段
    const renderValue = (val, html, isOriginal = false) => {
      if (val == null || val === '') {
        return (
          <Text variant="bodySm" tone="subdued" fontStyle="italic">
            {isOriginal ? t('resources.detail.noOriginal') : t('resources.detail.toTranslate')}
          </Text>
        );
      }
      if (html) {
        return (
          <div className="resource-html-content" dangerouslySetInnerHTML={{ __html: val }} />
        );
      }
      if (typeof val === 'object') return <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(val, null, 2)}</pre>;
      return <Text variant="bodyMd" tone="subdued">{String(val)}</Text>;
    };
    return (
      <Box paddingBlockEnd="200">
        <Text variant="bodyMd" fontWeight="semibold">{label}</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <Box style={{ padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px', minWidth: 0 }}>
            <Text variant="bodySm" tone="subdued">{t('resources.detail.source')}</Text>
            <Box paddingBlockStart="100">{renderValue(original, isHtml, true)}</Box>
          </Box>
          {!hasNoSecondaryLanguages && currentLanguage && (
            <Box style={{ padding: '8px', backgroundColor: translated ? '#f0f8ff' : '#fff8dc', borderRadius: '4px', minWidth: 0 }}>
              <Text variant="bodySm" tone="subdued">{t('resources.detail.target', { language: currentLanguage })}</Text>
              <Box paddingBlockStart="100">{renderValue(translated, isHtml, false)}</Box>
            </Box>
          )}
        </div>
      </Box>
    );
  };

  // 渲染主要内容区域（优先双语对照）
  const renderMainContent = () => {
    const { fields } = resource;
    const translation = resource?.translations?.[currentLanguage] || null;
    const translationFields = translation?.fields || {};
    const content = fields?.content || {};
    const rows = [];
    const keysSet = new Set(translatableKeys || []);
    const used = new Set();
    const type = String(resource?.type || '').toUpperCase();

    const hasAny = (candidates) => candidates.find(k => keysSet.has(k));
    const pushRow = (label, key, original, translated, isHtml = false) => {
      rows.push(<BilingualRow key={key} label={label} original={original} translated={translated} isHtml={isHtml} />);
      if (key) used.add(key);
    };

    // 标题
    if (keysSet.has('title')) {
      pushRow(t('resources.detail.titleLabel'), 'title', content.title, translationFields['titleTrans']);
    }

    // 正文（优先 body_html）
    const bodyKey = hasAny(['body_html', 'body', 'description']);
    if (bodyKey) {
      const isHtml = bodyKey === 'body_html';
      const original = isHtml ? content.descriptionHtml : (content.description || content.body);
      pushRow(t('resources.detail.body'), bodyKey, original, translationFields['descTrans'], isHtml);
    }

    // Handle
    if (keysSet.has('handle')) {
      pushRow('Handle', 'handle', content.handle, translationFields['handleTrans']);
    }

    // 资源特有：摘要（Article）
    if (type === 'ARTICLE') {
      const summaryKey = hasAny(['summary_html', 'excerpt_html', 'summary', 'excerpt']);
      if (summaryKey) {
        const isHtml = summaryKey.endsWith('html');
        pushRow(t('resources.detail.summary'), summaryKey, content.summary, translationFields['summaryTrans'], isHtml);
      }
    }

    // 资源特有：标签（Filter）
    if (type === 'FILTER' && keysSet.has('label')) {
      pushRow(t('resources.detail.label'), 'label', content.label, translationFields['labelTrans']);
    }

    // SEO（优先/回退）
    const seoTitleKey = hasAny(['seo.title', 'meta_title']);
    if (seoTitleKey) {
      pushRow(t('resources.detail.seoTitle'), seoTitleKey, content.seoTitle, translationFields['seoTitleTrans']);
    }
    const seoDescKey = hasAny(['seo.description', 'meta_description']);
    if (seoDescKey) {
      pushRow(t('resources.detail.seoDesc'), seoDescKey, content.seoDescription, translationFields['seoDescTrans']);
    }

    // 动态字段双语（Theme等）
    if (displayConfig.isDynamic && fields?.extended?.dynamicFields) {
      const dynamicEntries = Object.entries(fields.extended.dynamicFields);
      for (const [key, value] of dynamicEntries) {
        const translated = translationFields[key]; // 动态字段在 translationFields 中同名存储
        pushRow(key, `dyn-${key}`, value, translated);
      }
    }

    // 其他未知翻译字段的回退展示（例如仅有 title/value 的模块）
    const skipStd = new Set(['title','body','body_html','description','handle','summary','summary_html','excerpt','excerpt_html','label','seo.title','seo.description','meta_title','meta_description']);
    for (const key of keysSet) {
      if (used.has(key) || skipStd.has(key)) continue;
      const original = content[key] ?? fields?.extended?.dynamicFields?.[key] ?? null;
      const translated = translationFields[key] ?? translationFields[`$${key}`];
      pushRow(key, `extra-${key}`, original, translated);
    }

    // Theme JSON差异展示（轻量版）
    const renderThemeJsonDiff = () => {
      if (!displayConfig.isDynamic || !fields?.extended?.dynamicFields) return null;

      const translation = resource?.translations?.[currentLanguage] || null;
      const translationFields = translation?.fields || {};
      const originalFields = fields.extended.dynamicFields;
      const status = analyzeThemeFieldsStatus;

      // 根据差异模式过滤字段
      const fieldsToShow = showOnlyDifferences
        ? Object.keys(originalFields).filter(key => status.translated.includes(key) || status.untranslated.includes(key))
        : Object.keys(originalFields);

      return (
        <Box key="theme-json-diff">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingMd">{t('resources.detail.themeStatus')}</Text>
              <Checkbox
                label={t('resources.detail.showDiffOnly')}
                checked={showOnlyDifferences}
                onChange={setShowOnlyDifferences}
              />
            </InlineStack>

            {}
            {isHighRiskTheme && (
              <Box padding="200" background="bg-fill-caution">
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold">{t('resources.detail.highImpact')}</Text>
                  <Text variant="bodySm" tone="subdued">
                    {t('resources.detail.highImpactDesc')}
                  </Text>
                </BlockStack>
              </Box>
            )}

            {}
            <InlineStack gap="400">
              <InlineStack gap="100">
                <Text variant="bodySm">{t('resources.detail.totalFields')}</Text>
                <Badge>{status.total}</Badge>
              </InlineStack>
              <InlineStack gap="100">
                <Text variant="bodySm">{t('resources.detail.translatedLabel')}</Text>
                <Badge tone="success">{status.translated.length}</Badge>
              </InlineStack>
              <InlineStack gap="100">
                <Text variant="bodySm">{t('resources.detail.untranslatedLabel')}</Text>
                <Badge tone="warning">{status.untranslated.length}</Badge>
              </InlineStack>
              {status.added.length > 0 && (
                <InlineStack gap="100">
                  <Text variant="bodySm">{t('resources.detail.addedLabel')}</Text>
                  <Badge tone="info">{status.added.length}</Badge>
                </InlineStack>
              )}
            </InlineStack>

            {}
            <BlockStack gap="200">
              {fieldsToShow.map(key => {
                const original = originalFields[key];
                const translated = translationFields[key];
                const isTranslated = status.translated.includes(key);
                const isUntranslated = status.untranslated.includes(key);

                // 状态图标
                const statusIcon = isTranslated ? '🟢' : (isUntranslated ? '⚪' : '🔵');
                const statusText = isTranslated
                  ? t('resources.detail.statusTranslated')
                  : (isUntranslated ? t('resources.detail.statusUntranslated') : t('resources.detail.statusAdded'));

                return (
                  <Box key={key} padding="200" background="bg-surface-secondary" borderRadius="100">
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold">{key}</Text>
                        <Text variant="bodyXs" tone="subdued">{statusIcon} {statusText}</Text>
                      </InlineStack>

                      {}
                      <Text variant="bodyXs" tone="subdued">{t('resources.detail.originalLabel')}</Text>
                      <Text variant="bodyXs" truncate>{
                        typeof original === 'string' ? original : JSON.stringify(original)
                      }</Text>

                      {}
                      {isTranslated && (
                        <>
                          <Text variant="bodyXs" tone="subdued">{t('resources.detail.translatedLabel')}</Text>
                          <Text variant="bodyXs" truncate>{
                            typeof translated === 'string' ? translated : JSON.stringify(translated)
                          }</Text>
                        </>
                      )}
                    </BlockStack>
                  </Box>
                );
              })}
            </BlockStack>
          </BlockStack>
        </Box>
      );
    };

    // 扩展：JSON内容（原有的查看器保留）
    const jsonViewer = displayConfig.isJSON && fields?.extended?.themeData ? (
      <Box key="json-viewer">
        <Text variant="headingMd">{t('resources.detail.jsonOriginalTitle')}</Text>
        <JsonViewer data={fields.extended.themeData} t={t} />
      </Box>
    ) : null;

    return (
      <BlockStack gap="300">
        {rows.length > 0 ? rows : (
          // 回退：若没有可双语的字段，展示原有的单语渲染
          <>
            {fields.content && Object.entries(fields.content).map(([key, value]) => (
              <FieldRenderer key={key} label={key} value={value} isHtml={key.includes('Html')} />
            ))}
          </>
        )}
        {}
        {displayConfig.isDynamic ? renderThemeJsonDiff() : jsonViewer}
      </BlockStack>
    );
  };

  // 产品专属：选项与 Metafields 懒加载（不阻塞首屏）
  const isProduct = String(resource?.type || '').toUpperCase() === 'PRODUCT';
  const productGid = resource?.fields?.standard?.gid;
  const [showOptions, setShowOptions] = useState(false);
  const [showMetafields, setShowMetafields] = useState(false);
  const [optionsState, setOptionsState] = useState({ loading: false, data: [] });
  const [metafieldsState, setMetafieldsState] = useState({ loading: false, data: [] });

  const loadOptions = useCallback(async () => {
    if (!productGid || !currentLanguage || hasNoSecondaryLanguages) return;
    setOptionsState({ loading: true, data: [] });
    try {
      const res = await fetch(`/api/product-options?gid=${encodeURIComponent(productGid)}&lang=${encodeURIComponent(currentLanguage)}`);
      const json = await res.json();
      setOptionsState({ loading: false, data: json?.data?.options || [] });
    } catch {
      setOptionsState({ loading: false, data: [] });
    }
  }, [productGid, currentLanguage, hasNoSecondaryLanguages]);

  const loadMetafields = useCallback(async () => {
    if (!productGid || !currentLanguage || hasNoSecondaryLanguages) return;
    setMetafieldsState({ loading: true, data: [] });
    try {
      const res = await fetch(`/api/product-metafields?gid=${encodeURIComponent(productGid)}&lang=${encodeURIComponent(currentLanguage)}`);
      const json = await res.json();
      const payload = json?.data || {};
      setMetafieldsState({
        loading: false,
        data: Array.isArray(payload?.metafields) ? payload.metafields : []
      });
    } catch {
      setMetafieldsState({ loading: false, data: [] });
    }
  }, [productGid, currentLanguage, hasNoSecondaryLanguages]);

  useEffect(() => {
    if (showOptions) {
      loadOptions();
    }
  }, [showOptions, loadOptions]);

  useEffect(() => {
    if (showMetafields) {
      loadMetafields();
    }
  }, [showMetafields, loadMetafields]);
  
  // 渲染元数据
  const renderMetadata = () => {
    const { metadata } = resource;
    
    return (
      <Card>
        <BlockStack gap="200">
          <Text variant="headingMd">{t('resources.detail.metadataTitle')}</Text>
          <InlineStack gap="400">
            <Text variant="bodySm">{t('resources.detail.metadataLastModified')}: {new Date(metadata.lastModified).toLocaleString()}</Text>
            <Text variant="bodySm">{t('resources.detail.metadataHash')}: {metadata.contentHash?.slice(0, 8)}</Text>
            <Text variant="bodySm">{t('resources.detail.metadataRisk')}: {(metadata.riskScore * 100).toFixed(0)}%</Text>
          </InlineStack>
          <InlineStack gap="200">
            <Badge tone={metadata.canEdit ? 'success' : 'critical'}>
              {metadata.canEdit ? t('resources.detail.metadataEditable') : t('resources.detail.metadataLocked')}
            </Badge>
            <Badge tone={metadata.canTranslate ? 'success' : 'warning'}>
              {metadata.canTranslate ? t('resources.detail.metadataTranslatable') : t('resources.detail.metadataPaused')}
            </Badge>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  };
  
  // 主渲染逻辑 - 简洁清晰，无嵌套
  return (
    <Layout>
      <Layout.Section>
        <BlockStack gap="400">
          {}
          {hasNoSecondaryLanguages && (
          <Banner tone="warning">
            <p>{t('resources.detail.noSecondaryLanguages')}</p>
          </Banner>
          )}

          {}
          <Card>
            <InlineStack align="space-between">
              <InlineStack gap="200" align="center">
                <Text variant="headingLg">{displayConfig.icon} {displayTitle}</Text>
                <Badge>{displayConfig.categoryLabel}</Badge>
              </InlineStack>
              <BadgeGroup badges={formattedResource.badges} />
            </InlineStack>
          </Card>
          
          {}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd">{t('resources.detail.contentTitle')}</Text>
                <InlineStack gap="200">
                  <Button
                    primary
                    onClick={onTranslate}
                    disabled={
                      !resource.metadata?.canTranslate ||
                      hasNoSecondaryLanguages ||
                      (billingInfo?.remainingCredits ?? 1) <= 0 ||
                      ((billingInfo?.planLimit ?? Infinity) <= (billingInfo?.planUsed ?? 0))
                    }
                  >
                    {t('resources.detail.retranslate')}
                  </Button>
                  <Button onClick={onEdit} disabled={!resource.metadata?.canEdit}>
                    {t('resources.detail.editContent')}
                  </Button>
                  <Button onClick={onViewHistory} plain>
                    {t('resources.detail.viewHistory')}
                  </Button>
                </InlineStack>
              </InlineStack>
              <Divider />
              {renderMainContent()}
            </BlockStack>
          </Card>

          {}
          {isProduct && (
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">{t('resources.detail.productExtensions')}</Text>
                <InlineStack gap="200">
                  <Button
                    onClick={() => setShowOptions(v => !v)}
                    size="slim"
                  >
                    {showOptions ? t('resources.detail.collapseOptions') : t('resources.detail.expandOptions')}
                  </Button>
                  <Button
                    onClick={() => setShowMetafields(v => !v)}
                    size="slim"
                  >
                    {showMetafields ? t('resources.detail.collapseMetafields') : t('resources.detail.expandMetafields')}
                  </Button>
                </InlineStack>

                {showOptions && (
                  <BlockStack gap="300">
                    {}
                    <Banner tone="info">
                      <p><strong>{t('resources.detail.optionsNoteTitle')}</strong></p>
                      <p>{t('resources.detail.optionsNoteBody1')}</p>
                      <p>{t('resources.detail.optionsNoteBody2')}</p>
                      <p>{t('resources.detail.optionsNoteBody3')}</p>
                    </Banner>

                    {optionsState.loading ? (
                      <Text variant="bodySm" tone="subdued">{t('resources.detail.loadingOptions')}</Text>
                    ) : optionsState.data.length > 0 ? (
                      optionsState.data.map((opt, idx) => {
                        // 工具函数：提取对象/字符串的实际值
                        const extractValue = (item) => {
                          if (item && typeof item === 'object') {
                            return item.text ?? item.value ?? item.original ?? '';
                          }
                          return item ?? '';
                        };

                        const originalValues = Array.isArray(opt.values)
                          ? opt.values.join(', ')
                          : (typeof opt.values === 'string' ? opt.values : '');
                        const translatedValues = Array.isArray(opt.translatedValues)
                          ? opt.translatedValues.map(extractValue).filter(Boolean).join(', ')
                          : (typeof opt.translatedValues === 'string' ? opt.translatedValues : null);

                        const optionLabel = opt.translatedName
                          ? t('resources.detail.optionLabelWithTranslation', { name: opt.name, translatedName: opt.translatedName })
                          : t('resources.detail.optionLabel', { name: opt.name });

                        return (
                          <BilingualRow
                            key={`opt-${idx}`}
                            label={optionLabel}
                            original={originalValues}
                            translated={translatedValues}
                          />
                        );
                      })
                    ) : (
                      <Text variant="bodySm" tone="subdued">{t('resources.detail.noOptions')}</Text>
                    )}
                  </BlockStack>
                )}

                {showMetafields && (
                  <BlockStack gap="150">
                    {metafieldsState.loading ? (
                      <Text variant="bodySm" tone="subdued">{t('resources.detail.loadingMetafields')}</Text>
                    ) : (
                      metafieldsState.data.length > 0 ? (
                        metafieldsState.data.map((mf, idx) => (
                          <BilingualRow
                            key={`mf-${idx}`}
                            label={`${mf.namespace}.${mf.key}`}
                            original={mf.value}
                            translated={mf.translatedValue || null}
                          />
                        ))
                      ) : (
                        <Text variant="bodySm" tone="subdued">{t('resources.detail.noMetafields')}</Text>
                      )
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          )}

          {}
          {!hasNoSecondaryLanguages && currentLanguage &&
           (!resource.translations || !resource.translations[currentLanguage]) && (
            <TranslationCard
              translations={resource.translations || {}}
              currentLanguage={currentLanguage}
              t={t}
            />
          )}

          {}
          {renderMetadata()}
        </BlockStack>
      </Layout.Section>
    </Layout>
  );
}

// 导出供其他组件使用
export default ResourceDetail;
