import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Divider
} from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getResourceWithTranslations } from "../services/database.server.js";

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { resourceId } = params;

  if (!resourceId) {
    throw new Response("Resource ID is required", { status: 400 });
  }

  try {
    // 获取资源及其翻译
    const resource = await getResourceWithTranslations(resourceId, session.shop);

    if (!resource) {
      throw new Response("Resource not found", { status: 404 });
    }

    // 检查是否为Theme资源类型
    const isThemeResource = resource.resourceType.includes('THEME') || 
                           resource.resourceType.includes('ONLINE_STORE');

    if (!isThemeResource) {
      throw new Response("This is not a theme resource", { status: 400 });
    }

    return json({
      resource,
      shop: session.shop
    });
  } catch (error) {
    console.error('[Theme Detail Loader] 错误:', error);
    throw new Response("Failed to load resource", { status: 500 });
  }
};

export default function ThemeDetailPage() {
  const { resource } = useLoaderData();
  const navigate = useNavigate();

  // 处理contentFields JSON数据
  const contentFields = resource.contentFields || {};
  
  // 获取翻译统计
  const translationStats = {
    total: resource.translations?.length || 0,
    completed: resource.translations?.filter(t => t.status === 'completed').length || 0,
    synced: resource.translations?.filter(t => t.syncStatus === 'synced').length || 0
  };

  // 渲染Theme特定字段
  const renderThemeContent = () => {
    if (!contentFields || Object.keys(contentFields).length === 0) {
      return (
        <Text variant="bodySm" tone="subdued">
          暂无Theme特定内容
        </Text>
      );
    }

    return (
      <BlockStack gap="200">
        {Object.entries(contentFields).map(([key, value]) => (
          <InlineStack key={key} align="space-between">
            <Text variant="bodySm" fontWeight="semibold">
              {key}:
            </Text>
            <Text variant="bodySm" tone="subdued">
              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </Text>
          </InlineStack>
        ))}
      </BlockStack>
    );
  };

  // 渲染翻译列表
  const renderTranslations = () => {
    if (!resource.translations || resource.translations.length === 0) {
      return (
        <Text variant="bodySm" tone="subdued">
          暂无翻译记录
        </Text>
      );
    }

    return (
      <BlockStack gap="300">
        {resource.translations.map((translation) => (
          <Card key={translation.id}>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text variant="headingSm">{translation.language}</Text>
                <InlineStack gap="200">
                  <Badge tone={translation.status === 'completed' ? 'success' : 'warning'}>
                    {translation.status}
                  </Badge>
                  <Badge tone={translation.syncStatus === 'synced' ? 'success' : 'caution'}>
                    {translation.syncStatus}
                  </Badge>
                </InlineStack>
              </InlineStack>
              
              {translation.titleTrans && (
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">标题翻译:</Text>
                  <Text variant="bodySm">{translation.titleTrans}</Text>
                </InlineStack>
              )}
              
              {translation.descTrans && (
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">描述翻译:</Text>
                  <Text variant="bodySm" truncate>{translation.descTrans}</Text>
                </InlineStack>
              )}

              {/* Theme特定翻译字段 */}
              {translation.translationFields && (
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold">Theme字段翻译:</Text>
                  <Text variant="bodyXs" tone="subdued">
                    {JSON.stringify(translation.translationFields, null, 2)}
                  </Text>
                </BlockStack>
              )}

              {/* 质量评分 */}
              {translation.qualityScore > 0 && (
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">质量评分:</Text>
                  <Badge tone={translation.qualityScore > 0.8 ? 'success' : translation.qualityScore > 0.6 ? 'caution' : 'critical'}>
                    {Math.round(translation.qualityScore * 100)}%
                  </Badge>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    );
  };

  return (
    <Page
      title={`Theme资源: ${resource.title || resource.resourceId}`}
      titleMetadata={<Badge tone="info">{resource.resourceType}</Badge>}
      backAction={{
        content: '返回',
        icon: ArrowLeftIcon,
        onAction: () => navigate('/app')
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* 基本信息卡片 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">基本信息</Text>
                
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">资源ID:</Text>
                  <Text variant="bodySm">{resource.resourceId}</Text>
                </InlineStack>
                
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">资源类型:</Text>
                  <Badge tone="info">{resource.resourceType}</Badge>
                </InlineStack>
                
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">状态:</Text>
                  <Badge tone={resource.status === 'completed' ? 'success' : 'warning'}>
                    {resource.status}
                  </Badge>
                </InlineStack>

                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">Shopify GID:</Text>
                  <Text variant="bodySm" truncate>{resource.gid}</Text>
                </InlineStack>

                {resource.title && (
                  <InlineStack align="space-between">
                    <Text variant="bodySm" fontWeight="semibold">标题:</Text>
                    <Text variant="bodySm">{resource.title}</Text>
                  </InlineStack>
                )}

                {resource.description && (
                  <BlockStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">描述:</Text>
                    <Text variant="bodySm">{resource.description}</Text>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Theme内容卡片 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">Theme内容</Text>
                {renderThemeContent()}
              </BlockStack>
            </Card>

            {/* 翻译统计卡片 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">翻译统计</Text>
                <InlineStack gap="400">
                  <InlineStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">总计:</Text>
                    <Badge>{translationStats.total}</Badge>
                  </InlineStack>
                  <InlineStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">已完成:</Text>
                    <Badge tone="success">{translationStats.completed}</Badge>
                  </InlineStack>
                  <InlineStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">已同步:</Text>
                    <Badge tone="info">{translationStats.synced}</Badge>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* 操作按钮卡片 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">操作</Text>
                <BlockStack gap="200">
                  <Button variant="primary" size="large">
                    重新翻译
                  </Button>
                  <Button variant="secondary" size="large">
                    同步到Shopify
                  </Button>
                  <Button variant="plain" size="large" tone="critical">
                    删除翻译
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Sequential Thinking信息卡片 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">智能信息</Text>
                
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">风险评分:</Text>
                  <Badge tone={resource.riskScore > 0.7 ? 'critical' : resource.riskScore > 0.4 ? 'caution' : 'success'}>
                    {Math.round(resource.riskScore * 100)}%
                  </Badge>
                </InlineStack>

                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">错误次数:</Text>
                  <Text variant="bodySm">{resource.errorCount || 0}</Text>
                </InlineStack>

                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">内容版本:</Text>
                  <Text variant="bodySm">v{resource.contentVersion}</Text>
                </InlineStack>

                {resource.lastScannedAt && (
                  <InlineStack align="space-between">
                    <Text variant="bodySm" fontWeight="semibold">最后扫描:</Text>
                    <Text variant="bodySm" tone="subdued">
                      {new Date(resource.lastScannedAt).toLocaleDateString('zh-CN')}
                    </Text>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          {/* 翻译详情卡片 */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">翻译详情</Text>
              <Divider />
              {renderTranslations()}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}