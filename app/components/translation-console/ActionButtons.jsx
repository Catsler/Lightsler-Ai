import { BlockStack, Button, InlineStack, Text, Tooltip } from "@shopify/polaris";

export default function ActionButtons({
  t,
  actions,
  billing,
  translateDisabledReason,
  availableCredits,
  creditToChars,
  estimatedSummaryWithLimit,
  hasActiveSubscription,
  handleOpenUpgrade
}) {
  const {
    scanAllResources,
    isScanning,
    startTranslation,
    isTranslating,
    resources,
    selectedResources,
    canTranslate,
    clearData,
    isClearing,
    translationService
  } = actions;

  return (
    <BlockStack gap="300">
      <InlineStack gap="200">
        <Button
          onClick={scanAllResources}
          loading={isScanning}
          variant="primary"
        >
          {t('actions.scanResources', { ns: 'home' })}
        </Button>
        <Tooltip
          content={translateDisabledReason}
          active={Boolean(translateDisabledReason)}
          preferredPosition="above"
        >
          <Button
            onClick={startTranslation}
            loading={isTranslating}
            variant="primary"
            disabled={
              resources.length === 0 ||
              (translationService && translationService.status === 'unhealthy') ||
              !canTranslate
            }
          >
            {selectedResources.length > 0
              ? t('actions.translateSelected', { ns: 'home', count: selectedResources.length })
              : resources.length > 0
                ? t('actions.translateAll', { ns: 'home', count: resources.length })
                : t('empty.noResources', { ns: 'home' })}
          </Button>
        </Tooltip>
        <Button
          onClick={clearData}
          loading={isClearing}
          variant="tertiary"
          tone="critical"
        >
          {t('actions.clearData', { ns: 'home' })}
        </Button>
      </InlineStack>

      <BlockStack gap="150">
        <Text variant="bodySm" tone="subdued">
          {t('ui.scanningNote', { ns: 'home', credits: availableCredits, chars: availableCredits * creditToChars })} {` ${estimatedSummaryWithLimit}`}
        </Text>
        {!hasActiveSubscription && (
          <Text variant="bodySm" tone="warning">
            {t('subscription.inactiveBody', { ns: 'home' })}
          </Text>
        )}
        {hasActiveSubscription && availableCredits <= 0 && (
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodySm">
              {t('home.subscription.noCreditsBody')}
            </Text>
            <Button size="slim" onClick={handleOpenUpgrade}>
              {t('home.subscription.viewPlans')}
            </Button>
          </InlineStack>
        )}
      </BlockStack>
    </BlockStack>
  );
}

