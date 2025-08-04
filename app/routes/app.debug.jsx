import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Page, Card, Button, TextField, Text, Banner, BlockStack } from "@shopify/polaris";

export default function AppDebug() {
  const fetcher = useFetcher();
  const [resourceId, setResourceId] = useState("gid://shopify/Page/117448212669");
  
  const debugTranslation = () => {
    fetcher.submit(
      { resourceId },
      { method: "POST", action: "/api/debug-translation" }
    );
  };
  
  return (
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
          <Card sectioned>
            <BlockStack gap="400">
              {fetcher.data.success ? (
                <>
                  <Banner status="success">
                    <p>调试成功！</p>
                  </Banner>
                  <Text variant="headingMd">原始响应数据：</Text>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "12px" }}>
                    {JSON.stringify(fetcher.data.data, null, 2)}
                  </pre>
                </>
              ) : (
                <Banner status="critical">
                  <p>调试失败: {fetcher.data.error || fetcher.data.message}</p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}