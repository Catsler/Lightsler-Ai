/* eslint-disable react-hooks/exhaustive-deps, no-unused-vars, no-console */
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
  Select,
  Box
} from "@shopify/polaris";
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import ThemeTranslationCompare from '../components/ThemeTranslationCompare';
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSyncErrorMessage } from "../utils/sync-error-helper.js";
import { useAppRefresh } from "../utils/use-app-refresh.client";
import { useTranslation } from "react-i18next";
import { getResourceDisplayTitle, getResourceDisplayDescription } from "../utils/resource-display-helpers";

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
  const { hardRefresh } = useAppRefresh(); // 使用 hardRefresh 清除主题缓存
  const { t, i18n } = useTranslation(['home', 'languages']);

  const displayTitle = getResourceDisplayTitle(resource, i18n.language, t);
  const displayDescription = getResourceDisplayDescription(resource, i18n.language, t);

  const defaultLanguages = useMemo(() => ([
    { code: 'zh-CN', name: t('languageList.zh-CN', { ns: 'home', defaultValue: 'Chinese (Simplified)' }) },
    { code: 'en', name: t('languageList.en', { ns: 'home', defaultValue: 'English' }) },
    { code: 'ja', name: t('languageList.ja', { ns: 'home', defaultValue: 'Japanese' }) }
  ]), [t]);

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
    const languageMap = new Map(defaultLanguages.map(lang => [lang.code, lang.name]));

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
  }, [defaultLanguages, resource.translations]);

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
      showToast(t('toasts.selectTargetLanguage', { ns: 'home' }), true);
      return;
    }

    if (!primaryLocale?.locale) {
      showToast(t('toasts.configLoadFailed', { ns: 'home' }), true);
      return;
    }

    if (hasNoSecondaryLanguages) {
      showToast(t('toasts.enableSecondaryLanguage', { ns: 'home' }), true);
      return;
    }

    // 大小写安全的主语言校验
    const primaryCode = primaryLocale?.locale?.toLowerCase();
    const targetCode = targetLang?.toLowerCase();

    if (primaryCode && targetCode === primaryCode) {
      showToast(t('toasts.cannotTranslatePrimary', { ns: 'home', language: primaryLocale?.name || primaryLocale?.locale }), true);
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
    if (confirm(t('home:toasts.confirmDelete', { defaultValue: 'Are you sure you want to delete all translations? This cannot be undone.' }))) {
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
      showToast(t('home:toasts.configLoadFailed'), true);
      return;
    }

    if (hasNoSecondaryLanguages) {
      showToast(t('home:toasts.enableSecondaryLanguage'), true);
      return;
    }

    // 大小写安全的主语言校验
    const primaryCode = primaryLocale?.locale?.toLowerCase();
    const requestLangCode = translateRequest.language?.toLowerCase();

    if (primaryCode && requestLangCode === primaryCode) {
      showToast(t('home:toasts.cannotTranslatePrimary', { language: primaryLocale?.name || primaryLocale?.locale }), true);
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
      showToast(payloadMessage || t('home:toasts.genericError', { defaultValue: 'Operation failed, please retry' }), true);
      return;
    }

    if (lastAction === 'retranslate' || lastAction === 'translate-field') {
      showToast(payloadMessage || t('home:toasts.translationCreated', { defaultValue: 'Translation task created, refreshing...' }));
      setTimeout(() => hardRefresh(), 1500);
      return;
    }

    if (lastAction === 'sync') {
      showToast(payloadMessage || t('home:toasts.syncSubmitted', { defaultValue: 'Sync task submitted' }));
      return;
    }

    if (lastAction === 'delete') {
      showToast(payloadMessage || t('home:toasts.translationDeleted', { defaultValue: 'Translation record deleted' }));
      setTimeout(() => hardRefresh(), 600);
    }
  }, [fetcher.state, fetcher.data, showToast]);

  const handleSaveTranslations = useCallback((saveRequest) => {
    console.log('保存Theme翻译:', saveRequest);
    alert(t('home:toasts.saveUnsupported', { defaultValue: 'Saving is not supported here. Please complete translation and sync to Shopify.' }));
  }, [t]);

  // 渲染翻译列表
  const renderTranslations = () => {
    if (!resource.translations || resource.translations.length === 0) {
      return (
        <Text variant="bodySm" tone="subdued">
          {t('ui.noTranslations', { ns: 'home', defaultValue: 'No translation records' })}
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
                  <Text variant="bodySm" fontWeight="semibold">{t('ui.titleTranslation', { ns: 'home', defaultValue: 'Title translation:' })}</Text>
                  <Text variant="bodySm">{translation.titleTrans}</Text>
                </InlineStack>
              )}
              
              {translation.descTrans && (
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">{t('ui.descriptionTranslation', { ns: 'home', defaultValue: 'Description translation:' })}</Text>
                  <Text variant="bodySm" truncate>{translation.descTrans}</Text>
                </InlineStack>
              )}

              {/* Theme特定翻译字段 */}
              {translation.translationFields && (
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold">{t('ui.themeFieldTranslation', { ns: 'home', defaultValue: 'Theme field translation:' })}</Text>
                  <Text variant="bodyXs" tone="subdued">
                    {JSON.stringify(translation.translationFields, null, 2)}
                  </Text>
                </BlockStack>
              )}

              {/* 质量评分 */}
              {translation.qualityScore > 0 && (
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">{t('ui.qualityScore', { ns: 'home', defaultValue: 'Quality score:' })}</Text>
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
      title={t('ui.themeResourceTitle', { ns: 'home', defaultValue: 'Theme resource: {{title}}', title: displayTitle || resource.resourceId })}
      titleMetadata={<Badge tone="info">{resource.resourceType}</Badge>}
      backAction={{
        content: t('actions.back', { ns: 'home', defaultValue: 'Back' }),
        icon: ArrowLeftIcon,
        onAction: () => navigate('/app')
      }}
      primaryAction={canTranslate ? {
        content: t('actions.retranslate', { ns: 'home', defaultValue: 'Retranslate' }),
        onAction: handleRetranslate,
        loading: isLoading
      } : undefined}
      secondaryActions={[
        {
          content: t('actions.syncShopify', { ns: 'home', defaultValue: 'Sync to Shopify' }),
          onAction: handleSync,
          loading: isLoading,
          disabled: isLoading
        },
        {
          content: t('actions.deleteTranslation', { ns: 'home', defaultValue: 'Delete translation' }),
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
                title={t('banner.noSecondaryTitle', { ns: 'home' })}
                tone="warning"
                onDismiss={undefined}
              >
                <p>
                  {t('banner.noSecondaryDescription', {
                    ns: 'home',
                    language: primaryLocale?.name || primaryLocale?.locale || 'unknown'
                  })}
                </p>
              </Banner>
            )}

            {/* 目标语言选择器 - 始终可见 */}
            {!hasNoSecondaryLanguages && supportedLocales && supportedLocales.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">{t('ui.targetLanguage', { ns: 'home' })}</Text>
                  <Select
                    label={t('ui.chooseTargetLanguage', { ns: 'home', defaultValue: 'Choose the target language' })}
                    options={[
                      ...supportedLocales.map(lang => ({
                        label: lang.label,
                        value: lang.value
                      })),
                      ...(primaryLocale ? [{
                        label: `${primaryLocale.name || primaryLocale.locale} (${t('ui.primaryLanguageDisabled', { ns: 'home', defaultValue: 'Primary language - not translatable' })})`,
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
                      {t('ui.translationTargetLabel', {
                        ns: 'home',
                        label: supportedLocales.find(l => l.value === (currentLanguage || initialTargetLanguage))?.label || currentLanguage || initialTargetLanguage,
                        defaultValue: `Translating to: ${currentLanguage || initialTargetLanguage}`
                      })}
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* 基本信息卡片 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">{t('ui.basicInfo', { ns: 'home', defaultValue: 'Basic info' })}</Text>
                
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">{t('ui.resourceId', { ns: 'home', defaultValue: 'Resource ID:' })}</Text>
                  <Text variant="bodySm">{resource.resourceId}</Text>
                </InlineStack>
                
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">{t('ui.resourceType', { ns: 'home', defaultValue: 'Resource type:' })}</Text>
                  <Badge tone="info">{resource.resourceType}</Badge>
                </InlineStack>
                
                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">{t('ui.status', { ns: 'home', defaultValue: 'Status:' })}</Text>
                  <Badge tone={resource.status === 'completed' ? 'success' : 'warning'}>
                    {resource.status}
                  </Badge>
                </InlineStack>

                <InlineStack align="space-between">
                  <Text variant="bodySm" fontWeight="semibold">Shopify GID:</Text>
                  <Text variant="bodySm" truncate>{resource.gid}</Text>
                </InlineStack>

                {displayTitle && (
                  <InlineStack align="space-between">
                    <Text variant="bodySm" fontWeight="semibold">{t('ui.titleTranslation', { ns: 'home', defaultValue: 'Title:' })}</Text>
                    <Text variant="bodySm">{displayTitle}</Text>
                  </InlineStack>
                )}

                {displayDescription && (
                  <BlockStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">{t('ui.descriptionTranslation', { ns: 'home', defaultValue: 'Description:' })}</Text>
                    <Text variant="bodySm">{displayDescription}</Text>
                  </BlockStack>
                )}

                {/* 查询信息（开发调试用） */}
                {process.env.NODE_ENV === 'development' && queryInfo && (
                  <InlineStack align="space-between">
                    <Text variant="bodySm" fontWeight="semibold">{t('ui.queryMode', { ns: 'home', defaultValue: 'Query mode:' })}</Text>
                    <Badge tone={queryInfo.foundBy === 'uuid' ? 'info' : 'warning'}>
                      {queryInfo.foundBy === 'uuid' ? 'UUID' : 'FileID'}
                    </Badge>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>

            {/* 翻译统计卡片 */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">{t('ui.translationStats', { ns: 'home', defaultValue: 'Translation stats' })}</Text>
                <InlineStack gap="400">
                  <InlineStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">{t('ui.total', { ns: 'home', defaultValue: 'Total:' })}</Text>
                    <Badge>{translationStats.total}</Badge>
                  </InlineStack>
                  <InlineStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">{t('ui.completed', { ns: 'home', defaultValue: 'Completed:' })}</Text>
                    <Badge tone="success">{translationStats.completed}</Badge>
                  </InlineStack>
                  <InlineStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold">{t('ui.synced', { ns: 'home', defaultValue: 'Synced:' })}</Text>
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
              <Text variant="headingSm">{t('ui.status', { ns: 'home', defaultValue: 'Status' })}</Text>
              <InlineStack gap="100">
                <Badge tone={resource.riskScore > 0.7 ? 'critical' : resource.riskScore > 0.4 ? 'caution' : 'success'}>
                  {t('ui.risk', { ns: 'home', defaultValue: 'Risk' })}: {Math.round(resource.riskScore * 100)}%
                </Badge>
                <Badge>v{resource.contentVersion}</Badge>
                {resource.errorCount > 0 && (
                  <Badge tone="critical">{t('ui.errors', { ns: 'home', defaultValue: 'Errors' })}: {resource.errorCount}</Badge>
                )}
              </InlineStack>
              {resource.lastScannedAt && (
                <Text variant="bodySm" tone="subdued">
                  {t('ui.lastScan', { ns: 'home', defaultValue: 'Last scan: {{date}}', date: new Date(resource.lastScannedAt).toLocaleDateString() })}
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
                <Text variant="headingMd">{t('ui.translationDetails', { ns: 'home', defaultValue: 'Translation details' })}</Text>
                {hasTranslations && (
                  <Button
                    variant="tertiary"
                    size="slim"
                    onClick={() => handleViewModeChange(viewMode === 'list' ? 'compare' : 'list')}
                  >
                    {viewMode === 'list'
                      ? t('ui.switchToCompare', { ns: 'home', defaultValue: 'Switch to compare view' })
                      : t('ui.switchToList', { ns: 'home', defaultValue: 'Switch to list view' })}
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
