import { useState, useMemo } from 'react';
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
export function ResourceDetail({ resource, currentLanguage = 'zh-CN' }) {
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

    // 使用联合字段集策略：显示所有可能的字段（KISS原则）
    const content = fields?.content || {};
    // 联合集 = 映射表字段 + 实际存在的字段
    const mappedFields = Object.keys(STANDARD_TRANSLATION_MAP);
    const existingFields = Object.keys(content);
    const standardKeys = [...new Set([...mappedFields, ...existingFields])].filter(k => 
      translatableFields.includes(k) || mappedFields.includes(k) || k === 'descriptionHtml'
    );

    const rows = [];

    // 标准字段双语
    for (const key of standardKeys) {
      const original = content[key];
      const mappedKey = STANDARD_TRANSLATION_MAP[key] || `${key}Trans`;
      const translated = translationFields[mappedKey];
      rows.push(
        <BilingualRow
          key={key}
          label={key}
          original={original}
          translated={translated}
          isHtml={key.includes('Html')}
        />
      );
    }

    // 动态字段双语（Theme等）
    if (displayConfig.isDynamic && fields?.extended?.dynamicFields) {
      const dynamicEntries = Object.entries(fields.extended.dynamicFields);
      for (const [key, value] of dynamicEntries) {
        const translated = translationFields[key]; // 动态字段在 translationFields 中同名存储
        rows.push(
          <BilingualRow
            key={`dyn-${key}`}
            label={key}
            original={value}
            translated={translated}
          />
        );
      }
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
              <Text variant="headingMd">资源内容</Text>
              <Divider />
              {renderMainContent()}
            </BlockStack>
          </Card>
          
          {/* 翻译信息（若已双语展示，可省略；保留在无译文时的回退） */}
          {(!resource.translations || !resource.translations[currentLanguage]) && (
            <TranslationCard 
              translations={resource.translations || {}} 
              currentLanguage={currentLanguage}
            />
          )}
        </BlockStack>
      </Layout.Section>
      
      <Layout.Section variant="oneThird">
        <BlockStack gap="400">
          {/* 元数据 */}
          {renderMetadata()}
          
          {/* 操作按钮 */}
          <Card>
            <BlockStack gap="200">
              <Button fullWidth primary disabled={!resource.metadata.canTranslate}>
                翻译此资源
              </Button>
              <Button fullWidth disabled={!resource.metadata.canEdit}>
                编辑内容
              </Button>
              <Button fullWidth plain>
                查看历史
              </Button>
            </BlockStack>
          </Card>
        </BlockStack>
      </Layout.Section>
    </Layout>
  );
}

// 导出供其他组件使用
export default ResourceDetail;
