import { Banner, BlockStack, Box, Button, Card, Checkbox, InlineStack, Text, Tooltip, Layout } from "@shopify/polaris";
import LanguageControls from "~/components/translation-console/LanguageControls";
import ActionButtons from "~/components/translation-console/ActionButtons";

// 控制区：语言/视图选择 + 操作按钮，保持行为和文案
export default function TranslationControls({
  t,
  language,
  billing,
  actions,
  viewMode,
  setViewMode,
  loadStatus,
  clearCache,
  setClearCache,
  availableCredits,
  creditToChars,
  estimatedSummaryWithLimit,
  hasActiveSubscription,
  handleOpenUpgrade,
  primaryLanguage,
  shopId
}) {
  const { dynamicLanguages, selectedLanguage } = language;
  const {
    scanAllResources,
    isScanning,
    translateDisabledReason,
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
    <Layout>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              {t('ui.controlPanel', { ns: 'home' })}
            </Text>

            <LanguageControls
              t={t}
              language={language}
              viewMode={viewMode}
              setViewMode={setViewMode}
              loadStatus={loadStatus}
              primaryLanguage={primaryLanguage}
              shopId={shopId}
              billing={billing}
            />

            <Box>
              <Checkbox
                label={t('ui.clearCacheAndRetranslate', { ns: 'home' })}
                checked={clearCache}
                onChange={setClearCache}
                helpText={t('ui.clearCacheHelp', { ns: 'home' })}
              />
            </Box>

            <ActionButtons
              t={t}
              actions={actions}
              billing={billing}
              translateDisabledReason={translateDisabledReason}
              availableCredits={availableCredits}
              creditToChars={creditToChars}
              estimatedSummaryWithLimit={estimatedSummaryWithLimit}
              hasActiveSubscription={hasActiveSubscription}
              handleOpenUpgrade={handleOpenUpgrade}
            />
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );
}
