import { useState } from "react";
import { useTranslation } from "react-i18next";
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


export function CoverageCard({ data, onRefresh, isRefreshing = false }) {
  const [expandedFields, setExpandedFields] = useState(false);
  const { t } = useTranslation();

  if (!data) {
    return null;
  }

  const { counts, percentages, fields = [], retriableKeys = [], metadata } = data;

  // Filter fields with issues (STALE/MISSING/LOW_QUALITY/UNSYNCED)
  const problemFields = fields.filter(field =>
    ['STALE', 'MISSING', 'LOW_QUALITY', 'UNSYNCED'].includes(field.status)
  );

  // Show the first 10 items by default
  const visibleFields = expandedFields ? problemFields : problemFields.slice(0, 10);
  const hasMoreFields = problemFields.length > 10;

  // Tone mapping for status badges
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

  // Text mapping for status badges
  const getStatusLabel = (status) => {
    switch (status) {
      case 'UP_TO_DATE': return t('coverage.status.upToDate');
      case 'STALE': return t('coverage.status.stale');
      case 'MISSING': return t('coverage.status.missing');
      case 'LOW_QUALITY': return t('coverage.status.lowQuality');
      case 'UNSYNCED': return t('coverage.status.unsynced');
      default: return status;
    }
  };

  // Show warning if stale ratio exceeds 10%
  const showStaleWarning = percentages.stale > 10;

  return (
    <Card>
      <BlockStack gap="400">
        {/* Title */}
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h2">
            {t('coverage.title')}
          </Text>
          <Button
            onClick={onRefresh}
            disabled={isRefreshing}
            icon={RefreshIcon}
            size="slim"
          >
            {isRefreshing ? <Spinner size="small" /> : t('coverage.refresh')}
          </Button>
        </InlineStack>

        {/* Overview stats */}
        <BlockStack gap="200">
          <Text variant="bodyMd" tone="subdued">
            {t('coverage.overview')}
          </Text>

          <InlineStack gap="400" wrap>
            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">{t('coverage.totalLabel')}:</Text>
              <Text variant="bodyMd">{t('coverage.totalFields', { count: counts.total })}</Text>
            </InlineStack>

            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">{t('coverage.updatedLabel')}:</Text>
              <Text variant="bodyMd" tone="success">
                {counts.upToDate} ({percentages.coverage}%)
              </Text>
            </InlineStack>

            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">{t('coverage.staleLabel')}:</Text>
              <Text variant="bodyMd" tone="warning">
                {counts.stale} ({percentages.stale}%)
              </Text>
            </InlineStack>

            <InlineStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">{t('coverage.missingLabel')}:</Text>
              <Text variant="bodyMd" tone="critical">
                {counts.missing} ({percentages.missing}%)
              </Text>
            </InlineStack>

            {counts.unsynced > 0 && (
              <InlineStack gap="100">
                <Text variant="bodyMd" fontWeight="semibold">{t('coverage.unsyncedLabel')}:</Text>
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
              {t('coverage.staleWarning', { percent: percentages.stale })}
            </Text>
          </Banner>
        )}

        {/* 问题字段列表 */}
        {problemFields.length > 0 && (
          <BlockStack gap="300">
            <Text variant="bodyMd" tone="subdued">
              {t('coverage.problemFields', { count: problemFields.length })}
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
                      ? t('coverage.collapse')
                      : t('coverage.expand', { count: problemFields.length })
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
                {t('coverage.retriable', { count: metadata.retriableCount })}
              </Text>
            </InlineStack>

            {retriableKeys.length > 0 && retriableKeys.length <= 5 && (
              <Text variant="bodySm" tone="subdued">
                {t('coverage.retriableList', { list: retriableKeys.join(', ') })}
              </Text>
            )}
          </BlockStack>
        )}

        {/* 元数据信息（调试用，可选） */}
        {process.env.NODE_ENV === 'development' && metadata && (
          <BlockStack gap="100">
            <Text variant="bodySm" tone="subdued">
              {t('coverage.calculatedAt', { time: new Date(metadata.calculatedAt).toLocaleTimeString() })}
            </Text>
            <Text variant="bodySm" tone="subdued">
              {t('coverage.qualityThreshold', { percent: (metadata.qualityThreshold * 100).toFixed(0) })}
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
