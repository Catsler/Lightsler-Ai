import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
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
import { useState, useCallback, useMemo, useEffect } from 'react';
import ThemeTranslationCompare from '../components/ThemeTranslationCompare';
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const DEFAULT_LANGUAGES = [
  { code: 'zh-CN', name: '中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' }
];

// Theme资源查询监控统计
const queryMetrics = {
  uuidHit: 0,
  fileIdHit: 0,
  dualHit: 0,
  miss: 0,
  patterns: new Map(),
  missDetails: []
};

// 每小时输出统计
setInterval(() => {
  if (queryMetrics.uuidHit + queryMetrics.fileIdHit + queryMetrics.miss > 0) {
    console.log('[Theme资源查询统计]', {
      总查询次数: queryMetrics.uuidHit + queryMetrics.fileIdHit + queryMetrics.miss,
      UUID命中: queryMetrics.uuidHit,
      FileID命中: queryMetrics.fileIdHit,
      双重匹配: queryMetrics.dualHit,
      查询失败: queryMetrics.miss,
      模式分布: Object.fromEntries(queryMetrics.patterns),
      最近失败: queryMetrics.missDetails.slice(-3)
    });
  }
}, 3600000); // 1小时

// 智能双查找资源
async function findThemeResourceWithFallback(param, shopId) {
  // UUID格式检测
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

  let resourceById = null;
  let resourceByResourceId = null;

  // 智能预判查询顺序
  if (isUUID) {
    // 参数像UUID，优先按主键查找
    resourceById = await prisma.resource.findFirst({
      where: {
        id: param,
        shopId: shopId
      },
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

    // 如果主键查询失败，回退到resourceId查询
    if (!resourceById) {
      resourceByResourceId = await prisma.resource.findFirst({
        where: {
          resourceId: param,
          shopId: shopId
        },
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
    }
  } else {
    // 参数像fileId，优先按resourceId查找
    resourceByResourceId = await prisma.resource.findFirst({
      where: {
        resourceId: param,
        shopId: shopId
      },
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

    // 如果resourceId查询失败，回退到主键查询
    if (!resourceByResourceId) {
      resourceById = await prisma.resource.findFirst({
        where: {
          id: param,
          shopId: shopId
        },
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
    }
  }

  // 统计命中情况
  const foundById = !!resourceById;
  const foundByResourceId = !!resourceByResourceId;

  if (foundById && foundByResourceId) {
    // 双重命中，记录异常并优先返回主键查询结果
    queryMetrics.dualHit++;
    console.warn('[Theme查询异常] 双重命中:', { param, id: resourceById.id, resourceId: resourceByResourceId.resourceId });
    return resourceById;
  } else if (foundById) {
    queryMetrics.uuidHit++;
    return resourceById;
  } else if (foundByResourceId) {
    queryMetrics.fileIdHit++;
    // 记录fileId模式
    const pattern = param.replace(/[.\-_]\d+.*$/, '.*').replace(/\/[^\/]+$/, '/*');
    queryMetrics.patterns.set(pattern, (queryMetrics.patterns.get(pattern) || 0) + 1);
    return resourceByResourceId;
  } else {
    // 查询失败
    queryMetrics.miss++;
    // 记录miss详情（循环buffer，最多50条）
    queryMetrics.missDetails.push({
      param,
      timestamp: new Date().toISOString(),
      isUUID
    });
    if (queryMetrics.missDetails.length > 50) {
      queryMetrics.missDetails.shift();
    }
    return null;
  }
}

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { resourceId } = params;

  if (!resourceId) {
    throw new Response("资源ID参数是必需的", { status: 400 });
  }

  try {
    // 使用智能双查找机制
    const resource = await findThemeResourceWithFallback(resourceId, session.shop);

    if (!resource) {
      // 根据参数格式提供不同的错误提示
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId);
      const errorMessage = isUUID
        ? "资源已被删除或移动，请刷新资源列表"
        : "Theme文件可能已重命名，请重新扫描Theme资源";
      throw new Response(errorMessage, { status: 404 });
    }

    // 检查是否为Theme资源类型（大小写无关，使用小写匹配更稳健）
    const typeLower = String(resource.resourceType || '').toLowerCase();
    const isThemeResource = typeLower.includes('theme') || typeLower.includes('online_store');

    if (!isThemeResource) {
      throw new Response("此资源不是Theme类型", { status: 400 });
    }

    return json({
      resource,
      shop: session.shop,
      queryInfo: {
        searchParam: resourceId,
        foundBy: resource.id === resourceId ? 'uuid' : 'resourceId',
        resourceId: resource.resourceId
      }
    });
  } catch (error) {
    console.error('[Theme Detail Loader] 错误:', error);

    // 如果是Response错误，直接抛出
    if (error instanceof Response) {
      throw error;
    }

    // 系统错误，提供友好提示
    throw new Response("系统暂时无法加载资源，请稍后重试", { status: 500 });
  }
};

export default function ThemeDetailPage() {
  const { resource, queryInfo } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  // Theme资源数据归一化函数 - 提取实际的模块化数据
  const normalizeThemeFields = (fields) => {
    if (fields?.dynamicFields) {
      if (typeof fields.dynamicFields === 'string') {
        try {
          return JSON.parse(fields.dynamicFields);
        } catch (error) {
          console.warn('[Theme数据归一化] JSON解析失败:', error);
          return fields || {};
        }
      }
      return fields.dynamicFields;
    }
    return fields || {};
  };

  const contentFields = normalizeThemeFields(resource.contentFields);

  // 获取翻译统计
  const translationStats = {
    total: resource.translations?.length || 0,
    completed: resource.translations?.filter(t => t.status === 'completed').length || 0,
    synced: resource.translations?.filter(t => t.syncStatus === 'synced').length || 0
  };

  const hasTranslations = translationStats.total > 0;

  const availableLanguages = useMemo(() => {
    const languageMap = new Map(DEFAULT_LANGUAGES.map(lang => [lang.code, lang.name]));

    (resource.translations || []).forEach((translation) => {
      if (translation?.language) {
        const label = translation.languageLabel || translation.languageName || translation.language;
        languageMap.set(translation.language, label);
      }
    });

    return Array.from(languageMap.entries()).map(([code, name]) => ({
      code,
      name: name || code
    }));
  }, [resource.translations]);

  const initialTargetLanguage = useMemo(() => {
    // 首先检查URL参数
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang');
      if (urlLang) {
        console.log('[初始语言] 从URL获取:', urlLang);
        return urlLang;
      }
    }

    // 然后使用第一个非中文翻译，避免总是默认中文
    const nonChineseTranslation = resource.translations?.find(item =>
      item?.language && item.language !== 'zh-CN'
    )?.language;

    if (nonChineseTranslation) {
      console.log('[初始语言] 使用非中文翻译:', nonChineseTranslation);
      return nonChineseTranslation;
    }

    // 最后使用现有翻译或默认语言
    const existing = resource.translations?.find(item => item?.language)?.language;
    const result = existing || availableLanguages[0]?.code || 'zh-CN';
    console.log('[初始语言] 使用默认:', result);
    return result;
  }, [resource.translations, availableLanguages]);

  // 添加当前语言状态管理
  const [currentLanguage, setCurrentLanguage] = useState(initialTargetLanguage);

  // 确保 currentLanguage 跟随 initialTargetLanguage 更新
  useEffect(() => {
    if (initialTargetLanguage !== currentLanguage) {
      console.log('[语言同步] 更新状态:', currentLanguage, '->', initialTargetLanguage);
      setCurrentLanguage(initialTargetLanguage);
    }
  }, [initialTargetLanguage, currentLanguage]);

  // 智能默认视图：URL参数 > 有翻译默认compare > 无翻译默认list
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlView = urlParams.get('view');
      if (urlView === 'compare' || urlView === 'list') {
        return urlView;
      }
    }
    return hasTranslations ? 'compare' : 'list';
  });
  const canTranslate = resource.metadata?.canTranslate !== false;
  const isLoading = fetcher.state === 'submitting';

  const updateUrlView = useCallback((newView) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', newView);
      window.history.pushState({}, '', url);
    }
  }, []);

  const handleViewModeChange = useCallback((newMode) => {
    setViewMode(newMode);
    updateUrlView(newMode);
  }, [updateUrlView]);

  const handleRetranslate = useCallback(() => {
    console.log('[重新翻译] 当前语言状态:', {
      currentLanguage,
      initialTargetLanguage,
      resourceTranslations: resource.translations?.map(t => ({ language: t.language, status: t.status }))
    });
    fetcher.submit(
      {
        action: "retranslate",
        resourceId: resource.id,
        resourceType: resource.resourceType,
        language: currentLanguage
      },
      { method: "post", action: "/api/translate-queue" }
    );
  }, [resource.id, resource.resourceType, currentLanguage, initialTargetLanguage, resource.translations, fetcher]);

  const handleSync = useCallback(() => {
    fetcher.submit(
      {
        action: "sync",
        resourceId: resource.id,
        resourceType: resource.resourceType,
        language: currentLanguage
      },
      { method: "post", action: "/api/publish" }
    );
  }, [resource.id, resource.resourceType, currentLanguage, fetcher]);

  const handleDelete = useCallback(() => {
    if (confirm('确定删除所有翻译记录吗？此操作不可恢复。')) {
      fetcher.submit(
        {
          action: "delete",
          resourceId: resource.id
        },
        { method: "post", action: "/api/clear" }
      );
    }
  }, [resource.id, fetcher]);

  const handleTranslateField = useCallback((translateRequest) => {
    if (!translateRequest?.language) {
      return;
    }

    const formData = new FormData();
    formData.append('language', translateRequest.language);
    formData.append('resourceIds', JSON.stringify([resource.id]));
    formData.append('clearCache', 'false');

    fetcher.submit(formData, {
      method: "post",
      action: "/api/translate"
    });
  }, [resource.id, fetcher]);

  const handleSaveTranslations = useCallback((saveRequest) => {
    console.log('保存Theme翻译:', saveRequest);
    alert('保存功能正在开发中，目前请使用完整翻译后再同步到Shopify');
  }, []);

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
      primaryAction={canTranslate ? {
        content: '重新翻译',
        onAction: handleRetranslate,
        loading: isLoading
      } : undefined}
      secondaryActions={[
        {
          content: '同步到Shopify',
          onAction: handleSync,
          loading: isLoading,
          disabled: isLoading
        },
        {
          content: '删除翻译',
          onAction: handleDelete,
          destructive: true,
          disabled: isLoading
        }
      ]}
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

                {/* 查询信息（开发调试用） */}
                {process.env.NODE_ENV === 'development' && queryInfo && (
                  <InlineStack align="space-between">
                    <Text variant="bodySm" fontWeight="semibold">查询方式:</Text>
                    <Badge tone={queryInfo.foundBy === 'uuid' ? 'info' : 'warning'}>
                      {queryInfo.foundBy === 'uuid' ? 'UUID匹配' : 'FileID匹配'}
                    </Badge>
                  </InlineStack>
                )}
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
          <Card>
            <BlockStack gap="200">
              <Text variant="headingSm">状态信息</Text>
              <InlineStack gap="100">
                <Badge tone={resource.riskScore > 0.7 ? 'critical' : resource.riskScore > 0.4 ? 'caution' : 'success'}>
                  风险: {Math.round(resource.riskScore * 100)}%
                </Badge>
                <Badge>v{resource.contentVersion}</Badge>
                {resource.errorCount > 0 && (
                  <Badge tone="critical">错误: {resource.errorCount}</Badge>
                )}
              </InlineStack>
              {resource.lastScannedAt && (
                <Text variant="bodySm" tone="subdued">
                  最后扫描: {new Date(resource.lastScannedAt).toLocaleDateString('zh-CN')}
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {/* 翻译详情卡片 */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd">翻译详情</Text>
                {hasTranslations && (
                  <Button
                    variant="tertiary"
                    size="slim"
                    onClick={() => handleViewModeChange(viewMode === 'list' ? 'compare' : 'list')}
                  >
                    {viewMode === 'list' ? '切换到对比视图' : '切换到列表视图'}
                  </Button>
                )}
              </InlineStack>
              <Divider />
              {viewMode === 'compare' ? (
                <ThemeTranslationCompare
                  originalData={contentFields ?? {}}
                  translatedData={(() => {
                    const currentTranslation = resource.translations?.find(
                      t => t.language === currentLanguage
                    );
                    return normalizeThemeFields(currentTranslation?.translationFields);
                  })()}
                  targetLanguage={currentLanguage}
                  loading={isLoading}
                  availableLanguages={availableLanguages}
                  onTranslate={handleTranslateField}
                  onSave={handleSaveTranslations}
                  onLanguageChange={(newLang) => {
                    console.log('[语言切换] 从组件收到:', newLang, '-> 当前状态:', currentLanguage);
                    setCurrentLanguage(newLang);
                  }}
                />
              ) : (
                renderTranslations()
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
