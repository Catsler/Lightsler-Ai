import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  TextField,
  Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { TRANSLATABLE_RESOURCE_QUERY } from "../services/shopify-graphql.server.js";
import { useState } from "react";

/**
 * SEO字段调试工具
 * 用于检查和诊断Shopify页面的translatableContent结构
 */
export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const resourceId = url.searchParams.get('resourceId');
    
    if (!resourceId) {
      return json({
        success: false,
        error: '需要提供resourceId参数'
      });
    }

    // 查询可翻译资源内容
    const response = await admin.graphql(TRANSLATABLE_RESOURCE_QUERY, {
      variables: { resourceId }
    });
    
    const data = await response.json();
    
    if (data.errors) {
      return json({
        success: false,
        error: `GraphQL错误: ${JSON.stringify(data.errors)}`
      });
    }

    const translatableResource = data.data.translatableResource;
    if (!translatableResource) {
      return json({
        success: false,
        error: '未找到可翻译资源'
      });
    }

    // 分析可翻译内容
    const analysis = {
      resourceId,
      totalFields: translatableResource.translatableContent.length,
      fields: translatableResource.translatableContent.map(item => ({
        key: item.key,
        hasValue: !!item.value,
        valueLength: item.value ? item.value.length : 0,
        valuePreview: item.value ? item.value.substring(0, 100) + (item.value.length > 100 ? '...' : '') : '',
        digest: item.digest,
        locale: item.locale
      })),
      seoFields: {
        hasMetaTitle: translatableResource.translatableContent.some(item => item.key === 'meta_title'),
        hasMetaDescription: translatableResource.translatableContent.some(item => item.key === 'meta_description'),
        metaTitleValue: translatableResource.translatableContent.find(item => item.key === 'meta_title')?.value || null,
        metaDescriptionValue: translatableResource.translatableContent.find(item => item.key === 'meta_description')?.value || null
      },
      availableKeys: translatableResource.translatableContent.map(item => item.key).sort()
    };

    return json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('SEO字段调试失败:', error);
    return json({
      success: false,
      error: error.message
    });
  }
};

export default function SEOFieldsDebug() {
  const loaderData = useLoaderData();
  const [resourceId, setResourceId] = useState('');
  
  const handleDebug = () => {
    if (resourceId.trim()) {
      // 重新加载页面带上resourceId参数
      window.location.href = `/debug/seo-fields?resourceId=${encodeURIComponent(resourceId)}`;
    }
  };

  return (
    <Page title="SEO字段调试工具">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">检查资源的SEO字段</Text>
              
              <InlineStack gap="200">
                <div style={{ flexGrow: 1 }}>
                  <TextField
                    label="资源ID (GraphQL ID)"
                    value={resourceId}
                    onChange={setResourceId}
                    placeholder="例如: gid://shopify/Page/123456"
                    helpText="输入要检查的Shopify资源的GraphQL ID"
                  />
                </div>
                <div style={{ alignSelf: 'end' }}>
                  <Button onClick={handleDebug} variant="primary">
                    调试检查
                  </Button>
                </div>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 调试结果显示 */}
        {loaderData && (
          <Layout.Section>
            {loaderData.success ? (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">调试结果</Text>
                    <Badge tone={loaderData.data.seoFields.hasMetaTitle && loaderData.data.seoFields.hasMetaDescription ? "success" : "critical"}>
                      {loaderData.data.seoFields.hasMetaTitle && loaderData.data.seoFields.hasMetaDescription ? "SEO字段完整" : "SEO字段缺失"}
                    </Badge>
                  </InlineStack>

                  <Text variant="bodySm" tone="subdued">
                    资源ID: {loaderData.data.resourceId}
                  </Text>

                  {/* SEO字段状态 */}
                  <Card subdued>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">SEO字段状态</Text>
                      
                      <InlineStack gap="400">
                        <InlineStack gap="200" align="center">
                          <Text>Meta Title:</Text>
                          <Badge tone={loaderData.data.seoFields.hasMetaTitle ? "success" : "critical"}>
                            {loaderData.data.seoFields.hasMetaTitle ? "存在" : "缺失"}
                          </Badge>
                        </InlineStack>
                        
                        <InlineStack gap="200" align="center">
                          <Text>Meta Description:</Text>
                          <Badge tone={loaderData.data.seoFields.hasMetaDescription ? "success" : "critical"}>
                            {loaderData.data.seoFields.hasMetaDescription ? "存在" : "缺失"}
                          </Badge>
                        </InlineStack>
                      </InlineStack>

                      {loaderData.data.seoFields.metaTitleValue && (
                        <div>
                          <Text as="p" variant="bodySm">
                            <strong>Meta Title内容:</strong> "{loaderData.data.seoFields.metaTitleValue}"
                          </Text>
                        </div>
                      )}

                      {loaderData.data.seoFields.metaDescriptionValue && (
                        <div>
                          <Text as="p" variant="bodySm">
                            <strong>Meta Description内容:</strong> "{loaderData.data.seoFields.metaDescriptionValue}"
                          </Text>
                        </div>
                      )}
                    </BlockStack>
                  </Card>

                  {/* 所有可翻译字段 */}
                  <Card subdued>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">
                        所有可翻译字段 ({loaderData.data.totalFields}个)
                      </Text>
                      
                      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <BlockStack gap="200">
                          {loaderData.data.fields.map((field, index) => (
                            <Card key={field.key} subdued>
                              <InlineStack align="space-between">
                                <BlockStack gap="100">
                                  <InlineStack gap="200">
                                    <Text variant="bodySm">
                                      <strong>#{index + 1} Key:</strong> {field.key}
                                    </Text>
                                    <Badge tone={field.hasValue ? "success" : "attention"}>
                                      {field.hasValue ? `${field.valueLength}字符` : "无内容"}
                                    </Badge>
                                  </InlineStack>
                                  
                                  {field.hasValue && (
                                    <Text variant="bodySm" tone="subdued">
                                      内容预览: "{field.valuePreview}"
                                    </Text>
                                  )}
                                  
                                  <Text variant="bodySm" tone="subdued">
                                    Digest: {field.digest} | Locale: {field.locale}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </Card>
                          ))}
                        </BlockStack>
                      </div>
                    </BlockStack>
                  </Card>

                  {/* 可用字段键列表 */}
                  <Card subdued>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">可用字段键列表</Text>
                      <Text variant="bodySm" tone="subdued">
                        {loaderData.data.availableKeys.join(', ')}
                      </Text>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <Banner title="调试失败" tone="critical">
                  <p>{loaderData.error}</p>
                </Banner>
              </Card>
            )}
          </Layout.Section>
        )}

        {/* 使用说明 */}
        <Layout.Section>
          <Card subdued>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">使用说明</Text>
              <BlockStack gap="200">
                <Text variant="bodySm">
                  1. 从Shopify后台获取页面的GraphQL ID（通常格式为 gid://shopify/Page/数字ID）
                </Text>
                <Text variant="bodySm">
                  2. 输入ID并点击"调试检查"按钮
                </Text>
                <Text variant="bodySm">
                  3. 查看SEO字段状态，特别关注meta_title和meta_description是否存在
                </Text>
                <Text variant="bodySm">
                  4. 如果SEO字段缺失，可能需要在Shopify后台设置页面的SEO信息
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}