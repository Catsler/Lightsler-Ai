import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Card,
  Layout,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  Divider,
  Box
} from '@shopify/polaris';
import { createResourceAdapter } from '../utils/resource-adapters';
import { STANDARD_TRANSLATION_MAP } from '../routes/api.resource-detail';

/**
 * 通用资源详情组件 - Linus哲学实现
 * 原则：最多3层缩进，消除条件分支
 * 目标：一个组件处理所有26种资源类型
 */

// 字段渲染器 - 纯函数，无副作用
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

// 徽章组渲染器
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

// 翻译状态卡片
const TranslationCard = ({ translations, currentLanguage }) => {
  const translation = translations[currentLanguage];
  if (!translation) return null;
  
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd">翻译状态 - {currentLanguage}</Text>
        <InlineStack gap="400">
          <Badge tone={translation.status === 'completed' ? 'success' : 'warning'}>
            {translation.status}
          </Badge>
          <Badge tone={translation.syncStatus === 'synced' ? 'success' : 'info'}>
            同步: {translation.syncStatus}
          </Badge>
          <Text variant="bodySm">质量评分: {(translation.qualityScore * 100).toFixed(0)}%</Text>
        </InlineStack>
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

// JSON内容查看器
const JsonViewer = ({ data, collapsed = true }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  
  const jsonString = useMemo(() => {
    return JSON.stringify(data, null, 2);
  }, [data]);
  
  return (
    <Box>
      <Button onClick={() => setIsCollapsed(!isCollapsed)} plain>
        {isCollapsed ? '展开' : '折叠'} JSON ({Object.keys(data).length} 个字段)
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

// 主组件 - 统一处理所有资源类型（支持双语对照）
export function ResourceDetail({ resource, currentLanguage = 'zh-CN', onTranslate, onEdit, onViewHistory, translatableKeys = [] }) {
  // 创建适配器 - 核心：通过配置而非代码处理差异
  const adapter = useMemo(() => {
    return createResourceAdapter(resource.type);
  }, [resource.type]);
  
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
            {isOriginal ? '— 无原始内容 —' : '— 待翻译 —'}
          </Text>
        );
      }
      if (html) return <div dangerouslySetInnerHTML={{ __html: val }} />;
      if (typeof val === 'object') return <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(val, null, 2)}</pre>;
      return <Text variant="bodyMd" tone="subdued">{String(val)}</Text>;
    };
    return (
      <Box paddingBlockEnd="200">
        <Text variant="bodyMd" fontWeight="semibold">{label}</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <Box style={{ padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <Text variant="bodySm" tone="subdued">原文</Text>
            <Box paddingBlockStart="100">{renderValue(original, isHtml, true)}</Box>
          </Box>
          <Box style={{ padding: '8px', backgroundColor: translated ? '#f0f8ff' : '#fff8dc', borderRadius: '4px' }}>
            <Text variant="bodySm" tone="subdued">译文（{currentLanguage}）</Text>
            <Box paddingBlockStart="100">{renderValue(translated, false, false)}</Box>
          </Box>
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
      pushRow('标题', 'title', content.title, translationFields['titleTrans']);
    }

    // 正文（优先 body_html）
    const bodyKey = hasAny(['body_html', 'body', 'description']);
    if (bodyKey) {
      const isHtml = bodyKey === 'body_html';
      const original = isHtml ? content.descriptionHtml : (content.description || content.body);
      pushRow('正文', bodyKey, original, translationFields['descTrans'], isHtml);
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
        pushRow('摘要', summaryKey, content.summary, translationFields['summaryTrans'], isHtml);
      }
    }

    // 资源特有：标签（Filter）
    if (type === 'FILTER' && keysSet.has('label')) {
      pushRow('标签', 'label', content.label, translationFields['labelTrans']);
    }

    // SEO（优先/回退）
    const seoTitleKey = hasAny(['seo.title', 'meta_title']);
    if (seoTitleKey) {
      pushRow('SEO 标题', seoTitleKey, content.seoTitle, translationFields['seoTitleTrans']);
    }
    const seoDescKey = hasAny(['seo.description', 'meta_description']);
    if (seoDescKey) {
      pushRow('SEO 描述', seoDescKey, content.seoDescription, translationFields['seoDescTrans']);
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

    // 扩展：JSON内容（只作为原文查看器保留）
    const jsonViewer = displayConfig.isJSON && fields?.extended?.themeData ? (
      <Box key="json-viewer">
        <Text variant="headingMd">JSON内容（原文）</Text>
        <JsonViewer data={fields.extended.themeData} />
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
        {jsonViewer}
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
    if (!productGid || optionsState.data.length > 0 || optionsState.loading) return;
    setOptionsState({ loading: true, data: [] });
    try {
      const res = await fetch(`/api/product-options?gid=${encodeURIComponent(productGid)}`);
      const json = await res.json();
      setOptionsState({ loading: false, data: json?.data?.options || [] });
    } catch {
      setOptionsState({ loading: false, data: [] });
    }
  }, [productGid, optionsState]);

  const loadMetafields = useCallback(async () => {
    if (!productGid || metafieldsState.data.length > 0 || metafieldsState.loading) return;
    setMetafieldsState({ loading: true, data: [] });
    try {
      const res = await fetch(`/api/product-metafields?gid=${encodeURIComponent(productGid)}`);
      const json = await res.json();
      setMetafieldsState({ loading: false, data: json?.data?.metafields || [] });
    } catch {
      setMetafieldsState({ loading: false, data: [] });
    }
  }, [productGid, metafieldsState]);
  
  // 渲染元数据
  const renderMetadata = () => {
    const { metadata } = resource;
    
    return (
      <Card>
        <BlockStack gap="200">
          <Text variant="headingMd">元数据</Text>
          <InlineStack gap="400">
            <Text variant="bodySm">最后修改: {new Date(metadata.lastModified).toLocaleString()}</Text>
            <Text variant="bodySm">版本哈希: {metadata.contentHash?.slice(0, 8)}</Text>
            <Text variant="bodySm">风险评分: {(metadata.riskScore * 100).toFixed(0)}%</Text>
          </InlineStack>
          <InlineStack gap="200">
            <Badge tone={metadata.canEdit ? 'success' : 'critical'}>
              {metadata.canEdit ? '可编辑' : '锁定'}
            </Badge>
            <Badge tone={metadata.canTranslate ? 'success' : 'warning'}>
              {metadata.canTranslate ? '可翻译' : '暂停'}
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
          {/* 头部信息 */}
          <Card>
            <InlineStack align="space-between">
              <InlineStack gap="200" align="center">
                <Text variant="headingLg">{displayConfig.icon} {formattedResource.displayTitle}</Text>
                <Badge>{displayConfig.categoryLabel}</Badge>
              </InlineStack>
              <BadgeGroup badges={formattedResource.badges} />
            </InlineStack>
          </Card>
          
          {/* 主要内容（双语对照） */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd">资源内容</Text>
                <InlineStack gap="200">
                  <Button primary onClick={onTranslate} disabled={!resource.metadata?.canTranslate}>
                    翻译此资源
                  </Button>
                  <Button onClick={onEdit} disabled={!resource.metadata?.canEdit}>
                    编辑内容
                  </Button>
                  <Button onClick={onViewHistory} plain>
                    查看历史
                  </Button>
                </InlineStack>
              </InlineStack>
              <Divider />
              {renderMainContent()}
            </BlockStack>
          </Card>

          {/* 产品扩展（懒加载）放到资源内容下方 */}
          {isProduct && (
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">产品扩展</Text>
                <InlineStack gap="200">
                  <Button
                    onClick={() => { setShowOptions(v => !v); if (!showOptions) loadOptions(); }}
                    size="slim"
                  >
                    {showOptions ? '收起选项' : '展开选项'}
                  </Button>
                  <Button
                    onClick={() => { setShowMetafields(v => !v); if (!showMetafields) loadMetafields(); }}
                    size="slim"
                  >
                    {showMetafields ? '收起Metafields' : '展开Metafields'}
                  </Button>
                </InlineStack>

                {showOptions && (
                  <BlockStack gap="150">
                    {optionsState.loading ? (
                      <Text variant="bodySm" tone="subdued">加载选项中...</Text>
                    ) : (
                      optionsState.data.length > 0 ? (
                        optionsState.data.map((opt, idx) => (
                          <BilingualRow
                            key={`opt-${idx}`}
                            label={`选项: ${opt.name}`}
                            original={Array.isArray(opt.values) ? opt.values.join(', ') : ''}
                            translated={null}
                          />
                        ))
                      ) : (
                        <Text variant="bodySm" tone="subdued">无选项</Text>
                      )
                    )}
                  </BlockStack>
                )}

                {showMetafields && (
                  <BlockStack gap="150">
                    {metafieldsState.loading ? (
                      <Text variant="bodySm" tone="subdued">加载Metafields中...</Text>
                    ) : (
                      metafieldsState.data.length > 0 ? (
                        metafieldsState.data.map((mf, idx) => (
                          <BilingualRow
                            key={`mf-${idx}`}
                            label={`${mf.namespace}.${mf.key}`}
                            original={mf.value}
                            translated={null}
                          />
                        ))
                      ) : (
                        <Text variant="bodySm" tone="subdued">无Metafields</Text>
                      )
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          )}

          {/* 翻译信息（若已双语展示，可省略；保留在无译文时的回退） */}
          {(!resource.translations || !resource.translations[currentLanguage]) && (
            <TranslationCard 
              translations={resource.translations || {}} 
              currentLanguage={currentLanguage}
            />
          )}

          {/* 元数据放置在页面底部 */}
          {renderMetadata()}
        </BlockStack>
      </Layout.Section>
    </Layout>
  );
}

// 导出供其他组件使用
export default ResourceDetail;
