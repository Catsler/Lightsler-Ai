import { BlockStack, Box, Select, Text } from "@shopify/polaris";
import LanguageManager from "~/components/LanguageManager";

export default function LanguageControls({
  t,
  language,
  viewMode,
  setViewMode,
  loadStatus,
  primaryLanguage,
  shopId,
  billing
}) {
  const { dynamicLanguages, selectedLanguage, handleLanguageChange, handleLanguageAdded, handleLanguagesUpdated } = language;

  return (
    <BlockStack gap="400">
      <Select
        label={t('ui.targetLanguage', { ns: 'home' })}
        options={dynamicLanguages}
        value={selectedLanguage}
        onChange={handleLanguageChange}
        helpText={t('ui.chooseTargetLanguage', { ns: 'home' })}
      />

      <Select
        label={t('ui.filterView', { ns: 'home' })}
        options=[
          { label: t('filterOptions.all', { ns: 'home' }), value: 'all' },
          { label: t('filterOptions.withTranslations', { ns: 'home' }), value: 'with-translations' },
          { label: t('filterOptions.withoutTranslations', { ns: 'home' }), value: 'without-translations' }
        ]
        value={viewMode}
        onChange={(value) => {
          setViewMode(value);
          loadStatus(selectedLanguage, value);
        }}
        helpText={viewMode !== 'all'
          ? (viewMode === 'with-translations'
            ? t('ui.filterHelpWith', { ns: 'home' })
            : t('ui.filterHelpWithout', { ns: 'home' }))
          : t('ui.filterHelpAll', { ns: 'home' })
        }
      />

      <Box>
        <LanguageManager
          currentLanguages={dynamicLanguages}
          primaryLanguage={primaryLanguage}
          onLanguageAdded={handleLanguageAdded}
          onLanguagesUpdated={handleLanguagesUpdated}
          shopId={shopId}
          languageLimit={billing?.languageLimit}
        />
      </Box>

      {primaryLanguage && (
        <Text variant="bodySm" tone="subdued">
          {t('ui.defaultLanguageNote', { ns: 'home', name: primaryLanguage.label })}
        </Text>
      )}
    </BlockStack>
  );
}

