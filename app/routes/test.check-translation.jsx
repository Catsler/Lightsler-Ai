import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Page, Card, Button, TextField, Text, Banner, BlockStack } from "@shopify/polaris";

export default function CheckTranslation() {
  const fetcher = useFetcher();
  const [resourceId, setResourceId] = useState("gid://shopify/Page/117448212669");
  const [locale, setLocale] = useState("fr");
  
  const checkTranslation = () => {
    fetcher.submit(
      { resourceId, locale },
      { method: "POST", action: "/api/check-translation" }
    );
  };
  
  return (
    <Page title="检查翻译内容">
      <BlockStack gap="500">
        <Card sectioned>
          <BlockStack gap="400">
            <TextField
              label="资源 GID"
              value={resourceId}
              onChange={setResourceId}
              placeholder="gid://shopify/Page/117448212669"
            />
            
            <TextField
              label="语言代码"
              value={locale}
              onChange={setLocale}
              placeholder="fr"
            />
            
            <Button primary onClick={checkTranslation} loading={fetcher.state === "submitting"}>
              检查翻译
            </Button>
          </BlockStack>
        </Card>
        
        {fetcher.data && (
          <Card sectioned>
            <BlockStack gap="400">
              {fetcher.data.success ? (
                <>
                  <Banner status="success">
                    <p>{fetcher.data.message}</p>
                  </Banner>
                  
                  {fetcher.data.data?.translatableResource?.translations?.length > 0 ? (
                    <BlockStack gap="300">
                      <Text variant="headingMd">找到的翻译内容：</Text>
                      {fetcher.data.data.translatableResource.translations.map((trans, index) => (
                        <Card key={index} subdued>
                          <BlockStack gap="200">
                            <Text variant="headingSm">字段: {trans.key}</Text>
                            <Text variant="bodyMd">
                              内容: {trans.value?.substring(0, 200)}
                              {trans.value?.length > 200 && "..."}
                            </Text>
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  ) : (
                    <Banner status="warning">
                      <p>未找到该资源的翻译内容</p>
                    </Banner>
                  )}
                </>
              ) : (
                <Banner status="critical">
                  <p>{fetcher.data.error || "检查失败"}</p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}