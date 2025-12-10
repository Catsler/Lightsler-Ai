import { BlockStack, Button, Card, InlineStack, Layout, Text } from "@shopify/polaris";

export default function PublishActions({
  t,
  stats,
  isPublishing,
  publishPendingTranslations,
  publishAllPending
}) {
  return (
    <Layout>
      <Layout.Section>
        <Card>
          <BlockStack gap="200">
            <Text variant="headingSm">{t('home.publish.title')}</Text>
            <InlineStack gap="200">
              <BlockStack gap="100">
                <Button
                  onClick={publishPendingTranslations}
                  loading={isPublishing}
                  variant="primary"
                  tone="success"
                  disabled={!stats.pendingTranslations}
                >
                  {t('home.publish.now', { count: stats.pendingTranslations || 0 })}
                </Button>
                <Text variant="bodySm" tone="subdued">
                  {t('home.publish.nowHelp')}
                </Text>
              </BlockStack>
              <BlockStack gap="100">
                <Button
                  onClick={publishAllPending}
                  loading={isPublishing}
                  variant="secondary"
                  tone="success"
                  disabled={!stats.totalPendingTranslations}
                >
                  {t('home.publish.all', { count: stats.totalPendingTranslations || 0 })}
                </Button>
                <Text variant="bodySm" tone="subdued">
                  {t('home.publish.allHelp')}
                </Text>
              </BlockStack>
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );
}

