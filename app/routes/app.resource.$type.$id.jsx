/* eslint-disable react-hooks/exhaustive-deps, no-unused-vars, no-console */
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useParams, useFetcher } from "@remix-run/react";
import { useEffect } from "react";
import { Page, Button, BlockStack, Badge, Banner, Card, Text } from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { ResourceDetail } from "../components/ResourceDetail";
import { CoverageCard } from "../components/CoverageCard";
import { ResourceDetailAdapter } from "./api.resource-detail";
import prisma from "../db.server";
import { useAppRefresh } from "../utils/use-app-refresh.client";
import { getResourceDisplayTitle, getResourceDisplayDescription } from "../utils/resource-display-helpers";
import { subscriptionManager } from "../services/subscription-manager.server.js";
import { creditManager } from "../services/credit-manager.server.js";
import { checkLocaleLimit } from "../services/shopify-locales.server.js";
import { SAFE_PLANS, ULTRA_PLANS } from "../utils/pricing-config.js";

/**
 * 通用资源详情页路由 - Linus哲学实现
 * 原则：一个路由处理所有资源类型，零特殊逻辑
 * 路径：/app/resource/:type/:id
 */

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { type, id } = params;
  
  if (!type || !id) {
    throw new Response("Resource type and ID are required", { status: 400 });
  }
  
  try {
    // 统一查询 - 不管什么资源类型，查询逻辑相同
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        translations: {
          orderBy: { updatedAt: 'desc' }
        },
        errorLogs: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!resource) {
      throw new Response("Resource not found", { status: 404 });
    }
    
    // 验证权限 - 智能匹配shopId（兼容不同格式）
    const normalizeShopId = (id) => {
      if (!id) return '';
      // 移除 .myshopify.com 后缀进行比较
      return id.replace(/\.myshopify\.com$/, '').toLowerCase();
    };

    if (normalizeShopId(resource.shopId) !== normalizeShopId(session.shop)) {
      console.error('[AUTH] Shop mismatch:', {
        resourceShopId: resource.shopId,
        sessionShop: session.shop,
        normalized: {
          resource: normalizeShopId(resource.shopId),
          session: normalizeShopId(session.shop)
        }
      });
      throw new Response("Forbidden: you do not have access to this resource", { status: 403 });
    }
    
    // 验证类型匹配
    const resourceType = resource.resourceType.toLowerCase();
    if (resourceType !== type.toLowerCase() && !resourceType.includes(type.toLowerCase())) {
      throw new Response("Resource type mismatch", { status: 400 });
    }
    
    // 使用适配器转换为统一格式
    const adapter = new ResourceDetailAdapter(resource);
    const unifiedResource = adapter.transform();
    
    // 动态发现可译字段 keys（以 GraphQL translatableResource 为准）
    let translatableKeys = [];
    try {
      const gid = unifiedResource?.fields?.standard?.gid;
      if (gid) {
        const { executeGraphQLWithRetry, TRANSLATABLE_RESOURCE_QUERY } = await import("../services/shopify-graphql.server.js");
        const data = await executeGraphQLWithRetry(admin, TRANSLATABLE_RESOURCE_QUERY, { resourceId: gid });
        const content = data?.data?.translatableResource?.translatableContent || [];
        translatableKeys = content.map(item => item.key);
      }
    } catch (e) {
      console.warn('[资源详情页] 获取translatable keys失败，使用回退策略:', e?.message);
    }
    
    // 获取URL参数中的语言
    const url = new URL(request.url);
    const currentLanguage = url.searchParams.get('lang') || 'zh-CN';

    // 获取资源覆盖率数据（失败不阻塞页面）
    let coverageData = null;
    try {
      const { getResourceCoverage } = await import("../services/language-coverage.server.js");
      coverageData = await getResourceCoverage(
        session.shop,
        resource.id,
        currentLanguage
      );
    } catch (error) {
      console.warn('[资源覆盖率] 获取失败，页面降级展示:', error.message);
      // 不抛出错误，允许页面继续渲染
    }

    // 计算套餐与额度
    const [limitCheck, subscription, credits] = await Promise.all([
      checkLocaleLimit(admin),
      subscriptionManager.getSubscription(session.shop),
      creditManager.getAvailableCredits(session.shop).catch(() => null)
    ]);

    const ALL_PLANS = [...ULTRA_PLANS, ...SAFE_PLANS];
    const freePlanLimit = ALL_PLANS.find(p => p.name?.toLowerCase() === 'free')?.maxLanguages ?? 2;
    let planLimit = freePlanLimit;
    if (subscription?.plan && subscription?.status === 'active') {
      const maxLanguages = subscription.plan.maxLanguages;
      if (typeof maxLanguages === 'number' && Number.isFinite(maxLanguages)) {
        planLimit = maxLanguages;
      } else {
        const planName = (subscription.plan.name || '').toLowerCase();
        const planFromConfig = ALL_PLANS.find(p => p.name?.toLowerCase() === planName);
        const configMax = planFromConfig?.maxLanguages;
        if (typeof configMax === 'number' && Number.isFinite(configMax)) {
          planLimit = configMax;
        } else if (configMax === null || maxLanguages === null) {
          planLimit = Number.POSITIVE_INFINITY;
        } else {
          planLimit = freePlanLimit;
        }
      }
    }
    const planUsed = limitCheck?.totalLocales || 0;

    return json({
      resource: unifiedResource,
      currentLanguage,
      shop: session.shop,
      translatableKeys,
      coverageData,
      billing: {
        planLimit,
        planUsed,
        remainingCredits: credits?.remaining || 0
      }
    });
    
  } catch (error) {
    console.error('[资源详情页] 错误:', error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    throw new Response("Failed to load resource", { status: 500 });
  }
};

export default function ResourceDetailPage() {
  const { resource, currentLanguage, translatableKeys, coverageData, shop, billing } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const metafieldsFetcher = useFetcher();
  const translateFetcher = useFetcher();
  const coverageFetcher = useFetcher();
  const { refresh } = useAppRefresh(); // App Bridge 安全刷新
  const shopQueryParam = shop ? `shop=${encodeURIComponent(shop)}` : '';
  const { t, i18n } = useTranslation(['home', 'common']);

  const displayTitle = getResourceDisplayTitle(resource, i18n.language, t);
  const displayDescription = getResourceDisplayDescription(resource, i18n.language, t);

  // 合并覆盖率数据（优先使用 fetcher 的最新数据）
  const displayCoverageData = coverageFetcher.data?.success
    ? coverageFetcher.data.data
    : coverageData;

  // 处理返回导航
  const handleBack = () => {
    // 保持语言参数
    const lang = searchParams.get('lang');
    const backUrl = lang ? `/app?lang=${lang}` : '/app';
    navigate(backUrl);
  };

  // 处理翻译操作
  const handleTranslate = () => {
    const urlLanguage = searchParams.get('lang') || 'zh-CN';
    const translations = resource.translations || {};

    // 通过不区分大小写的匹配方式查找已存在的翻译记录
    const matchedEntry = Object.entries(translations).find(([key]) => key.toLowerCase() === urlLanguage.toLowerCase());
    const matchedLanguageKey = matchedEntry?.[0];
    const translationRecord = matchedEntry?.[1];

    const status = translationRecord?.status?.toLowerCase();
    const syncStatus = translationRecord?.syncStatus?.toLowerCase();
    const isRetranslate = status === 'completed' || status === 'synced' || syncStatus === 'synced';
    const targetLanguage = matchedLanguageKey || urlLanguage;

    translateFetcher.submit(
      {
        language: targetLanguage,
        resourceIds: JSON.stringify([resource.id]),
        clearCache: isRetranslate ? 'true' : 'false',
        forceRelatedTranslation: 'true',
        userRequested: 'true',
        shop
      },
      {
        method: 'POST',
        action: shopQueryParam ? `/api/translate?${shopQueryParam}` : '/api/translate'
      }
    );
  };

  // 监听翻译状态变化，提供用户反馈
  useEffect(() => {
    if (translateFetcher.type !== 'done' || !translateFetcher.data) {
      return;
    }

    const { success, message, data } = translateFetcher.data;
    const results = data?.results || [];
    const translatedRecords = results.filter((result) => result.success && result.translations && result.translations.skipped !== true);
    const skippedRecords = results.filter((result) => result.translations?.skipped);
    const hasFailures = results.some((result) => result.success === false);

    const showToast = (text, isError = false) => {
      if (typeof shopify !== 'undefined' && shopify?.toast) {
        shopify.toast.show(text, { isError });
      } else if (isError) {
        console.error(text);
      } else {
        console.log(text);
      }
    };

    if (success && translatedRecords.length > 0 && !hasFailures) {
      showToast(t('home:toasts.translationCreated', { defaultValue: 'Translation task created, refreshing...' }));
      // 延迟刷新覆盖率数据，确保翻译数据已同步
      setTimeout(() => {
        coverageFetcher.load(
          `/api/resource-coverage/${resource.id}?language=${currentLanguage}${shopQueryParam ? `&${shopQueryParam}` : ''}`
        );
      }, 2000);
      setTimeout(() => {
        refresh(); // 使用 App Bridge 安全刷新
      }, 1000);
      return;
    }

    if (success && results.length > 0 && skippedRecords.length === results.length) {
      const skipMessage = skippedRecords[0]?.translations?.reason || message || t('home:logs.translationNoResources', { defaultValue: 'Content unchanged, skipped translation.' });
      showToast(skipMessage, false);
      return;
    }

    const failure = results.find((result) => result.success === false);
    const errorMessage = failure?.error || message || t('home:logs.translationFailed', { defaultValue: 'Translation failed, please retry' });
    showToast(t('home:logs.translationFailed', { error: errorMessage, defaultValue: `Translation failed: ${errorMessage}` }), true);
  }, [translateFetcher.type, translateFetcher.data, t]);

  // 处理编辑操作
  const handleEdit = () => {
    // 根据资源类型跳转到Shopify编辑页面
    if (resource.fields.standard.gid) {
      // 使用Shopify Admin深度链接
      const gid = resource.fields.standard.gid;
      const adminUrl = `shopify://admin/${gid.replace('gid://shopify/', '').toLowerCase()}`;
      window.open(adminUrl, '_blank');
    }
  };
  
  // 面包屑导航数据
  const breadcrumbs = [
    {
      content: t('navigation.resourceList', { ns: 'home', defaultValue: 'Resource list' }),
      onAction: handleBack
    },
    {
      content: resource.type.replace(/_/g, ' ').toLowerCase(),
      onAction: () => navigate(`/app?filter=${resource.type}`)
    },
    {
      content: displayTitle
    }
  ];

  // 页面标题 - 包含图标和类型
  const pageTitle = displayTitle;
  
  // 翻译Metafields处理函数
  const handleTranslateMetafields = (analyzeOnly = false) => {
    if (resource.type !== 'PRODUCT') {
      alert(t('home:toasts.translateMetafieldsNotSupported', { defaultValue: 'Only product resources support metafields translation.' }));
      return;
    }

    const mode = analyzeOnly ? t('home:actions.analyzeMetafields', { defaultValue: 'Analyze metafields' }) : t('home:actions.translateMetafields', { defaultValue: 'Translate metafields' });
    const message = analyzeOnly
      ? t('home:toasts.metafieldsAnalyzePrompt', { defaultValue: 'Analyze metafields matching rules only. No translation will be performed. This helps you understand what will be translated or skipped.' })
      : t('home:toasts.metafieldsTranslatePrompt', { language: currentLanguage, defaultValue: `Translate product metafields to ${currentLanguage}? The system will skip URLs, code, IDs, etc.` });

    const confirmed = confirm(message);
    if (!confirmed) return;

    const formData = new FormData();
    formData.append('productGid', resource.fields.standard.gid);
    formData.append('targetLanguage', currentLanguage);
    formData.append('analyzeOnly', analyzeOnly.toString());
    if (shop) {
      formData.append('shop', shop);
    }

    metafieldsFetcher.submit(formData, {
      method: 'POST',
      action: shopQueryParam ? `/api/translate-product-metafields?${shopQueryParam}` : '/api/translate-product-metafields'
    });
  };

  // 分析Metafields处理函数
  const handleAnalyzeMetafields = () => {
    handleTranslateMetafields(true);
  };

  // 处理翻译结果
  const metafieldsResult = metafieldsFetcher.data;
  const isTranslating = metafieldsFetcher.state === 'submitting' || metafieldsFetcher.state === 'loading';

  // 显示翻译结果
  if (metafieldsResult && metafieldsFetcher.state === 'idle') {
    if (metafieldsResult.success) {
      // 使用setTimeout确保在下一个事件循环中执行，避免渲染冲突
      setTimeout(() => {
        const { mode, stats, summary } = metafieldsResult;
        const isAnalyzeMode = mode === 'analyze';

        let message = `✅ ${isAnalyzeMode ? 'Metafields analysis' : 'Metafields translation'} completed!\n\n`;
        message += `📊 Stats:\n`;
        message += `- Total: ${stats.total}\n`;
        message += `- Translatable: ${stats.translatable}\n`;

        if (isAnalyzeMode) {
          message += `- Skipped: ${stats.skipped}\n\n`;
          message += `🔍 Analysis notes:\n`;
          message += `- Rules only, no actual translation\n`;
          message += `- Whitelisted fields (e.g., custom.specifications) will be translated\n`;
          message += `- System fields (e.g., global.title_tag) are skipped\n`;
          message += `- URLs, code, IDs are intelligently skipped\n\n`;
        } else {
          message += `- Translated: ${stats.translated}\n`;
          message += `- Skipped: ${stats.skipped}\n`;
          message += `- Failed: ${stats.failed}\n\n`;
        }

        // 显示前5个跳过原因
        if (summary?.topReasons?.length > 0) {
          message += `📋 Top reasons:\n`;
          summary.topReasons.slice(0, 3).forEach(([reason, count]) => {
            message += `- ${reason}: ${count}\n`;
          });
        }

        alert(message);
      }, 100);
    } else {
      setTimeout(() => {
        alert(`❌ ${metafieldsResult.mode === 'analyze' ? 'Analyze' : 'Translate'} failed: ${metafieldsResult.message}`);
      }, 100);
    }
  }

  // 次要操作按钮
  const secondaryActions = [
    // 只有产品资源才显示Metafields翻译按钮
    ...(resource.type === 'PRODUCT' ? [
      {
        content: isTranslating ? t('home:actions.processing', { defaultValue: 'Processing...' }) : t('home:actions.translateMetafields', { defaultValue: 'Translate metafields' }),
        onAction: () => handleTranslateMetafields(false),
        disabled: isTranslating,
        loading: isTranslating
      },
      {
        content: isTranslating ? t('home:actions.analyzing', { defaultValue: 'Analyzing...' }) : t('home:actions.analyzeMetafields', { defaultValue: 'Analyze metafields' }),
        onAction: handleAnalyzeMetafields,
        disabled: isTranslating,
        loading: isTranslating
      }
    ] : []),
    {
      content: t('home:actions.viewRaw', { defaultValue: 'View raw data' }),
      onAction: () => {
        console.log('原始资源数据:', resource);
        alert(t('home:toasts.viewRawOutput', { defaultValue: 'Raw data has been printed to console.' }));
      }
    },
    {
      content: t('home:actions.refresh', { defaultValue: 'Refresh' }),
      onAction: () => refresh() // 使用 App Bridge 安全刷新
    }
  ];
  
  return (
    <Page
      backAction={{ content: t('home:ui.back', { defaultValue: 'Back' }), onAction: handleBack }}
      title={pageTitle}
      subtitle={t('home:ui.subtitle', { type: resource.type, language: currentLanguage, defaultValue: `Type: ${resource.type} | Language: ${currentLanguage}` })}
      secondaryActions={secondaryActions}
      titleMetadata={
        resource.metadata.errorCount > 0 && (
          <Badge tone="warning">{t('home:ui.errorCount', { count: resource.metadata.errorCount, defaultValue: `${resource.metadata.errorCount} errors` })}</Badge>
        )
      }
    >
      <BlockStack gap="400">
        {/* 错误提示 */}
        {resource.metadata.errorCount > 0 && (
          <Banner tone="warning">
            {t('home:resources.errorSummary', {
              count: resource.metadata.errorCount,
              risk: (resource.metadata.riskScore * 100).toFixed(0),
              defaultValue: `This resource has ${resource.metadata.errorCount} error records, risk score: ${(resource.metadata.riskScore * 100).toFixed(0)}%`
            })}
          </Banner>
        )}

        {/* 覆盖率信息卡片 - 置于错误提示后，主要内容前 */}
        {displayCoverageData && (
          <CoverageCard
            data={displayCoverageData}
            onRefresh={() => {
              coverageFetcher.load(
                `/api/resource-coverage/${resource.id}?language=${currentLanguage}${shopQueryParam ? `&${shopQueryParam}` : ''}`
              );
            }}
            isRefreshing={coverageFetcher.state === 'loading'}
          />
        )}

        {/* 主要内容 - 使用通用组件 */}
        <ResourceDetail
          resource={{
            ...resource,
            metadata: {
              ...resource.metadata,
              // 控制按钮状态：翻译进行中时禁用按钮
              canTranslate: resource.metadata.canTranslate && translateFetcher.state === 'idle'
            }
          }}
          currentLanguage={currentLanguage}
          billingInfo={billing}
          translatableKeys={translatableKeys}
          onTranslate={handleTranslate}
          onEdit={handleEdit}
          onViewHistory={() => console.log('查看历史：待实现')}
        />
        
        {/* 调试信息（开发环境） */}
        {process.env.NODE_ENV === 'development' && (
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd">Debug info</Text>
              <Text variant="bodySm" tone="subdued">
                资源ID: {resource.id}
              </Text>
              <Text variant="bodySm" tone="subdued">
                GID: {resource.fields.standard.gid}
              </Text>
              <Text variant="bodySm" tone="subdued">
                内容哈希: {resource.metadata.contentHash}
              </Text>
              <Text variant="bodySm" tone="subdued">
                路由参数: type={params.type}, id={params.id}
              </Text>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

// 错误边界
export function ErrorBoundary({ error }) {
  const navigate = useNavigate();
  const { refresh } = useAppRefresh(); // App Bridge 安全刷新
  const { t } = useTranslation(['common', 'home']);

  return (
    <Page
      backAction={{ content: t('common:actions.back'), onAction: () => navigate('/app') }}
      title={t('common:ui.error')}
    >
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" tone="critical">
            {t('home:resources.loadFailed')}
          </Text>
          <Text variant="bodyMd">
            {error?.message || t('common:ui.unknownError')}
          </Text>
          <Button onClick={() => refresh()}>
            {t('common:actions.retry')}
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
