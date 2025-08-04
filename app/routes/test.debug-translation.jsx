import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { AppProvider, Page, Card, Button, TextField, Text, Banner, BlockStack, DataTable } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function DebugTranslation() {
  const fetcher = useFetcher();
  const [resourceId, setResourceId] = useState("gid://shopify/Page/117448212669");
  
  const debugTranslation = () => {
    fetcher.submit(
      { resourceId },
      { method: "POST", action: "/api/debug-translation" }
    );
  };
  
  const renderContent = (content) => {
    if (!content) return "无内容";
    
    if (content.includes("<") && content.includes(">")) {
      return (
        <div>
          <Text variant="bodyMd">HTML内容预览:</Text>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "12px" }}>
            {content.substring(0, 200)}...
          </pre>
        </div>
      );
    }
    
    return content.substring(0, 200) + (content.length > 200 ? "..." : "");
  };
  
  return (
    <AppProvider i18n={{}}>
      <Page title="翻译调试工具">
        <BlockStack gap="500">
          <Card sectioned>
            <BlockStack gap="400">
              <TextField
                label="资源 GID"
                value={resourceId}
                onChange={setResourceId}
                placeholder="gid://shopify/Page/117448212669"
              />
              
              <Button primary onClick={debugTranslation} loading={fetcher.state === "submitting"}>
                调试翻译
              </Button>
            </BlockStack>
          </Card>
          
          {fetcher.data && (
            <>
              {fetcher.data.success ? (
                <>
                  <Card sectioned>
                <BlockStack gap="400">
                  <Text variant="headingMd">店铺语言配置</Text>
                  {fetcher.data.data?.shopLocales?.map((locale, index) => (
                    <Text key={index} variant="bodyMd">
                      {locale.locale} - {locale.primary ? "主要语言" : "次要语言"} - {locale.published ? "已发布" : "未发布"}
                    </Text>
                  ))}
                </BlockStack>
              </Card>
              
              <Card sectioned>
                <BlockStack gap="400">
                  <Text variant="headingMd">内容对比</Text>
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["字段", "原始内容 (English)", "法语翻译"]}
                    rows={Object.keys(fetcher.data.data?.originalContent || {}).map(key => {
                      const original = fetcher.data.data.originalContent[key];
                      const translation = fetcher.data.data.frenchTranslations[key];
                      
                      return [
                        key,
                        renderContent(original?.value || ""),
                        translation ? renderContent(translation.value) : "未翻译"
                      ];
                    })}
                  />
                </BlockStack>
              </Card>
              
              <Card sectioned>
                <BlockStack gap="400">
                  <Text variant="headingMd">原始GraphQL响应</Text>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "12px" }}>
                    {JSON.stringify(fetcher.data.data?.raw, null, 2)}
                  </pre>
                </BlockStack>
              </Card>
                </>
              ) : (
                <Card sectioned>
                  <Banner status="critical">
                    <p>调试失败: {fetcher.data.error || fetcher.data.message}</p>
                  </Banner>
                </Card>
              )}
            </>
          )}
        </BlockStack>
      </Page>
    </AppProvider>
  );
}