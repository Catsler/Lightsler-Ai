import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useParams, useFetcher } from "@remix-run/react";
import { useEffect } from "react";
import { Page, Button, BlockStack, Badge, Banner, Card, Text } from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { ResourceDetail } from "../components/ResourceDetail";
import { CoverageCard } from "../components/CoverageCard";
import { ResourceDetailAdapter } from "./api.resource-detail";
import prisma from "../db.server";

/**
 * 通用资源详情页路由 - Linus哲学实现
 * 原则：一个路由处理所有资源类型，零特殊逻辑
 * 路径：/app/resource/:type/:id
 */

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { type, id } = params;
  
  if (!type || !id) {
    throw new Response("资源类型和ID是必需的", { status: 400 });
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
      throw new Response("资源未找到", { status: 404 });
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
      throw new Response("无权访问此资源", { status: 403 });
    }
    
    // 验证类型匹配
    const resourceType = resource.resourceType.toLowerCase();
    if (resourceType !== type.toLowerCase() && !resourceType.includes(type.toLowerCase())) {
      throw new Response("资源类型不匹配", { status: 400 });
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

    return json({
      resource: unifiedResource,
      currentLanguage,
      shop: session.shop,
      translatableKeys,
      coverageData
    });
    
  } catch (error) {
    console.error('[资源详情页] 错误:', error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    throw new Response("加载资源失败", { status: 500 });
  }
};

export default function ResourceDetailPage() {
  const { resource, currentLanguage, translatableKeys, coverageData, shop } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const metafieldsFetcher = useFetcher();
  const translateFetcher = useFetcher();
  const coverageFetcher = useFetcher();
  const shopQueryParam = shop ? `shop=${encodeURIComponent(shop)}` : '';

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
      showToast('翻译成功！正在刷新页面...');
      // 延迟刷新覆盖率数据，确保翻译数据已同步
      setTimeout(() => {
        coverageFetcher.load(
          `/api/resource-coverage/${resource.id}?language=${currentLanguage}${shopQueryParam ? `&${shopQueryParam}` : ''}`
        );
      }, 2000);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      return;
    }

    if (success && results.length > 0 && skippedRecords.length === results.length) {
      const skipMessage = skippedRecords[0]?.translations?.reason || message || '内容未变化，已智能跳过翻译';
      showToast(skipMessage, false);
      return;
    }

    const failure = results.find((result) => result.success === false);
    const errorMessage = failure?.error || message || '翻译失败，请重试';
    showToast(`翻译失败: ${errorMessage}`, true);
  }, [translateFetcher.type, translateFetcher.data]);

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
      content: '资源列表',
      onAction: handleBack
    },
    {
      content: resource.type.replace(/_/g, ' ').toLowerCase(),
      onAction: () => navigate(`/app?filter=${resource.type}`)
    },
    {
      content: resource.title
    }
  ];
  
  // 页面标题 - 包含图标和类型
  const pageTitle = `${resource.title}`;
  
  // 翻译Metafields处理函数
  const handleTranslateMetafields = (analyzeOnly = false) => {
    if (resource.type !== 'PRODUCT') {
      alert('只有产品资源支持Metafields翻译');
      return;
    }

    const mode = analyzeOnly ? '分析' : '翻译';
    const message = analyzeOnly
      ? `将分析产品的Metafields规则匹配情况，不会实际翻译。\n\n这有助于了解哪些内容会被翻译、哪些会被跳过以及原因。`
      : `确定要翻译产品的Metafields到${currentLanguage}吗？\n\n系统会智能识别并跳过不适合翻译的内容（如URL、代码、产品ID等）。`;

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

        let message = `✅ Metafields${isAnalyzeMode ? '分析' : '翻译'}完成!\n\n`;
        message += `📊 统计信息:\n`;
        message += `- 总计: ${stats.total} 个\n`;
        message += `- 可翻译: ${stats.translatable} 个\n`;

        if (isAnalyzeMode) {
          message += `- 跳过: ${stats.skipped} 个\n\n`;
          message += `🔍 分析模式说明:\n`;
          message += `- 此次只分析了翻译规则，未实际翻译\n`;
          message += `- 白名单内容（如custom.specifications）将被翻译\n`;
          message += `- 系统内容（如global.title_tag）会被跳过\n`;
          message += `- URL、代码、产品ID等会被智能识别并跳过\n\n`;
        } else {
          message += `- 翻译成功: ${stats.translated} 个\n`;
          message += `- 跳过: ${stats.skipped} 个\n`;
          message += `- 失败: ${stats.failed} 个\n\n`;
        }

        // 显示前5个跳过原因
        if (summary?.topReasons?.length > 0) {
          message += `📋 主要决策原因:\n`;
          summary.topReasons.slice(0, 3).forEach(([reason, count]) => {
            message += `- ${reason}: ${count} 个\n`;
          });
        }

        alert(message);
      }, 100);
    } else {
      setTimeout(() => {
        alert(`❌ ${metafieldsResult.mode === 'analyze' ? '分析' : '翻译'}失败: ${metafieldsResult.message}`);
      }, 100);
    }
  }

  // 次要操作按钮
  const secondaryActions = [
    // 只有产品资源才显示Metafields翻译按钮
    ...(resource.type === 'PRODUCT' ? [
      {
        content: isTranslating ? '处理中...' : '翻译Metafields',
        onAction: () => handleTranslateMetafields(false),
        disabled: isTranslating,
        loading: isTranslating
      },
      {
        content: isTranslating ? '分析中...' : '分析Metafields',
        onAction: handleAnalyzeMetafields,
        disabled: isTranslating,
        loading: isTranslating
      }
    ] : []),
    {
      content: '查看原始数据',
      onAction: () => {
        console.log('原始资源数据:', resource);
        alert('原始数据已输出到控制台');
      }
    },
    {
      content: '刷新',
      onAction: () => window.location.reload()
    }
  ];
  
  return (
    <Page
      backAction={{ content: '返回', onAction: handleBack }}
      title={pageTitle}
      subtitle={`类型: ${resource.type} | 语言: ${currentLanguage}`}
      secondaryActions={secondaryActions}
      titleMetadata={
        resource.metadata.errorCount > 0 && (
          <Badge tone="warning">{resource.metadata.errorCount} 个错误</Badge>
        )
      }
    >
      <BlockStack gap="400">
        {/* 错误提示 */}
        {resource.metadata.errorCount > 0 && (
          <Banner tone="warning">
            此资源有 {resource.metadata.errorCount} 个错误记录，
            风险评分: {(resource.metadata.riskScore * 100).toFixed(0)}%
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
          translatableKeys={translatableKeys}
          onTranslate={handleTranslate}
          onEdit={handleEdit}
          onViewHistory={() => console.log('查看历史：待实现')}
        />
        
        {/* 调试信息（开发环境） */}
        {process.env.NODE_ENV === 'development' && (
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd">调试信息</Text>
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
  
  return (
    <Page
      backAction={{ content: '返回', onAction: () => navigate('/app') }}
      title="错误"
    >
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" tone="critical">
            加载资源时出错
          </Text>
          <Text variant="bodyMd">
            {error?.message || '未知错误'}
          </Text>
          <Button onClick={() => window.location.reload()}>
            重试
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
