import { Banner, BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";

// 翻译服务状态展示块：纯展示，无交互逻辑
export default function ServiceStatus({
  translationService,
  onRetry,
  t,
  selectedLanguage,
  viewMode,
}) {
  if (!translationService) return null;

  const isHealthy = translationService.status === "healthy";

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          {t("service.serviceStatus", { ns: "home" })}
        </Text>

        <InlineStack gap="200" align="center">
          <Text variant="bodySm">
            {t("service.translationLabel", { ns: "home" })}
          </Text>
          <Text variant="bodySm" tone={isHealthy ? "success" : "critical"}>
            {isHealthy
              ? t("status.healthy", { ns: "home" })
              : t("status.unhealthy", { ns: "home" })}
          </Text>
          {!isHealthy && translationService.errors && (
            <Text variant="bodySm" tone="critical">
              {translationService.errors[0]}
            </Text>
          )}
        </InlineStack>

        {translationService.status === "unhealthy" && (
          <Banner tone="critical" title={t("service.unavailableTitle", { ns: "home" })}>
            <BlockStack gap="200">
              <Text variant="bodySm">
                {translationService.errors?.[0] ||
                  t("service.unableToConnect", { ns: "home" })}
              </Text>

              {translationService.diagnostics?.endpoints?.[0] && (
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="critical">
                    {t("service.primaryDiagnostics", {
                      ns: "home",
                      summary: translationService.diagnostics.endpoints[0].summary,
                    })}
                  </Text>
                  {translationService.diagnostics.endpoints[0].checks?.map((check, index) => (
                    <Text
                      key={index}
                      variant="bodySm"
                      tone={check.status === "success" ? "subdued" : "critical"}
                    >
                      · {check.name}: {check.status}{" "}
                      {check.data?.httpStatus ? `(HTTP ${check.data.httpStatus})` : ""}
                    </Text>
                  ))}
                </BlockStack>
              )}

              {translationService.diagnostics?.recommendations?.length > 0 && (
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="critical">
                    {t("service.suggestedActions", { ns: "home" })}
                  </Text>
                  {translationService.diagnostics.recommendations.map((tip, index) => (
                    <Text key={index} variant="bodySm" tone="critical">
                      • {tip}
                    </Text>
                  ))}
                </BlockStack>
              )}

              <InlineStack gap="200">
                <Button size="slim" onClick={() => onRetry?.(selectedLanguage, viewMode, true)}>
                  {t("service.retryHealthCheck", { ns: "home" })}
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

        {translationService.warnings && translationService.warnings.length > 0 && (
          <BlockStack gap="200">
            {translationService.warnings.map((warning, index) => (
              <Text key={index} variant="bodySm" tone="warning">
                ⚠️ {warning}
              </Text>
            ))}
          </BlockStack>
        )}

        {translationService.config && (
          <InlineStack gap="400">
            <Text variant="bodySm">
              {translationService.config.apiKeyConfigured
                ? t("service.apiConfigured", { ns: "home" })
                : t("service.apiNotConfigured", { ns: "home" })}
            </Text>
            <Text variant="bodySm">{t("service.modelConnected", { ns: "home" })}</Text>
            <Text variant="bodySm">
              {t("service.timeout", { ns: "home", value: translationService.config.timeout })}
            </Text>
            {typeof translationService.config.maxRequestsPerMinute === "number" && (
              <Text variant="bodySm">
                {t("service.rateLimit", {
                  ns: "home",
                  value: translationService.config.maxRequestsPerMinute,
                })}
              </Text>
            )}
            {typeof translationService.config.minRequestIntervalMs === "number" && (
              <Text variant="bodySm">
                {t("service.minInterval", {
                  ns: "home",
                  value: translationService.config.minRequestIntervalMs,
                })}
              </Text>
            )}
          </InlineStack>
        )}
      </BlockStack>
    </Card>
  );
}

