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
  Divider,
  Banner,
  Select
} from "@shopify/polaris";
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import ThemeTranslationCompare from '../components/ThemeTranslationCompare';
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSyncErrorMessage } from "../utils/sync-error-helper.js";

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

    // 获取商店语言配置（与通用路由保持一致）
    const { getShopLocales } = await import("../services/shopify-locales.server.js");
    const shopLocales = await getShopLocales(admin);
    const primaryLocale = shopLocales.find((locale) => locale.primary) || null;
    const alternateLocales = shopLocales.filter((locale) => !locale.primary);

    // 判断是否为零辅语言商店
    const hasNoSecondaryLanguages = alternateLocales.length === 0;

    // 构建支持的语言列表
    let supportedLocales = alternateLocales.map((locale) => ({
      label: locale.name || locale.locale,
      value: locale.locale,
      locale: locale.locale
    }));

    // 如果没有辅语言，从数据库回退
    if (supportedLocales.length === 0) {
      const shop = await prisma.shop.findUnique({
        where: { id: session.shop },
        include: { languages: { where: { isActive: true } } }
      });

      supportedLocales = (shop?.languages ?? [])
        .filter((lang) => !primaryLocale || lang.code !== primaryLocale.locale)
        .map((lang) => ({
          label: lang.name,
          value: lang.code,
          locale: lang.code
        }));
    }

    return json({
      resource,
      shop: session.shop,
      primaryLocale,
      supportedLocales,
      hasNoSecondaryLanguages,
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
  const { resource, queryInfo, primaryLocale, supportedLocales, hasNoSecondaryLanguages } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  // Theme资源数据归一化函数 - 提取实际的模块化数据并扁平化复杂结构
  const normalizeThemeFields = (fields) => {
    if (fields?.dynamicFields) {
      // 处理字符串格式的JSON
      let dynamicFields = fields.dynamicFields;
      if (typeof dynamicFields === 'string') {
        try {
          dynamicFields = JSON.parse(dynamicFields);
        } catch (error) {
          console.warn('[Theme数据归一化] JSON解析失败:', error);
          return fields || {};
        }
      }

      // 防御性处理：扁平化复杂嵌套结构 (兼容旧数据格式)
      // 将 { key: { value, digest, original } } 转换为 { key: value }
      const normalized = {};
      let hasComplexStructure = false;

      for (const [key, val] of Object.entries(dynamicFields)) {
        if (val && typeof val === 'object' && val.value !== undefined) {
          // 检测到旧的复杂结构
          hasComplexStructure = true;
          normalized[key] = val.value;
        } else {
          // 新格式或普通值，直接使用
          normalized[key] = val;
        }
      }

      // 记录遗留数据格式的警告
      if (hasComplexStructure) {
        console.warn('[Theme数据归一化] 检测到旧数据格式，已自动转换为扁平结构');
      }

      return normalized;
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
    // 优先级1: URL参数
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang');
      if (urlLang) {
        console.log('[初始语言] 从URL获取:', urlLang);
        return urlLang;
      }
    }

    // 优先级2: supportedLocales第一个（已排除主语言，最安全）
    if (supportedLocales && supportedLocales.length > 0) {
      const firstSupported = supportedLocales[0].value;
      console.log('[初始语言] 使用第一个支持语言:', firstSupported);
      return firstSupported;
    }

    // 优先级3: 已有翻译中的非主语言
    const nonPrimaryTranslation = resource.translations?.find(item =>
      item?.language && item.language !== primaryLocale?.locale
    )?.language;

    if (nonPrimaryTranslation) {
      console.log('[初始语言] 使用已有翻译语言:', nonPrimaryTranslation);
      return nonPrimaryTranslation;
    }

    // 优先级4: 安全兜底 - 使用 supportedLocales 或固定默认值
    const fallback = supportedLocales.find(l => l.value !== primaryLocale?.locale)?.value
          || initialTargetLanguage
          || (primaryLocale?.locale === 'en' ? 'fr' : 'en');

    if (process.env.NODE_ENV === 'development') {
      console.warn('[初始语言] 使用兜底语言:', fallback, '(主语言:', primaryLocale?.locale, ')');
    }
    return fallback;
  }, [supportedLocales, resource.translations, primaryLocale, availableLanguages]);

  // 语言状态管理 - 修复初始化时序问题
  const [currentLanguage, setCurrentLanguage] = useState('');
  const initialSetRef = useRef(false);

  // 只在首次获得 initialTargetLanguage 时设置，之后不再干扰用户选择
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] 语言配置初始化:', {
        primaryLocale: primaryLocale?.locale,
        primaryLocaleName: primaryLocale?.name,
        supportedLocales: supportedLocales?.map(l => l.value),
        initialTargetLanguage,
        currentLanguage,
        initialSetRef: initialSetRef.current
      });
    }

    if (initialTargetLanguage && !initialSetRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[语言初始化] 设置为:', initialTargetLanguage);
      }
      setCurrentLanguage(initialTargetLanguage);
      initialSetRef.current = true;
    }
  }, [initialTargetLanguage, primaryLocale, supportedLocales, currentLanguage]);

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
  // 零辅语言商店禁用翻译按钮（与通用路由保持一致）
  const canTranslate = !hasNoSecondaryLanguages && (resource.metadata?.canTranslate !== false);
  const isLoading = fetcher.state === 'submitting';
  const lastActionRef = useRef(null);

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

  const showToast = useCallback((message, isError = false) => {
    if (typeof window !== 'undefined' && window.shopify?.toast) {
      window.shopify.toast.show(message, { isError });
    } else if (isError) {
      console.error(message);
    } else {
      console.log(message);
    }
  }, []);

  const handleRetranslate = useCallback(() => {
    const targetLang = currentLanguage || initialTargetLanguage;

    if (process.env.NODE_ENV === 'development') {
      console.log('[重新翻译] 请求参数:', {
        targetLang,
        primaryLocale: primaryLocale?.locale,
        currentLanguage,
        initialTargetLanguage,
        resourceTranslations: resource.translations?.map(t => ({ language: t.language, status: t.status }))
      });
    }

    if (!targetLang) {
      showToast('请在上方"目标语言"选择框中选择翻译语言', true);
      return;
    }

    if (!primaryLocale?.locale) {
      showToast('语言配置加载失败，请刷新页面后重试', true);
      return;
    }

    if (hasNoSecondaryLanguages) {
      showToast('请先在 Shopify 后台启用目标语言后再翻译', true);
      return;
    }

    // 大小写安全的主语言校验
    const primaryCode = primaryLocale?.locale?.toLowerCase();
    const targetCode = targetLang?.toLowerCase();

    if (primaryCode && targetCode === primaryCode) {
      showToast(`不能翻译到主语言 ${primaryLocale?.name || primaryLocale?.locale}`, true);
      return;
    }

    lastActionRef.current = 'retranslate';
    fetcher.submit(
      {
        action: "retranslate",
        resourceId: resource.id,
        resourceType: resource.resourceType,
        language: targetLang
      },
      { method: "post", action: "/api/translate-queue" }
    );
  }, [resource.id, resource.resourceType, currentLanguage, initialTargetLanguage, resource.translations, fetcher, primaryLocale, hasNoSecondaryLanguages, showToast]);

  const handleSync = useCallback(() => {
    const targetLang = currentLanguage || initialTargetLanguage;

    lastActionRef.current = 'sync';
    fetcher.submit(
      {
        action: "sync",
        resourceId: resource.id,
        resourceType: resource.resourceType,
        language: targetLang
      },
      { method: "post", action: "/api/publish" }
    );
  }, [resource.id, resource.resourceType, currentLanguage, initialTargetLanguage, fetcher]);

  const handleDelete = useCallback(() => {
    if (confirm('确定删除所有翻译记录吗？此操作不可恢复。')) {
      lastActionRef.current = 'delete';
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

    if (!primaryLocale?.locale) {
      showToast('语言配置加载失败，请刷新页面后重试', true);
      return;
    }

    if (hasNoSecondaryLanguages) {
      showToast('请先在 Shopify 后台启用目标语言后再翻译', true);
      return;
    }

    // 大小写安全的主语言校验
    const primaryCode = primaryLocale?.locale?.toLowerCase();
    const requestLangCode = translateRequest.language?.toLowerCase();

    if (primaryCode && requestLangCode === primaryCode) {
      showToast(`无法翻译为主语言 ${primaryLocale?.name || primaryLocale?.locale}`, true);
      return;
    }

    const formData = new FormData();
    formData.append('language', translateRequest.language);
    formData.append('resourceIds', JSON.stringify([resource.id]));
    formData.append('clearCache', 'false');

    lastActionRef.current = 'translate-field';
    fetcher.submit(formData, {
      method: "post",
      action: "/api/translate"
    });
  }, [resource.id, fetcher, primaryLocale, hasNoSecondaryLanguages, showToast]);

  useEffect(() => {
    if (fetcher.state !== 'idle') {
      return;
    }

    const response = fetcher.data;
    const lastAction = lastActionRef.current;

    if (!lastAction || !response) {
      return;
    }

    lastActionRef.current = null;

    const { success, data, message } = response;
    const payloadMessage = message || data?.message;

    if (!success) {
      showToast(payloadMessage || '操作失败，请重试', true);
      return;
    }

    if (lastAction === 'retranslate' || lastAction === 'translate-field') {
      showToast(payloadMessage || '翻译任务已创建，正在刷新...');
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 1500);
      }
      return;
    }

    if (lastAction === 'sync') {
      showToast(payloadMessage || '同步任务已提交');
      return;
    }

    if (lastAction === 'delete') {
      showToast(payloadMessage || '翻译记录已删除');
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 600);
      }
    }
  }, [fetcher.state, fetcher.data, showToast]);

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
                  <Badge tone={
                    translation.syncStatus === 'synced' ? 'success' :
                    translation.syncStatus === 'partial' ? 'warning' :
                    translation.syncStatus === 'failed' ? 'critical' :
                    'caution'
                  }>
                    {translation.syncStatus}
                  </Badge>
                </InlineStack>
              </InlineStack>

              {/* 显示同步警告或错误信息 */}
              {(translation.syncStatus === 'partial' || translation.syncStatus === 'failed') && translation.syncError && (
                <Box paddingBlockStart="200">
                  <Text variant="bodySm" tone={translation.syncStatus === 'failed' ? 'critical' : 'caution'}>
                    {getSyncErrorMessage(translation.syncError)}
                  </Text>
                </Box>
              )}

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
            {/* 零辅语言警告Banner */}
            {hasNoSecondaryLanguages && (
              <Banner
                title="当前商店未配置次要语言"
                tone="warning"
                onDismiss={undefined}
              >
                <p>
                  您的商店目前只配置了主语言 ({primaryLocale?.name || primaryLocale?.locale || '未知'})，
                  无法进行翻译操作。请先在 Shopify 设置中添加目标语言。
                </p>
              </Banner>
            )}

            {/* 目标语言选择器 - 始终可见 */}
            {!hasNoSecondaryLanguages && supportedLocales && supportedLocales.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">目标语言</Text>
                  <Select
                    label="选择翻译目标语言"
                    options={[
                      ...supportedLocales.map(lang => ({
                        label: lang.label,
                        value: lang.value
                      })),
                      ...(primaryLocale ? [{
                        label: `${primaryLocale.name || primaryLocale.locale} (主语言 - 不可翻译)`,
                        value: primaryLocale.locale,
                        disabled: true
                      }] : [])
                    ]}
                    value={currentLanguage || initialTargetLanguage || ''}
                    onChange={(value) => {
                      console.log('[语言选择器] 切换语言:', currentLanguage, '->', value);
                      setCurrentLanguage(value);
                    }}
                  />
                  {(currentLanguage || initialTargetLanguage) && (
                    <Text variant="bodySm" tone="subdued">
                      当前将翻译到: {supportedLocales.find(l => l.value === (currentLanguage || initialTargetLanguage))?.label || currentLanguage || initialTargetLanguage}
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}

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
                    const targetLang = currentLanguage || initialTargetLanguage;
                    const currentTranslation = resource.translations?.find(
                      t => t.language === targetLang
                    );
                    return normalizeThemeFields(currentTranslation?.translationFields);
                  })()}
                  targetLanguage={currentLanguage || initialTargetLanguage}
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
