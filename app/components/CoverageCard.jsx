import { useState } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  Spinner,
  Collapsible,
  Link
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";

export function CoverageCard({ data, onRefresh, isRefreshing = false }) {
  const [expandedFields, setExpandedFields] = useState(false);

  if (!data) {
    return null;
  }

  const { counts, percentages, fields = [], retriableKeys = [], metadata } = data;

  // 筛选问题字段（STALE/MISSING/LOW_QUALITY/UNSYNCED）
  const problemFields = fields.filter(field =>
    ['STALE', 'MISSING', 'LOW_QUALITY', 'UNSYNCED'].includes(field.status)
  );

  // 默认显示前 10 个
  const visibleFields = expandedFields ? problemFields : problemFields.slice(0, 10);
  const hasMoreFields = problemFields.length > 10;

  // 状态标签的 tone 映射
  const getStatusTone = (status) => {
    switch (status) {
      case 'UP_TO_DATE': return 'success';
      case 'STALE': return 'warning';
      case 'MISSING': return 'critical';
      case 'LOW_QUALITY': return 'attention';
      case 'UNSYNCED': return 'info';
      default: return 'neutral';
    }
  };

  // 状态标签的文案映射
  const getStatusLabel = (status) => {
    switch (status) {
      case 'UP_TO_DATE': return '已更新';
      case 'STALE': return '需重译';
      case 'MISSING': return '缺失';
      case 'LOW_QUALITY': return '质量低';
      case 'UNSYNCED': return '未同步';
      default: return status;
    }
  };

  // 是否显示警告（stale 比例超过 10%）
  const showStaleWarning = percentages.stale > 10;

  return (
    <Card>
      <BlockStack gap="400">
        {/* 标题栏 */}
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h2">
            翻译覆盖率
          </Text>
          <Button
            onClick={onRefresh}
            disabled={isRefreshing}
            icon={RefreshIcon}
            size="slim"
          >
            {isRefreshing ? <Spinner size="small" /> : '刷新'}
          </Button>
        </InlineStack>

        {/* 概览统计 */}
        <BlockStack gap="200">
          <Text variant="bodyMd" tone="subdued">
            覆盖率概览
          </Text>

          <InlineStack gap="400" wrap>
            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">总计:</Text>
              <Text variant="bodyMd">{counts.total} 个字段</Text>
            </InlineStack>

            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">已更新:</Text>
              <Text variant="bodyMd" tone="success">
                {counts.upToDate} ({percentages.coverage}%)
              </Text>
            </InlineStack>

            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">需重译:</Text>
              <Text variant="bodyMd" tone="warning">
                {counts.stale} ({percentages.stale}%)
              </Text>
            </InlineStack>

            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">缺失:</Text>
              <Text variant="bodyMd" tone="critical">
                {counts.missing} ({percentages.missing}%)
              </Text>
            </InlineStack>

            {counts.unsynced > 0 && (
              <InlineStack gap="100">
                <Text variant="bodyMd" fontWeight="semibold">待同步:</Text>
                <Text variant="bodyMd" tone="info">
                  {counts.unsynced}
                </Text>
              </InlineStack>
            )}
          </InlineStack>
        </BlockStack>

        {/* 高 stale 比例警告 */}
        {showStaleWarning && (
          <Banner tone="warning">
            <Text variant="bodyMd">
              有 {percentages.stale}% 的字段内容已变更，建议重新翻译以保持内容同步。
            </Text>
          </Banner>
        )}

        {/* 问题字段列表 */}
        {problemFields.length > 0 && (
          <BlockStack gap="300">
            <Text variant="bodyMd" tone="subdued">
              需要关注的字段 ({problemFields.length})
            </Text>

            <BlockStack gap="200">
              {visibleFields.map((field, index) => (
                <InlineStack key={field.key || index} gap="300" align="space-between" blockAlign="center">
                  <InlineStack gap="200" align="start">
                    <Badge tone={getStatusTone(field.status)}>
                      {getStatusLabel(field.status)}
                    </Badge>
                    <Text variant="bodyMd" breakWord>
                      {field.key}
                    </Text>
                  </InlineStack>

                  {field.valuePreview && (
                    <Text variant="bodySm" tone="subdued" truncate>
                      {field.valuePreview}
                    </Text>
                  )}
                </InlineStack>
              ))}
            </BlockStack>

            {/* 展开/收起按钮 */}
            {hasMoreFields && (
              <Button
                onClick={() => setExpandedFields(!expandedFields)}
                plain
                disclosure={expandedFields ? 'up' : 'down'}
              >
                {expandedFields
                  ? '收起'
                  : `查看全部 ${problemFields.length} 个字段`
                }
              </Button>
            )}
          </BlockStack>
        )}

        {/* 可重译字段提示 */}
        {metadata?.retriableCount > 0 && (
          <BlockStack gap="200">
            <InlineStack gap="200" align="center">
              <Badge tone="info">{metadata.retriableCount}</Badge>
              <Text variant="bodyMd">
                个字段可重新翻译
              </Text>
            </InlineStack>

            {retriableKeys.length > 0 && retriableKeys.length <= 5 && (
              <Text variant="bodySm" tone="subdued">
                包括: {retriableKeys.join(', ')}
              </Text>
            )}
          </BlockStack>
        )}

        {/* 元数据信息（调试用，可选） */}
        {process.env.NODE_ENV === 'development' && metadata && (
          <BlockStack gap="100">
            <Text variant="bodySm" tone="subdued">
              计算时间: {new Date(metadata.calculatedAt).toLocaleTimeString()}
            </Text>
            <Text variant="bodySm" tone="subdued">
              质量阈值: {(metadata.qualityThreshold * 100).toFixed(0)}%
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}