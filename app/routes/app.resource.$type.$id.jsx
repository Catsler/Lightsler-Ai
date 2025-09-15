import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useParams, useFetcher } from "@remix-run/react";
import { Page, Button, BlockStack, Badge, Banner, Card, Text } from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { ResourceDetail } from "../components/ResourceDetail";
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
    
    // 验证权限
    if (resource.shopId !== session.shop) {
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
    
    return json({
      resource: unifiedResource,
      currentLanguage,
      shop: session.shop,
      translatableKeys
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
  const { resource, currentLanguage, translatableKeys } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const metafieldsFetcher = useFetcher();

  // 处理返回导航
  const handleBack = () => {
    // 保持语言参数
    const lang = searchParams.get('lang');
    const backUrl = lang ? `/app?lang=${lang}` : '/app';
    navigate(backUrl);
  };

  // 处理翻译操作
  const handleTranslate = () => {
    const lang = searchParams.get('lang') || 'zh-CN';
    // 调用翻译API
    navigate(`/app/translate?resourceId=${resource.id}&targetLang=${lang}`);
  };

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
  const handleTranslateMetafields = () => {
    if (resource.type !== 'PRODUCT') {
      alert('只有产品资源支持Metafields翻译');
      return;
    }

    const confirmed = confirm(`确定要翻译产品的Metafields到${currentLanguage}吗？`);
    if (!confirmed) return;

    const formData = new FormData();
    formData.append('productGid', resource.fields.standard.gid);
    formData.append('targetLanguage', currentLanguage);

    metafieldsFetcher.submit(formData, {
      method: 'POST',
      action: '/api/translate-product-metafields'
    });
  };

  // 处理翻译结果
  const metafieldsResult = metafieldsFetcher.data;
  const isTranslating = metafieldsFetcher.state === 'submitting' || metafieldsFetcher.state === 'loading';

  // 显示翻译结果
  if (metafieldsResult && metafieldsFetcher.state === 'idle') {
    if (metafieldsResult.success) {
      // 使用setTimeout确保在下一个事件循环中执行，避免渲染冲突
      setTimeout(() => {
        alert(`✅ Metafields翻译完成!\n\n统计信息:\n- 总计: ${metafieldsResult.stats.total} 个\n- 可翻译: ${metafieldsResult.stats.translatable} 个\n- 成功: ${metafieldsResult.stats.success} 个\n- 失败: ${metafieldsResult.stats.failed} 个`);
      }, 100);
    } else {
      setTimeout(() => {
        alert(`❌ 翻译失败: ${metafieldsResult.message}`);
      }, 100);
    }
  }

  // 次要操作按钮
  const secondaryActions = [
    // 只有产品资源才显示Metafields翻译按钮
    ...(resource.type === 'PRODUCT' ? [{
      content: isTranslating ? '翻译中...' : '翻译Metafields',
      onAction: handleTranslateMetafields,
      disabled: isTranslating,
      loading: isTranslating
    }] : []),
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
        
        {/* 主要内容 - 使用通用组件 */}
        <ResourceDetail 
          resource={resource} 
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
