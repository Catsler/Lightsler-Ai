import { Card, InlineStack, Text, ProgressBar, Button, Tooltip, Badge, BlockStack } from "@shopify/polaris";
import { PRICING_CONFIG } from "../../utils/pricing-config.js";
import { useTranslation } from "react-i18next";

function formatNumber(value) {
  if (value == null) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function CreditBar({
  credits,
  subscription,
  plans,
  onUpgrade,
  canCancel = false,
  onCancel,
  upgradeDisabled = false
}) {
  const { t } = useTranslation('billing');
  const total = credits?.total ?? 0;
  const used = credits?.used ?? 0;
  const pending = credits?.pending ?? 0;
  const available = credits?.available ?? 0;

  const creditToChars = PRICING_CONFIG.CREDIT_TO_CHARS;
  const formatCredits = (value) => `${formatNumber(value)} ${t('creditBar.unit')}`;
  const formatCreditsWithChars = (value) => {
    if (value == null) return '--';
    const approx = value * creditToChars;
    return `${formatCredits(value)} (${t('creditBar.approx')} ${formatNumber(approx)} ${t('creditBar.chars')})`;
  };

  const usagePercent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  const currentPlan = subscription
    ? plans.find((plan) => plan.id === subscription.planId)
    : null;

  const canShowUpgrade =
    typeof onUpgrade === 'function' &&
    plans && plans.length > 0 &&
    (!currentPlan || plans.some((plan) => plan.monthlyCredits > (currentPlan?.monthlyCredits ?? 0)));

  const usageLabel = total > 0
    ? `${formatCredits(used)} / ${formatCredits(total)}`
    : t('creditBar.unknown');

  const currentStatus = subscription?.status || 'unknown';
  const statusLabel = t(`creditBar.status.${currentStatus}`, { defaultValue: currentStatus });
  const statusBadgeTone = currentStatus?.startsWith?.('active')
    ? 'success'
    : currentStatus?.startsWith?.('pending')
      ? 'warning'
      : 'critical';

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingSm">
              {t('creditBar.title')}
            </Text>
            {subscription?.planDisplayName && (
              <Badge tone="info">
                {t(`plans.names.${subscription.planId}`, { defaultValue: subscription.planDisplayName })}
              </Badge>
            )}
            <Badge tone={statusBadgeTone}>
              {statusLabel}
            </Badge>
          </InlineStack>
          <InlineStack gap="200">
            {canCancel && onCancel && (
              <Button onClick={onCancel} tone="critical" variant="tertiary">
                {t('creditBar.cancel')}
              </Button>
            )}
            {canShowUpgrade && (
              <Button variant="primary" onClick={onUpgrade} disabled={upgradeDisabled}>
                {t('creditBar.upgrade')}
              </Button>
            )}
          </InlineStack>
        </InlineStack>

        <Tooltip content={t('creditBar.tooltipUsed', { used: formatNumber(used), pending: formatNumber(pending) })}>
          <div>
            <ProgressBar size="small" progress={usagePercent} />
          </div>
        </Tooltip>
        <Text variant="bodySm" tone="subdued">
          {t('creditBar.ratio', { chars: formatNumber(creditToChars) })}
        </Text>

        <InlineStack gap="400" wrap={false}>
          <InlineStack gap="100">
            <Text variant="bodySm" tone="subdued">{t('creditBar.remaining')}</Text>
            <Text variant="bodySm">{formatCreditsWithChars(available)}</Text>
          </InlineStack>
          <BlockStack gap="150">
            <InlineStack gap="100">
              <Text variant="bodySm" tone="subdued">{t('creditBar.used')}</Text>
              <Text variant="bodySm">{usageLabel}</Text>
            </InlineStack>
            {pending > 0 && (
              <InlineStack gap="100">
                <Text variant="bodySm" tone="subdued">{t('creditBar.pending')}</Text>
                <Text variant="bodySm">{formatCreditsWithChars(pending)}</Text>
              </InlineStack>
            )}
          </BlockStack>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
