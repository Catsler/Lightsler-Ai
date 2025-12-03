/**
 * 页面
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
import { useTranslation } from "react-i18next";

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
  const { refresh } = useAppRefresh();
  const { t, i18n } = useTranslation("home"); // App Bridge 安全刷新
  
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
    new Date(item.updatedAt).toLocaleString(i18n.language || 'en')
  ]);

  const tableHeadings = t('ui.syncTableHeadings', {
    returnObjects: true,
    defaultValue: ['Resource', 'Type', 'Language', 'Error', 'Time']
  });
  
  return (
    <Page
      title={t('ui.syncTitle', { ns: 'home', defaultValue: 'Publish management' })}
      subtitle={t('ui.syncSubtitle', { ns: 'home', defaultValue: 'Manage publishing translated content to Shopify' })}
      primaryAction={{
        content: t('ui.syncActionPublish', { ns: 'home', defaultValue: 'Publish now' }),
        onAction: handleSync,
        loading: isLoading,
        disabled: syncStats.pending === 0
      }}
      secondaryActions={[
        {
          content: t('ui.syncActionRefresh', { ns: 'home', defaultValue: 'Refresh status' }),
          onAction: () => refresh()
        }
      ]}
    >
      {/* 迁移提示 */}
      <Banner
        title={t('ui.syncMigrationTitle', { ns: 'home', defaultValue: 'Feature merged' })}
        status="info"
        onDismiss={() => {}}
        action={{content: t('ui.syncBackHome', { ns: 'home', defaultValue: 'Back to home' }), url: '/app'}}
      >
        <p>{t('ui.syncMigrationBody', { ns: 'home', defaultValue: 'Publishing has been merged into the home page. Use the publish buttons there.' })}</p>
      </Banner>

      <Layout>
        {/* 发布状态概览 */}
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">{t('ui.syncStatusOverview', { defaultValue: 'Publish status overview' })}</Text>
            <div style={{ marginTop: '16px' }}>
              <BlockStack gap="500">
                <ProgressBar 
                  progress={syncProgress} 
                  size="large"
                  tone={syncProgress === 100 ? "success" : "primary"}
                />
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Badge status="attention">{t('ui.syncPending', { defaultValue: 'Pending' })}: {syncStats.pending}</Badge>
                    <Badge status="info">{t('ui.syncProcessing', { defaultValue: 'Processing' })}: {syncStats.syncing}</Badge>
                    <Badge status="success">{t('ui.syncSynced', { defaultValue: 'Published' })}: {syncStats.synced}</Badge>
                    <Badge status="critical">{t('ui.syncFailed', { defaultValue: 'Failed' })}: {syncStats.failed}</Badge>
                  </InlineStack>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    {t('ui.syncTotal', { total: totalTranslations, progress: syncProgress, defaultValue: 'Total: {{total}} | Progress: {{progress}}%' })}
                  </Text>
                </InlineStack>
              </BlockStack>
            </div>
          </Card>
        </Layout.Section>
        
        {/* 发布选项 */}
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">{t('ui.syncOptions', { defaultValue: 'Publish options' })}</Text>
            <div style={{ marginTop: '16px' }}>
              <BlockStack gap="500">
                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <Select
                      label={t('ui.syncLanguageLabel', { defaultValue: 'Language' })}
                      options={[
                        { label: t('ui.syncLanguageAll', { defaultValue: 'All languages' }), value: "" },
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
                      label={t('ui.syncResourceTypeLabel', { defaultValue: 'Resource type' })}
                      options={[
                        { label: t('ui.syncResourceTypeAll', { defaultValue: 'All types' }), value: "" },
                        ...resourceTypes
                      ]}
                      value={selectedResourceType}
                      onChange={setSelectedResourceType}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label={t('ui.syncBatchLimit', { defaultValue: 'Batch limit' })}
                      options={[
                        { label: t('ui.syncBatch50', { defaultValue: '50 items' }), value: "50" },
                        { label: t('ui.syncBatch100', { defaultValue: '100 items' }), value: "100" },
                        { label: t('ui.syncBatch200', { defaultValue: '200 items' }), value: "200" },
                        { label: t('ui.syncBatch500', { defaultValue: '500 items' }), value: "500" },
                        { label: t('ui.syncBatchAll', { defaultValue: 'All' }), value: "0" }
                      ]}
                      value={syncLimit}
                      onChange={setSyncLimit}
                      helpText={t('ui.syncBatchHelp', { defaultValue: 'Max items per publish job' })}
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
                    {t('ui.syncPublishStart', { pending: syncStats.pending, defaultValue: 'Start publish ({{pending}} pending)' })}
                  </Button>
                  {syncStats.failed > 0 && (
                    <Button
                      onClick={() => setShowRetryModal(true)}
                      tone="critical"
                    >
                      {t('ui.syncRetryFailed', { failed: syncStats.failed, defaultValue: 'Retry failed ({{failed}})' })}
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
                  <Text variant="headingMd" as="h2">{t('ui.syncFailedTitle', { defaultValue: 'Recent failed publishes' })}</Text>
                  <Button plain onClick={handleClearErrors}>
                    {t('ui.syncClearErrors', { defaultValue: 'Clear error records' })}
                  </Button>
                </InlineStack>
                
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={Array.isArray(tableHeadings) ? tableHeadings : ['Resource', 'Type', 'Language', 'Error', 'Time']}
                  rows={failedRows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
        
        {/* 使用说明 */}
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">{t('ui.syncGuide', { defaultValue: 'How to use' })}</Text>
            <div style={{ marginTop: '16px' }}>
              <TextContainer>
                <Text variant="bodyMd" as="p">
                  <strong>{t('ui.syncGuideNewFlow', { defaultValue: 'New publishing flow:' })}</strong>
                </Text>
                <ol>
                  <li>{t('ui.syncGuideItem1', { defaultValue: 'Translations save locally only—no direct publish to Shopify.' })}</li>
                  <li>{t('ui.syncGuideItem2', { defaultValue: 'Use this page to publish cached translations in bulk.' })}</li>
                  <li>{t('ui.syncGuideItem3', { defaultValue: 'Filter by language or resource type.' })}</li>
                  <li>{t('ui.syncGuideItem4', { defaultValue: 'Failed publishes can be retried without losing translations.' })}</li>
                  <li>{t('ui.syncGuideItem5', { defaultValue: 'Handles Shopify 100-field limit automatically via batches.' })}</li>
                </ol>
                <Text variant="bodyMd" as="p" tone="success">
                  <strong>{t('ui.syncGuideBenefit', { defaultValue: 'Benefits:' })}</strong>
                  {` ${t('ui.syncBenefitItem1', { defaultValue: 'Avoid repeated GPT calls and lower cost; supports resumable publishing.' })}`}
                  {` ${t('ui.syncBenefitItem2', { defaultValue: 'Translate first, publish later when ready.' })}`}
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
        title={t('ui.syncConfirmRetryTitle', { defaultValue: 'Confirm retry failed publishes' })}
        primaryAction={{
          content: t('ui.syncConfirmRetryPrimary', { defaultValue: 'Confirm retry' }),
          onAction: handleRetry,
          destructive: false
        }}
        secondaryActions={[
          {
            content: t('ui.syncConfirmRetryCancel', { defaultValue: 'Cancel' }),
            onAction: () => setShowRetryModal(false)
          }
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <Text variant="bodyMd" as="p">
              {t('ui.syncConfirmRetryBody1', { count: syncStats.failed, defaultValue: 'Retrying {{count}} failed publish records.' })}
            </Text>
            <Text variant="bodyMd" as="p">
              {t('ui.syncConfirmRetryBody2', { defaultValue: 'Records will reset to pending and re-publish to Shopify.' })}
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
