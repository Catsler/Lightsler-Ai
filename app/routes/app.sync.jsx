/**
 * 发布管理页面
 * 管理翻译内容到Shopify的发布
 */

import { useState, useEffect, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  Badge,
  Banner,
  DataTable,
  ProgressBar,
  Select,
  BlockStack,
  InlineStack,
  ButtonGroup,
  Modal,
  TextContainer,
  SkeletonBodyText,
  EmptyState
} from "@shopify/polaris";
import { getSyncStatusStats } from "../services/sync-to-shopify.server.js";
import prisma from "../db.server.js";
import { getSyncErrorMessage } from "../utils/sync-error-helper.js";
import { useAppRefresh } from "../utils/use-app-refresh.client";

/**
 * Loader函数：获取发布状态数据
 */
export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server.js");
  const { session } = await authenticate.admin(request);
  
  const shopId = session.shop;
  
  // 获取发布状态统计
  const syncStats = await getSyncStatusStats(shopId);
  
  // 获取最近失败的发布记录
  const failedSync = await prisma.translation.findMany({
    where: { 
      shopId,
      syncStatus: 'failed'
    },
    include: {
      resource: {
        select: {
          title: true,
          resourceType: true,
          gid: true
        }
      }
    },
    take: 10,
    orderBy: { updatedAt: 'desc' }
  });
  
  // 获取支持的语言
  const languages = await prisma.language.findMany({
    where: { shopId, isActive: true }
  });
  
  // 获取资源类型列表
  const resourceTypes = await prisma.resource.groupBy({
    by: ['resourceType'],
    where: { shopId },
    _count: { id: true }
  });
  
  return json({
    syncStats,
    failedSync,
    languages,
    resourceTypes: resourceTypes.map(rt => ({
      value: rt.resourceType,
      label: `${rt.resourceType} (${rt._count.id})`
    }))
  });
}

export default function SyncManagementPage() {
  const { syncStats, failedSync, languages, resourceTypes } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const { refresh } = useAppRefresh(); // App Bridge 安全刷新
  
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [selectedResourceType, setSelectedResourceType] = useState("");
  const [syncLimit, setSyncLimit] = useState("100");
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  
  // 自动刷新状态
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoading) {
        setStatusRefreshKey(prev => prev + 1);
      }
    }, 5000); // 每5秒刷新一次
    
    return () => clearInterval(interval);
  }, [isLoading]);
  
  // 执行发布
  const handleSync = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "sync");
    if (selectedLanguage) formData.append("language", selectedLanguage);
    if (selectedResourceType) formData.append("resourceType", selectedResourceType);
    formData.append("limit", syncLimit);
    
    submit(formData, { 
      method: "post", 
      action: "/api/sync-translations" 
    });
  }, [selectedLanguage, selectedResourceType, syncLimit, submit]);
  
  // 重试失败的发布
  const handleRetry = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "retry");
    
    submit(formData, { 
      method: "post", 
      action: "/api/sync-translations" 
    });
    setShowRetryModal(false);
  }, [submit]);
  
  // 清理错误
  const handleClearErrors = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "clearErrors");
    
    submit(formData, { 
      method: "post", 
      action: "/api/sync-translations" 
    });
  }, [submit]);
  
  // 计算进度百分比
  const totalTranslations = syncStats.pending + syncStats.syncing + syncStats.synced + syncStats.failed;
  const syncProgress = totalTranslations > 0 
    ? Math.round((syncStats.synced / totalTranslations) * 100)
    : 0;
  
  // 准备失败记录表格数据
  const failedRows = failedSync.map(item => [
    item.resource.title,
    <Badge status="critical">{item.resource.resourceType}</Badge>,
    item.language,
    <Text variant="bodyMd" as="p" tone="critical">
      {getSyncErrorMessage(item.syncError)}
    </Text>,
    new Date(item.updatedAt).toLocaleString('zh-CN')
  ]);
  
  return (
    <Page
      title="发布管理"
      subtitle="管理翻译内容到Shopify的发布"
      primaryAction={{
        content: "立即发布",
        onAction: handleSync,
        loading: isLoading,
        disabled: syncStats.pending === 0
      }}
      secondaryActions={[
        {
          content: "刷新状态",
          onAction: () => refresh()
        }
      ]}
    >
      {/* 迁移提示 */}
      <Banner
        title="功能已整合"
        status="info"
        onDismiss={() => {}}
        action={{content: '返回主页', url: '/app'}}
      >
        <p>发布功能已整合到主页面，您可以直接使用主页的"发布翻译"和"批量发布"按钮。</p>
      </Banner>

      <Layout>
        {/* 发布状态概览 */}
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">发布状态概览</Text>
            <div style={{ marginTop: '16px' }}>
              <BlockStack gap="500">
                <ProgressBar 
                  progress={syncProgress} 
                  size="large"
                  tone={syncProgress === 100 ? "success" : "primary"}
                />
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Badge status="attention">待发布: {syncStats.pending}</Badge>
                    <Badge status="info">发布中: {syncStats.syncing}</Badge>
                    <Badge status="success">已发布: {syncStats.synced}</Badge>
                    <Badge status="critical">失败: {syncStats.failed}</Badge>
                  </InlineStack>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    总计: {totalTranslations} | 完成率: {syncProgress}%
                  </Text>
                </InlineStack>
              </BlockStack>
            </div>
          </Card>
        </Layout.Section>
        
        {/* 发布选项 */}
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">发布选项</Text>
            <div style={{ marginTop: '16px' }}>
              <BlockStack gap="500">
                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <Select
                      label="选择语言"
                      options={[
                        { label: "所有语言", value: "" },
                        ...(Array.isArray(languages) ? languages : []).map(lang => ({
                          label: `${lang.name} (${lang.code})`,
                          value: lang.code
                        }))
                      ]}
                      value={selectedLanguage}
                      onChange={setSelectedLanguage}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="资源类型"
                      options={[
                        { label: "所有类型", value: "" },
                        ...resourceTypes
                      ]}
                      value={selectedResourceType}
                      onChange={setSelectedResourceType}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="批量限制"
                      options={[
                        { label: "50 条", value: "50" },
                        { label: "100 条", value: "100" },
                        { label: "200 条", value: "200" },
                        { label: "500 条", value: "500" },
                        { label: "全部", value: "0" }
                      ]}
                      value={syncLimit}
                      onChange={setSyncLimit}
                      helpText="每次发布的最大记录数"
                    />
                  </div>
                </InlineStack>
                
                <ButtonGroup>
                  <Button 
                    primary
                    onClick={handleSync}
                    loading={isLoading}
                    disabled={syncStats.pending === 0}
                  >
                    开始发布 ({syncStats.pending} 条待处理)
                  </Button>
                  {syncStats.failed > 0 && (
                    <Button
                      onClick={() => setShowRetryModal(true)}
                      tone="critical"
                    >
                      重试失败 ({syncStats.failed} 条)
                    </Button>
                  )}
                </ButtonGroup>
              </BlockStack>
            </div>
          </Card>
        </Layout.Section>
        
        {/* 失败记录 */}
        {failedSync.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">最近失败的发布</Text>
                  <Button plain onClick={handleClearErrors}>
                    清理错误记录
                  </Button>
                </InlineStack>
                
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['资源标题', '类型', '语言', '错误信息', '时间']}
                  rows={failedRows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
        
        {/* 使用说明 */}
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">使用说明</Text>
            <div style={{ marginTop: '16px' }}>
              <TextContainer>
                <Text variant="bodyMd" as="p">
                  <strong>新的发布流程：</strong>
                </Text>
                <ol>
                  <li>翻译操作现在只保存到本地数据库，不会直接提交到Shopify</li>
                  <li>使用此页面将缓存的翻译批量发布到Shopify</li>
                  <li>支持按语言、资源类型筛选发布内容</li>
                  <li>失败的发布可以重试，不会丢失翻译结果</li>
                  <li>系统自动处理Shopify API的100个字段限制，分批提交</li>
                </ol>
                <Text variant="bodyMd" as="p" tone="success">
                  <strong>优势：</strong>
                  避免重复调用GPT API，降低成本；支持断点续传；可以先批量翻译，后续择时发布。
                </Text>
              </TextContainer>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
      
      {/* 重试确认模态框 */}
      <Modal
        open={showRetryModal}
        onClose={() => setShowRetryModal(false)}
        title="确认重试失败的发布"
        primaryAction={{
          content: "确认重试",
          onAction: handleRetry,
          destructive: false
        }}
        secondaryActions={[
          {
            content: "取消",
            onAction: () => setShowRetryModal(false)
          }
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <Text variant="bodyMd" as="p">
              将重试 {syncStats.failed} 条失败的发布记录。
            </Text>
            <Text variant="bodyMd" as="p">
              这些记录将被重置为待发布状态，然后重新尝试发布到Shopify。
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}