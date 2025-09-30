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
  Box,
  Checkbox
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
            {isOriginal ? '— 无原始内容 —' : '— 待翻译 —'}
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
            <Text variant="bodySm" tone="subdued">原文</Text>
            <Box paddingBlockStart="100">{renderValue(original, isHtml, true)}</Box>
          </Box>
          <Box style={{ padding: '8px', backgroundColor: translated ? '#f0f8ff' : '#fff8dc', borderRadius: '4px', minWidth: 0 }}>
            <Text variant="bodySm" tone="subdued">译文（{currentLanguage}）</Text>
            <Box paddingBlockStart="100">{renderValue(translated, isHtml, false)}</Box>
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
              <Text variant="headingMd">Theme字段翻译状态</Text>
              <Checkbox
                label="仅显示差异"
                checked={showOnlyDifferences}
                onChange={setShowOnlyDifferences}
              />
            </InlineStack>

            {/* 高风险路径提示 */}
            {isHighRiskTheme && (
              <Box padding="200" background="bg-fill-caution">
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold">⚠️ 高影响区域</Text>
                  <Text variant="bodySm" tone="subdued">
                    此资源属于关键路径（如全局Header、核心模板等），翻译变更可能影响整个网站外观。建议发布前仔细预览。
                  </Text>
                </BlockStack>
              </Box>
            )}

            {/* 统计信息 */}
            <InlineStack gap="400">
              <InlineStack gap="100">
                <Text variant="bodySm">总字段:</Text>
                <Badge>{status.total}</Badge>
              </InlineStack>
              <InlineStack gap="100">
                <Text variant="bodySm">已翻译:</Text>
                <Badge tone="success">{status.translated.length}</Badge>
              </InlineStack>
              <InlineStack gap="100">
                <Text variant="bodySm">未翻译:</Text>
                <Badge tone="warning">{status.untranslated.length}</Badge>
              </InlineStack>
              {status.added.length > 0 && (
                <InlineStack gap="100">
                  <Text variant="bodySm">新增:</Text>
                  <Badge tone="info">{status.added.length}</Badge>
                </InlineStack>
              )}
            </InlineStack>

            {/* 字段列表 */}
            <BlockStack gap="200">
              {fieldsToShow.map(key => {
                const original = originalFields[key];
                const translated = translationFields[key];
                const isTranslated = status.translated.includes(key);
                const isUntranslated = status.untranslated.includes(key);

                // 状态图标
                const statusIcon = isTranslated ? '🟢' : (isUntranslated ? '⚪' : '🔵');
                const statusText = isTranslated ? '已翻译' : (isUntranslated ? '未翻译' : '新增');

                return (
                  <Box key={key} padding="200" background="bg-surface-secondary" borderRadius="100">
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold">{key}</Text>
                        <Text variant="bodyXs" tone="subdued">{statusIcon} {statusText}</Text>
                      </InlineStack>

                      {/* 原文 */}
                      <Text variant="bodyXs" tone="subdued">原文:</Text>
                      <Text variant="bodyXs" truncate>{
                        typeof original === 'string' ? original : JSON.stringify(original)
                      }</Text>

                      {/* 译文 */}
                      {isTranslated && (
                        <>
                          <Text variant="bodyXs" tone="subdued">译文:</Text>
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
        {/* Theme JSON差异展示优先于原始JSON查看器 */}
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
    if (!productGid) return;
    setOptionsState({ loading: true, data: [] });
    try {
      const res = await fetch(`/api/product-options?gid=${encodeURIComponent(productGid)}&lang=${encodeURIComponent(currentLanguage)}`);
      const json = await res.json();
      setOptionsState({ loading: false, data: json?.data?.options || [] });
    } catch {
      setOptionsState({ loading: false, data: [] });
    }
  }, [productGid, currentLanguage]);

  const loadMetafields = useCallback(async () => {
    if (!productGid) return;
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
  }, [productGid, currentLanguage]);

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
                    重新翻译
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
                    onClick={() => setShowOptions(v => !v)}
                    size="slim"
                  >
                    {showOptions ? '收起选项' : '展开选项'}
                  </Button>
                  <Button
                    onClick={() => setShowMetafields(v => !v)}
                    size="slim"
                  >
                    {showMetafields ? '收起Metafields' : '展开Metafields'}
                  </Button>
                </InlineStack>

                {showOptions && (
                  <BlockStack gap="150">
                    {optionsState.loading ? (
                      <Text variant="bodySm" tone="subdued">加载选项中...</Text>
                    ) : optionsState.data.length > 0 ? (
                      optionsState.data.map((opt, idx) => {
                        const originalValues = Array.isArray(opt.values)
                          ? opt.values.join(', ')
                          : (typeof opt.values === 'string' ? opt.values : '');
                        const translatedValues = Array.isArray(opt.translatedValues)
                          ? opt.translatedValues.join(', ')
                          : (typeof opt.translatedValues === 'string' ? opt.translatedValues : null);

                        const optionLabel = opt.translatedName
                          ? `选项: ${opt.name} / ${opt.translatedName}`
                          : `选项: ${opt.name}`;

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
                      <Text variant="bodySm" tone="subdued">无选项</Text>
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
                            translated={mf.translatedValue || null}
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
