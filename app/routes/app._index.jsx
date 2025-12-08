/* eslint-disable react-hooks/exhaustive-deps, no-unused-vars, no-console */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useFetcher, useLoaderData, useNavigate, useSearchParams, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Select,
  Checkbox,
  Badge,
  Banner,
  Modal,
  Tooltip,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useSafeAppBridge } from "../hooks/useSafeAppBridge";
import { authenticate } from "../shopify.server";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ResourceCategoryDisplay } from "../components/ResourceCategoryDisplay";
import { LanguageManager } from "../components/LanguageManager";
import { 
  getLanguagePreference, 
  setLanguagePreference, 
  onLanguagePreferenceChange 
} from "../utils/storage.client";
import { getShopLocales } from "../services/shopify-locales.server.js";
import prisma from "../db.server";
import { subscriptionManager } from "../services/subscription-manager.server.js";
import { creditManager } from "../services/credit-manager.server.js";
import { CreditBar } from "../components/billing/CreditBar.jsx";
import { PRICING_CONFIG } from "../utils/pricing-config.js";
import { useTranslation } from "react-i18next";
import { logger } from "../utils/logger.server.js";

const DEFAULT_AVERAGE_CHARS_PER_RESOURCE = 5_000;

function getResourceTypeLabel(type, t) {
  const normalized = String(type || '').toUpperCase();
  return t(`resourceTypes.${normalized}`, { defaultValue: normalized || 'UNKNOWN' });
}

function formatCompactNumber(value) {
  if (value == null) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

// 添加全局错误监听
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[Global Error]', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || event.error
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', {
      reason: event.reason,
      promise: event.promise
    });
  });
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const [plans, subscription, credits, activeLanguagesCount] = await Promise.all([
    subscriptionManager.listActivePlans(),
    subscriptionManager.getSubscription(session.shop),
    creditManager.getAvailableCredits(session.shop).catch(() => null),
    prisma.language.count({
      where: {
        shopId: session.shop,
        enabled: true,
        isActive: true
      }
    })
  ]);

  // 从 Shopify 读取店铺语言，区分默认语言与目标语言
  let shopLocales = [];
  let primaryLocale = null;
  let alternateLocales = [];

  try {
    shopLocales = await getShopLocales(admin);
    primaryLocale = shopLocales.find((locale) => locale.primary) || null;
    alternateLocales = shopLocales.filter((locale) => !locale.primary);
  } catch (error) {
    logger.warn("[Index Loader] Failed to fetch shop locales, falling back to DB", {
      shopId: session.shop,
      error: error?.message || error,
      code: error?.code
    });

    const shop = await prisma.shop.findUnique({
      where: { id: session.shop },
      include: { languages: { where: { isActive: true, enabled: true } } }
    });

    alternateLocales = (shop?.languages ?? []).map((lang) => ({
      locale: lang.code,
      name: lang.name,
      primary: false,
      published: true
    }));
  }

  let supportedLanguages = alternateLocales.map((locale) => ({
    label: locale.name || locale.locale,
    value: locale.locale
  }));

  if (supportedLanguages.length === 0) {
    const shop = await prisma.shop.findUnique({
      where: { id: session.shop },
      include: { languages: { where: { isActive: true } } }
    });

    supportedLanguages = (shop?.languages ?? [])
      .filter((lang) => !primaryLocale || lang.code !== primaryLocale.locale)
      .map((lang) => ({
        label: lang.name,
        value: lang.code
      }));

    if (supportedLanguages.length === 0) {
      supportedLanguages = [
        { label: 'Chinese (Simplified)', value: 'zh-CN' },
        { label: 'Chinese (Traditional)', value: 'zh-TW' },
        { label: 'English', value: 'en' },
        { label: 'Japanese', value: 'ja' },
        { label: 'Korean', value: 'ko' },
        { label: 'French', value: 'fr' },
        { label: 'German', value: 'de' },
        { label: 'Spanish', value: 'es' }
      ].filter((lang) => !primaryLocale || lang.value !== primaryLocale.locale);
    }
  }

  const currentPlan =
    subscription?.planId
      ? plans.find((plan) => plan.id === subscription.planId)
      : plans.find((plan) => plan.id === 'free');

  const maxLanguages = currentPlan?.maxLanguages ?? 2;
  const remainingLanguageSlots =
    maxLanguages === null ? null : Math.max(0, maxLanguages - activeLanguagesCount);

  return {
    supportedLanguages,
    primaryLanguage: primaryLocale
      ? { label: primaryLocale.name || primaryLocale.locale, value: primaryLocale.locale }
      : null,
    shopId: session.shop,
    billing: {
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        price: plan.price,
        monthlyCredits: plan.monthlyCredits,
        maxLanguages: plan.maxLanguages,
        features: plan.features
      })),
      subscription: subscription
        ? {
            status: subscription.status,
            planId: subscription.planId,
            planName: subscription.plan?.name,
            planDisplayName: subscription.plan?.displayName,
            shopifyChargeId: subscription.shopifyChargeId,
            billingCycle: subscription.billingCycle,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            cancelledAt: subscription.cancelledAt
        }
        : null,
      credits,
      languageLimit: {
        activeLanguagesCount,
        maxLanguages,
        remainingLanguageSlots
      }
    }
  };
};

function Index() {
  console.log('[Index Component] Rendering started');
  
  const { supportedLanguages, primaryLanguage, shopId, billing } = useLoaderData();
  console.log('[Index Component] Loader data:', { supportedLanguages, primaryLanguage, shopId, billing });
  const { t } = useTranslation(['home', 'common']);
  
  const scanProductsFetcher = useFetcher();
  const scanCollectionsFetcher = useFetcher();
  const scanResourcesFetcher = useFetcher();
  const scanAllFetcher = useFetcher();
  const translateFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const billingFetcher = useFetcher();
  const cancelFetcher = useFetcher();
  const clearFetcher = useFetcher();
  const revalidator = useRevalidator();
  
  const shopQueryParam = shopId ? `shop=${encodeURIComponent(shopId)}` : '';
  
  // React Hooks必须在顶层调用，不能在条件语句中
  const shopify = useSafeAppBridge();
  const [searchParams] = useSearchParams();
  const hasHostParam = Boolean(searchParams.get('host'));
  const isAppBridgeReady = Boolean(shopify);
  const navigate = useNavigate();
  if (typeof window !== 'undefined') {
    if (shopify) {
      console.log('[Index Component] App Bridge ready');
    } else {
      console.warn('[Index Component] App Bridge not ready, host param may be missing');
    }
  }
  
  // Language selector persistence: read saved preference on init
  const [viewMode, setViewMode] = useState('all');
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const defaultTarget = supportedLanguages[0]?.value;

    if (typeof window === 'undefined') {
      console.log('[Language Preference] Server environment, using default target language');
      return defaultTarget ?? 'zh-CN';
    }

    const savedLanguage = getLanguagePreference(shopId);

    if (savedLanguage && supportedLanguages.some((lang) => lang.value === savedLanguage)) {
      console.log('[Language Preference] Restored saved language:', savedLanguage);
      return savedLanguage;
    }

    if (defaultTarget) {
      console.log('[Language Preference] Using default target language:', defaultTarget);
      return defaultTarget;
    }

    console.log('[Language Preference] No target languages found, falling back to zh-CN');
    return 'zh-CN';
  });
  const [selectedResourceType, setSelectedResourceType] = useState('PRODUCT');
  const [selectedResources, setSelectedResources] = useState([]);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  // 语言级数据隔离：使用对象存储各语言的独立数据
  const [allLanguagesData, setAllLanguagesData] = useState({});
  
  // 派生当前语言的数据
  const currentLanguageData = useMemo(() => 
    allLanguagesData[selectedLanguage] || null,
    [allLanguagesData, selectedLanguage]
  );
  
  // 从当前语言数据中提取资源和统计信息
  const resources = currentLanguageData?.resources || [];
  const stats = currentLanguageData?.stats || {
    total: 0,
    translated: 0,
    pending: 0,
    translationRate: 0,
    pendingTranslations: 0,
    totalPendingTranslations: 0,
    syncedTranslations: 0,
    totalResources: 0,
    pendingResources: 0,
    completedResources: 0
  };
  const [translationService, setTranslationService] = useState(null);
  const [logs, setLogs] = useState([]);
  const [appBridgeError, setAppBridgeError] = useState(false);
  const [lastServiceError, setLastServiceError] = useState(null);
  const [clearCache, setClearCache] = useState(false);
  const [dynamicLanguages, setDynamicLanguages] = useState(supportedLanguages);

  useEffect(() => {
    setDynamicLanguages(supportedLanguages);
    setSelectedLanguage((prev) => {
      if (supportedLanguages.some((lang) => lang.value === prev)) {
        return prev;
      }
      return supportedLanguages[0]?.value ?? prev;
    });
  }, [supportedLanguages]);
  
  // 分类翻译状态管理
  const [translatingCategories, setTranslatingCategories] = useState(new Set());
  const [syncingCategories, setSyncingCategories] = useState(new Set());

  // Phase 2: 发布相关状态
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishingProgress, setPublishingProgress] = useState({ current: 0, total: 0 });
  const [pendingTranslations, setPendingTranslations] = useState([]);

  // 操作锁和防抖机制
  const [operationLock, setOperationLock] = useState(new Set());
  const debounceTimers = useRef(new Map());
  const billingResultRef = useRef(null);
  const cancelResultRef = useRef(null);

  const plans = billing?.plans ?? [];
  const subscription = billing?.subscription ?? null;
  const credits = billing?.credits ?? null;
  const creditToChars = PRICING_CONFIG.CREDIT_TO_CHARS;
  const hasActiveSubscription = subscription?.status === 'active';
  const availableCredits = credits?.available ?? 0;
  const languageLimit = billing?.languageLimit ?? {};
  const maxLanguages = languageLimit?.maxLanguages ?? null;
  const remainingLanguageSlots = languageLimit?.remainingLanguageSlots ?? null;
  const isSelectedLanguageActive = supportedLanguages.some(
    (lang) => lang.value === selectedLanguage
  );
  const resourceCountForEstimation = (selectedResources.length > 0 ? selectedResources.length : resources.length) || 0;
  const estimatedCharacters = resourceCountForEstimation * DEFAULT_AVERAGE_CHARS_PER_RESOURCE;
  const estimatedCredits = resourceCountForEstimation > 0
    ? Math.max(
        PRICING_CONFIG.MIN_CREDIT_CHARGE,
        Math.ceil(estimatedCharacters / creditToChars)
      )
    : 0;
  const requiredCreditsWithBuffer = resourceCountForEstimation > 0
    ? Math.ceil(estimatedCredits * 1.05) // 5% buffer for token/HTML差异
    : 0;
  const hasLanguageLimitBlock =
    maxLanguages !== null &&
    !isSelectedLanguageActive &&
    remainingLanguageSlots !== null &&
    remainingLanguageSlots <= 0;
  const insufficientCredits =
    resourceCountForEstimation > 0 && requiredCreditsWithBuffer > availableCredits;
  const translateDisabledReason = useMemo(() => {
    if (!hasActiveSubscription) {
      return t('errors.noActiveSubscription', { ns: 'home', defaultValue: 'No active subscription. Please subscribe to a plan.' });
    }
    if (availableCredits <= 0) {
      return t('errors.noCreditsAvailable', { ns: 'home', defaultValue: 'Insufficient credits. Please top up or upgrade your plan.' });
    }
    if (insufficientCredits) {
      return t('errors.insufficientCreditsForSelection', {
        ns: 'home',
        defaultValue: `Not enough credits for the selected items. Need ~${requiredCreditsWithBuffer} credits (incl. 5% buffer), available ${availableCredits}. Please top up or reduce the selection.`,
        required: requiredCreditsWithBuffer,
        available: availableCredits
      });
    }
    if (hasLanguageLimitBlock) {
      return t('errors.languageLimitReached', {
        ns: 'home',
        defaultValue: `Language limit reached. Plan allows ${maxLanguages}, active ${languageLimit?.activeLanguagesCount ?? 0}. Please remove a language or upgrade your plan.`,
        limit: maxLanguages ?? 0,
        active: languageLimit?.activeLanguagesCount ?? 0,
        includesDraft: true
      });
    }
    if (translationService && translationService.status === 'unhealthy') {
      return t('errors.serviceUnhealthy', { ns: 'home', defaultValue: 'Translation service is temporarily unavailable.' });
    }
    if (resources.length === 0) {
      return t('errors.noResources', { ns: 'home', defaultValue: 'No resources available to translate.' });
    }
    return null;
  }, [
    hasActiveSubscription,
    availableCredits,
    translationService,
    resources.length,
    insufficientCredits,
    hasLanguageLimitBlock,
    t
  ]);
  const canTranslate = hasActiveSubscription && availableCredits > 0 && !insufficientCredits && !hasLanguageLimitBlock;
  const estimatedSummaryText = resourceCountForEstimation > 0
    ? t('ui.estimatedCost', { ns: 'home', credits: formatCompactNumber(estimatedCredits), chars: formatCompactNumber(estimatedCharacters) })
    : t('ui.selectForEstimate', { ns: 'home' });
  const languageLimitSummary =
    maxLanguages === null
      ? t('ui.languageLimitUnlimited', { ns: 'home', defaultValue: 'Language limit: unlimited' })
      : t('ui.languageLimitSummary', {
          ns: 'home',
          defaultValue: `Language limit: ${maxLanguages}, active ${languageLimit?.activeLanguagesCount ?? 0} (incl. drafts)`,
          limit: maxLanguages ?? 0,
          active: languageLimit?.activeLanguagesCount ?? 0,
          includesDraft: true
        });
  const estimatedSummaryWithLimit =
    resourceCountForEstimation > 0 ? `${estimatedSummaryText} · ${languageLimitSummary}` : estimatedSummaryText;

  const currentPlan = useMemo(() => {
    if (!subscription?.planId) return null;
    return plans.find((plan) => plan.id === subscription.planId) || null;
  }, [plans, subscription]);

  const upgradeOptions = useMemo(() => {
    if (plans.length === 0) return [];
    return plans.filter((plan) => {
      if (!currentPlan) return true;
      return plan.monthlyCredits > (currentPlan.monthlyCredits ?? 0);
    });
  }, [plans, currentPlan]);

  const creditWarningLevel = useMemo(() => {
    if (!credits || !credits.total) return null;
    const ratio = credits.available / credits.total;
    if (ratio <= 0.1) return 'critical';
    if (ratio <= 0.25) return 'warning';
    return null;
  }, [credits]);

  const selectedUpgradePlan = useMemo(() => {
    if (!selectedPlanId) return upgradeOptions[0] || null;
    return upgradeOptions.find((plan) => plan.id === selectedPlanId) || upgradeOptions[0] || null;
  }, [selectedPlanId, upgradeOptions]);

  const upgradeDelta = useMemo(() => {
    if (!selectedUpgradePlan) return null;
    const base = currentPlan?.monthlyCredits ?? 0;
    return selectedUpgradePlan.monthlyCredits - base;
  }, [selectedUpgradePlan, currentPlan]);

  const canCancelSubscription = useMemo(() => {
    if (!subscription) return false;
    if (subscription.status !== 'active') return false;
    if (!currentPlan) return false;
    return currentPlan.price > 0;
  }, [subscription, currentPlan]);

  useEffect(() => {
    if (!selectedPlanId && upgradeOptions.length > 0) {
      setSelectedPlanId(upgradeOptions[0].id);
    }
  }, [upgradeOptions, selectedPlanId]);

  // 防抖函数
  const debounce = useCallback((key, fn, delay = 1000) => {
    // 清除之前的定时器
    if (debounceTimers.current.has(key)) {
      clearTimeout(debounceTimers.current.get(key));
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      debounceTimers.current.delete(key);
      fn();
    }, delay);

    debounceTimers.current.set(key, timer);
  }, []);

  const isUpgrading = billingFetcher.state !== 'idle';
  const isCancelling = cancelFetcher.state !== 'idle';

  const handleOpenUpgrade = useCallback(() => {
    if (upgradeOptions.length === 0) return;
    if (!selectedPlanId && upgradeOptions.length > 0) {
      setSelectedPlanId(upgradeOptions[0].id);
    }
    setUpgradeModalOpen(true);
  }, [upgradeOptions, selectedPlanId]);

  const handleSubmitUpgrade = useCallback(() => {
    if (!selectedPlanId) return;
    billingFetcher.submit(
      { planId: selectedPlanId },
      { method: 'post', action: '/api/billing/subscribe' }
    );
  }, [billingFetcher, selectedPlanId]);

  const handleOpenCancel = useCallback(() => {
    setCancelModalOpen(true);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    cancelFetcher.submit(
      { reason: 'CUSTOMER_REQUEST', prorate: 'false' },
      { method: 'post', action: '/api/billing/cancel' }
    );
  }, [cancelFetcher]);

  // handled after toast helpers are defined

  // 添加日志
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, message, type }, ...prev.slice(0, 9)]);
  }, []);

  // 安全的toast显示函数
  const showToast = useCallback((message, options = {}) => {
    try {
      if (shopify && shopify.toast) {
        shopify.toast.show(message, options);
      } else {
        // 如果toast不可用，使用日志记录
        addLog(message, options.isError ? 'error' : 'info');
      }
    } catch (error) {
      console.error('Toast display error:', error);
      addLog(message, options.isError ? 'error' : 'info');
      setAppBridgeError(true);
    }
  }, [shopify, addLog]);

  useEffect(() => {
    if (billingFetcher.state !== 'idle') return;
    const result = billingFetcher.data;
    if (!result) return;
    const marker = result.timestamp || JSON.stringify(result);
    if (billingResultRef.current === marker) return;
    billingResultRef.current = marker;

    if (result.success) {
      const confirmationUrl = result.data?.confirmationUrl;
      if (confirmationUrl) {
        window.open(confirmationUrl, '_blank', 'noopener');
        showToast(t('home.toasts.billingOpened'));
      } else {
        showToast(t('home.toasts.upgradeSuccess'));
        revalidator.revalidate();
      }
      setUpgradeModalOpen(false);
    } else {
      showToast(result.message || t('home.toasts.upgradeFailed'), { isError: true });
    }
  }, [billingFetcher.state, billingFetcher.data, revalidator, showToast]);

  useEffect(() => {
    if (cancelFetcher.state !== 'idle') return;
    const result = cancelFetcher.data;
    if (!result) return;
    const marker = result.timestamp || JSON.stringify(result);
    if (cancelResultRef.current === marker) return;
    cancelResultRef.current = marker;

    if (result.success) {
      showToast(t('home.toasts.cancelSuccess'));
      setCancelModalOpen(false);
      revalidator.revalidate();
    } else {
      showToast(result.message || t('home.toasts.cancelFailed'), { isError: true });
    }
  }, [cancelFetcher.state, cancelFetcher.data, revalidator, showToast]);

  // 操作锁机制
  const withOperationLock = useCallback((operationKey, fn) => {
    return async (...args) => {
      // 检查是否已有相同操作在进行
      if (operationLock.has(operationKey)) {
        console.warn(`[UI] Operation ${operationKey} already in progress, skipping duplicate request`);
        addLog(t('logs.operationRunning', { ns: 'home', operation: operationKey }), 'warning');
        return;
      }

      try {
        // 设置操作锁
        setOperationLock(prev => new Set([...prev, operationKey]));

        // 执行操作
        await fn(...args);
      } catch (error) {
        console.error(`[UI] Operation ${operationKey} failed:`, error);
        addLog(t('logs.operationFailed', { ns: 'home', operation: operationKey, error: error.message }), 'error');
        throw error;
      } finally {
        // 释放操作锁
        setOperationLock(prev => {
          const newSet = new Set(prev);
          newSet.delete(operationKey);
          return newSet;
        });
      }
    };
  }, [operationLock, addLog]);

  // 安全的异步操作包装器
  const safeAsyncOperation = useCallback((operationName, operation) => {
    return withOperationLock(operationName, async () => {
      try {
        await operation();
      } catch (error) {
        // 错误已在withOperationLock中处理
        // 这里可以添加额外的错误恢复逻辑
        if (error.message.includes('fetch') || error.message.includes('network')) {
          setAppBridgeError(true);
        }
      }
    });
  }, [withOperationLock]);

  // Language preference persistence and multi-tab sync
  useEffect(() => {
    // SSR and data validation
    if (typeof window === 'undefined' || !shopId) {
      console.log('[Language Preference] Skip persistence setup: SSR or missing shopId');
      return;
    }
    
    // Save current language selection
    const saved = setLanguagePreference(shopId, selectedLanguage);
    if (saved) {
      console.log('[Language Preference] Saved language preference:', selectedLanguage);
    }
    
    // Listen for language changes from other tabs
    const cleanup = onLanguagePreferenceChange(shopId, (newLanguage) => {
      // Validate new language is in available list
      if (supportedLanguages.some(lang => lang.value === newLanguage)) {
        console.log('[Language Preference] Sync language from other tab:', newLanguage);
        setSelectedLanguage(newLanguage);
      } else {
        console.warn('[Language Preference] Language from other tab not in available list:', newLanguage);
      }
    });
    
    return cleanup;
  }, [selectedLanguage, shopId, supportedLanguages]);

  // Validation when language list updates
  useEffect(() => {
    // If current selected language is no longer available, reset to default
    if (supportedLanguages.length > 0 && 
        !supportedLanguages.some(lang => lang.value === selectedLanguage)) {
      console.warn('[Language Preference] Current language unavailable, reset to default');
      setSelectedLanguage('zh-CN');
    }
  }, [supportedLanguages, selectedLanguage]);
  
  // 语言切换时清理选中状态
  useEffect(() => {
    // 切换语言时清空选中的资源
    setSelectedResources([]);
    
    // 检查新语言是否有缓存数据
    const languageData = allLanguagesData[selectedLanguage];
    if (!languageData) {
      console.log(`[Language Switch] No data for ${selectedLanguage} yet`);
    } else {
      console.log(`[Language Switch] Loaded ${selectedLanguage} cached data, resources: ${languageData.resources?.length || 0}`);
    }
  }, [selectedLanguage, allLanguagesData]);
  
  // 为每个分类创建独立的fetcher（预先创建几个）
  const categoryFetcher1 = useFetcher();
  const categoryFetcher2 = useFetcher();
  const categoryFetcher3 = useFetcher();
  const categoryFetcher4 = useFetcher();
  const categoryFetcher5 = useFetcher();
  const syncFetcher = useFetcher();

  // Phase 2: 发布相关fetchers
  const publishFetcher = useFetcher();
  const batchPublishFetcher = useFetcher();

  // 管理fetcher分配
  const categoryFetcherMap = useRef({});
  const availableFetchers = useRef([
    categoryFetcher1,
    categoryFetcher2,
    categoryFetcher3,
    categoryFetcher4,
    categoryFetcher5
  ]);
  
  // 智能轮询状态管理
  const [pollInterval, setPollInterval] = useState(60000); // 默认60秒
  const [lastStatusData, setLastStatusData] = useState(null);

  // 资源类型选项（对齐 Shopify 官方分类；隐藏非翻译项与暂不支持项）
  const resourceTypeOptions = useMemo(() => [
    { label: t('resourceTypeOptions.products'), value: 'PRODUCT' },
    { label: t('resourceTypeOptions.collections'), value: 'COLLECTION' },
    { label: t('resourceTypeOptions.blogPosts'), value: 'ARTICLE' },
    { label: t('resourceTypeOptions.blogTitles'), value: 'BLOG' },
    { label: t('resourceTypeOptions.pages'), value: 'PAGE' },
    { label: t('resourceTypeOptions.filters'), value: 'FILTER' },
    { label: t('resourceTypeOptions.policies'), value: 'SHOP_POLICY' },
    { label: t('resourceTypeOptions.storeMetadata'), value: 'SHOP' },
    { label: t('resourceTypeOptions.menu'), value: 'MENU' },
    { label: t('resourceTypeOptions.appEmbeds'), value: 'ONLINE_STORE_THEME_APP_EMBED' },
    { label: t('resourceTypeOptions.sectionGroups'), value: 'ONLINE_STORE_THEME_SECTION_GROUP' },
    { label: t('resourceTypeOptions.staticSections'), value: 'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS' },
    { label: t('resourceTypeOptions.templates'), value: 'ONLINE_STORE_THEME_JSON_TEMPLATE' },
    { label: t('resourceTypeOptions.themeSettings'), value: 'ONLINE_STORE_THEME_SETTINGS_CATEGORY' },
    { label: t('resourceTypeOptions.localeContent'), value: 'ONLINE_STORE_THEME_LOCALE_CONTENT' }
  ], [t]);

  // 加载状态
  const isScanning = scanProductsFetcher.state === 'submitting' || 
                     scanCollectionsFetcher.state === 'submitting' || 
                     scanResourcesFetcher.state === 'submitting' ||
                     scanAllFetcher.state === 'submitting';
  const isTranslating = translateFetcher.state === 'submitting';
  const isClearing = clearFetcher.state === 'submitting';

  // 🔧 使用 useRef 稳定 loadStatus，避免循环依赖
  const loadStatusRef = useRef();
  const loadStatusAbortController = useRef(null);

  // 更新 ref 实现（依赖变化时更新）
  useEffect(() => {
    loadStatusRef.current = (lang = selectedLanguage, mode = viewMode, force = false) => {
      try {
        // 取消之前的请求（去重）
        if (loadStatusAbortController.current) {
          loadStatusAbortController.current.abort();
        }
        loadStatusAbortController.current = new AbortController();

        const params = new URLSearchParams();
        params.set('language', lang);
        params.set('filterMode', mode);
        if (force) params.set('force', '1');
        if (shopId) params.set('shop', shopId);

        statusFetcher.load(`/api/status?${params.toString()}`);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load status:', error);
          addLog(t('logs.networkIssue', { ns: 'home' }), 'error');
          setAppBridgeError(true);
        }
      }
    };
  }, [addLog, selectedLanguage, viewMode, statusFetcher, shopId]);

  // 创建稳定的 loadStatus 包装函数
  const loadStatus = useCallback((...args) => {
    loadStatusRef.current?.(...args);
  }, []);

  // 清理函数
  useEffect(() => {
    return () => {
      loadStatusAbortController.current?.abort();
    };
  }, []);

  // 处理API响应
  // 状态比较和去重处理函数
  const hasStatusChanged = useCallback((newData, lastData) => {
    if (!lastData) return true;
    
    // 比较关键状态字段
    return (
      JSON.stringify(newData.stats?.database) !== JSON.stringify(lastData.stats?.database) ||
      newData.translationService?.status !== lastData.translationService?.status ||
      newData.resources?.length !== lastData.resources?.length ||
      JSON.stringify(newData.resources?.map(r => ({ id: r.id, status: r.status }))) !== 
        JSON.stringify(lastData.resources?.map(r => ({ id: r.id, status: r.status })))
    );
  }, []);

  useEffect(() => {
    if (statusFetcher.data && statusFetcher.data.success) {
      const currentData = statusFetcher.data.data;
      
      // 只在状态实际变化时更新UI
      if (hasStatusChanged(currentData, lastStatusData)) {
        const { resources: resourcesData, stats: statsData, translationService: serviceData } = currentData;
        
        // 定义默认统计值，确保所有字段都有默认值
        const DEFAULT_STATS = {
          total: 0,
          translated: 0,
          pending: 0,
          translationRate: 0,
          pendingTranslations: 0,
          totalPendingTranslations: 0,
          syncedTranslations: 0,
          totalResources: 0,
          pendingResources: 0,
          completedResources: 0
        };

        // 将数据存储到对应语言的槽位
        setAllLanguagesData(prev => ({
          ...prev,
          [selectedLanguage]: {
            resources: resourcesData || [],
            stats: {
              ...DEFAULT_STATS,           // 先设置默认值
              ...statsData?.legacy,       // 合并 legacy（包含 pendingTranslations 等）
              ...statsData?.database      // 最后合并 database（优先级更高）
            },
            lastUpdated: Date.now()
          }
        }));
        
        setTranslationService(serviceData || null);
        
        // 更新缓存的状态数据
        setLastStatusData(currentData);
        
        // 检查翻译服务状态并显示提示 - 只在错误变化时记录
        if (serviceData && serviceData.status === 'unhealthy') {
          const currentError = serviceData.errors?.[0] || 'Unknown error';
          if (currentError !== lastServiceError) {
            addLog(t('logs.translationServiceError', { ns: 'home', error: currentError }), 'error');
            setLastServiceError(currentError);
          }
        } else if (lastServiceError) {
          // Service recovered normally
          addLog(t('logs.serviceRestored', { ns: 'home' }), 'success');
          setLastServiceError(null);
        }
      }
    }
  }, [statusFetcher.data, addLog, lastServiceError, hasStatusChanged, lastStatusData]);

  // 监听分类翻译fetcher的状态变化
  useEffect(() => {
    // 检查每个fetcher的状态
    [categoryFetcher1, categoryFetcher2, categoryFetcher3, categoryFetcher4, categoryFetcher5].forEach(fetcher => {
      if (fetcher.state === 'idle' && fetcher.data) {
        // 找到对应的categoryKey
        const categoryKey = Object.keys(categoryFetcherMap.current).find(
          key => categoryFetcherMap.current[key] === fetcher
        );
        
        if (categoryKey && translatingCategories.has(categoryKey)) {
          // 移除翻译状态
          setTranslatingCategories(prev => {
            const newSet = new Set(prev);
            newSet.delete(categoryKey);
            return newSet;
          });
          
          // 处理响应
          if (fetcher.data.success) {
            const successCount = fetcher.data.data?.stats?.success || 0;
            const failureCount = fetcher.data.data?.stats?.failure || 0;
            
            if (successCount > 0) {
              addLog(t('logs.categoryTranslateDone', { ns: 'home', category: categoryKey, success: successCount, failed: failureCount }), 'success');
              showToast(t('home.toasts.categoryTranslateDone', { category: categoryKey }), { duration: 3000 });
            } else {
              addLog(t('logs.categoryTranslateNone', { ns: 'home', category: categoryKey }), 'warning');
            }
            
            // 刷新状态
            loadStatus();
          } else {
            const errorMsg = fetcher.data.error || t('home.toasts.translationFailed');
            addLog(t('logs.categoryTranslateFailed', { ns: 'home', category: categoryKey, error: errorMsg }), 'error');
            showToast(t('home.toasts.translationFailedWithMsg', { message: errorMsg }), { isError: true });
          }
          
          // 清理fetcher映射
          delete categoryFetcherMap.current[categoryKey];
        }
      }
    });
  }, [categoryFetcher1.state, categoryFetcher2.state, categoryFetcher3.state, 
      categoryFetcher4.state, categoryFetcher5.state, translatingCategories, 
      addLog, showToast, loadStatus]);

  // 监听发布响应
  useEffect(() => {
    if (syncFetcher.state === 'idle' && syncFetcher.data) {
      // 找出正在发布的分类
      const syncingCategory = Array.from(syncingCategories)[0];
      
      if (syncingCategory) {
        // 处理响应
        if (syncFetcher.data.success) {
          const { successCount = 0, failedCount = 0 } = syncFetcher.data.result || {};
          
          if (successCount > 0) {
            addLog(`✅ Category publish finished: ${successCount} success, ${failedCount} failed`, 'success');
            showToast(t('home.toasts.categoryPublishSuccess'), { duration: 3000 });
          } else if (failedCount > 0) {
            addLog(`⚠️ Category publish finished with ${failedCount} failures`, 'warning');
          } else {
            addLog('ℹ️ No items to publish in this category', 'info');
            showToast(t('home.toasts.noTranslations'), { duration: 2000 });
          }
          
          // 刷新状态
          loadStatus();
        } else {
          const errorMsg = syncFetcher.data.error || t('home.toasts.publishFailed');
          addLog(`❌ Category publish failed: ${errorMsg}`, 'error');
          showToast(t('home.toasts.publishFailedWithMsg', { message: errorMsg }), { isError: true });
        }
        
        // 清理发布状态
        setSyncingCategories(prev => {
          const newSet = new Set(prev);
          newSet.delete(syncingCategory);
          return newSet;
        });
      }
    }
  }, [syncFetcher.state, syncFetcher.data, syncingCategories, addLog, showToast, loadStatus]);

  // Phase 2: 处理发布响应
  useEffect(() => {
    if (publishFetcher.state !== 'idle') {
      return;
    }

    const responseData = publishFetcher.data;
    if (!responseData) {
      return;
    }

    setIsPublishing(false);

    if (typeof responseData !== 'object') {
      addLog('❌ Publish failed: invalid API response', 'error');
      showToast(t('home.toasts.publishApiError'), { isError: true });
      return;
    }

    const payload = responseData.data ?? responseData;
    const successFlag = responseData.success ?? payload.success ?? false;

    if (!successFlag) {
      console.debug('[Publish Error] Raw response:', responseData);
      const errorMsg = payload.error || payload.message || t('home.toasts.publishFailed');
      addLog(`❌ Publish failed: ${errorMsg}`, 'error');
      showToast(t('home.toasts.publishFailedWithMsg', { message: errorMsg }), { isError: true });
      return;
    }

    const {
      published = 0,
      total = 0,
      errors = [],
      warnings = [],
      message: payloadMessage
    } = payload;

    if (total === 0) {
      const msg = payloadMessage || t('home.toasts.noTranslations');
      addLog(`ℹ️ ${msg}`, 'info');
      showToast(msg, { duration: 2000 });
      return;
    }

    const successRate = total > 0 ? ((published / total) * 100).toFixed(1) : '100';

    addLog(`✅ Publish completed: ${published}/${total} succeeded (${successRate}%)`, 'success');
    showToast(t('home.toasts.publishSuccessCount', { count: published }), { duration: 3000 });

    if (warnings.length > 0) {
      const warningSummary = warnings
        .map(w => `${w.resourceTitle || w.translationId}(${w.language})`)
        .join(', ');
      addLog(`⚠️ Some translations have unsynced fields: ${warningSummary}`, 'warning');
    }

    if (errors.length > 0) {
      addLog(`⚠️ ${errors.length} translations failed to publish, see error list`, 'warning');
    }

    // 刷新状态
    loadStatus();
  }, [publishFetcher.state, publishFetcher.data, addLog, showToast, loadStatus]);

  // 处理批量发布响应
  useEffect(() => {
    if (batchPublishFetcher.state !== 'idle') {
      return;
    }

    const responseData = batchPublishFetcher.data;
    if (!responseData) {
      return;
    }

    setIsPublishing(false);

    if (typeof responseData !== 'object') {
      addLog('❌ Bulk publish failed: invalid API response', 'error');
      showToast(t('home.toasts.bulkPublishApiError'), { isError: true });
      return;
    }

    const payload = responseData.data ?? responseData;
    const successFlag = responseData.success ?? payload.success ?? false;

    if (!successFlag) {
      console.debug('[Batch Publish Error] Raw response:', responseData);
      const errorMsg = payload.error || payload.message || t('home.toasts.bulkPublishFailed');
      addLog(`❌ Bulk publish failed: ${errorMsg}`, 'error');
      showToast(t('home.toasts.bulkPublishFailedWithMsg', { message: errorMsg }), { isError: true });
      return;
    }

    const {
      published = 0,
      total = 0,
      successRate = '0%',
      byType = {},
      errors = [],
      warnings = [],
      skipped = 0,
      skippedReasons = {},
      message: payloadMessage
    } = payload;

    if (total === 0) {
      const msg = payloadMessage || t('home.toasts.noTranslations');
      addLog(`ℹ️ ${msg}`, 'info');
      showToast(msg, { duration: 2000 });
      return;
    }

    let detailMessage = `✅ Bulk publish completed: ${published}/${total} succeeded (${successRate})`;

    const typeEntries = Object.entries(byType);
    if (typeEntries.length > 0) {
      const hiddenTypes = new Set(['PRODUCT_OPTION', 'PRODUCT_METAFIELD', 'PRODUCT_OPTION_VALUE']);
      detailMessage += '\n\nBy type:';
      typeEntries
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([type, stats]) => {
          const successCount = stats?.success ?? 0;
          const failedCount = stats?.failed ?? 0;
          const suffix = hiddenTypes.has(type) ? ' (自动处理)' : '';
          detailMessage += `\n  • ${getResourceTypeLabel(type, t)}: ${successCount} succeeded`;
          if (failedCount > 0) {
            detailMessage += `, ${failedCount} failed`;
          }
          detailMessage += suffix;
        });
    }

    if (skipped > 0) {
      detailMessage += `\n⏭️  Skipped ${skipped}`;
      Object.entries(skippedReasons).forEach(([reason, count]) => {
        detailMessage += `\n  - ${reason}: ${count}`;
      });
    }

    if (warnings.length > 0) {
      detailMessage += `\n⚠️ Some translations have unsynced fields: ${warnings
        .map(w => `${w.resourceTitle || w.translationId}(${w.language})`)
        .join(', ')}`;
    }

    if (errors.length > 0) {
      detailMessage += `\n⚠️ ${errors.length} translations failed to publish, see the error list`;
    }

    addLog(detailMessage, 'success');
    showToast(t('home.toasts.bulkPublishSuccessCount', { count: published }), { duration: 3000 });

    if (byType && byType['PRODUCT_OPTION']) {
      const optionStats = byType['PRODUCT_OPTION'];
      if (optionStats.success > 0) {
        addLog(
          `ℹ️ Product options note: published ${optionStats.success} option names. Option values (e.g., S/M/L) cannot be published due to Shopify API limits; those records will show as partial (expected).`,
          'info'
        );
      }
    }

    if (Array.isArray(errors) && errors.length > 0) {
      addLog(`⚠️ ${errors.length} translations failed to publish, see error list`, 'warning');
    }

    // 刷新状态
    loadStatus();
  }, [batchPublishFetcher.state, batchPublishFetcher.data, addLog, showToast, loadStatus]);

  // 页面加载时获取状态 - 只在首次加载时执行
  useEffect(() => {
    console.log('[Index Component] Initial useEffect - loading status');
    loadStatus(selectedLanguage, viewMode);
  }, []); // 只在组件挂载时执行一次
  
  // 监听viewMode变化，重新加载数据
  useEffect(() => {
    if (viewMode) {
      console.log('[View Mode Change] Reloading with mode:', viewMode);
      loadStatus(selectedLanguage, viewMode);
    }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 组件卸载时清理防抖定时器
  useEffect(() => {
    return () => {
      // 清理所有防抖定时器
      debounceTimers.current.forEach(timer => clearTimeout(timer));
      debounceTimers.current.clear();
    };
  }, []);

  // 设置智能定时刷新
  useEffect(() => {
    const interval = setInterval(() => {
      // 根据当前状态调整轮询频率
      const isActiveOperation = isScanning || isTranslating || isClearing || isPublishing;
      const currentInterval = isActiveOperation ? 10000 : 60000; // 操作中10秒，空闲60秒

      if (currentInterval !== pollInterval) {
        setPollInterval(currentInterval);
      }

      if (!isActiveOperation) {
        loadStatus();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [pollInterval, isScanning, isTranslating, isClearing, isPublishing, loadStatus]); // ✅ 修复依赖数组

  // 扫描产品
  const scanProducts = useCallback(() => {
    try {
      addLog(t('logs.scanningProducts', { ns: 'home' }), 'info');
      scanProductsFetcher.submit(
        shopId ? { shop: shopId } : {},
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-products?${shopQueryParam}` : '/api/scan-products'
        }
      );
    } catch (error) {
      console.error('Product scan failed:', error);
      addLog(t('logs.operationFailed', { ns: 'home', operation: 'Product scan', error: error.message }), 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanProductsFetcher, shopId, shopQueryParam]);

  // 扫描集合
  const scanCollections = useCallback(() => {
    try {
      addLog(t('logs.scanningCollections', { ns: 'home' }), 'info');
      scanCollectionsFetcher.submit(
        shopId ? { shop: shopId } : {},
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-collections?${shopQueryParam}` : '/api/scan-collections'
        }
      );
    } catch (error) {
      console.error('Collection scan failed:', error);
      addLog(t('logs.operationFailed', { ns: 'home', operation: 'Collection scan', error: error.message }), 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanCollectionsFetcher, shopId, shopQueryParam]);

  // 扫描所有资源
  const scanAllResources = useCallback(() => {
    try {
      addLog(t('logs.scanningAll', { ns: 'home' }), 'info');
      scanAllFetcher.submit(
        shopId ? { shop: shopId } : {},
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-all?${shopQueryParam}` : '/api/scan-all'
        }
      );
    } catch (error) {
      console.error('Full resource scan failed:', error);
      addLog(t('logs.operationFailed', { ns: 'home', operation: 'Full resource scan', error: error.message }), 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanAllFetcher, shopId, shopQueryParam]);

  // 扫描选定的资源类型
  const scanSelectedResourceType = useCallback(() => {
    try {
      const selectedType = resourceTypeOptions.find(opt => opt.value === selectedResourceType);
      addLog(t('logs.scanningType', { ns: 'home', label: selectedType?.label || selectedResourceType }), 'info');
      scanResourcesFetcher.submit(
        { resourceType: selectedResourceType, ...(shopId ? { shop: shopId } : {}) },
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-resources?${shopQueryParam}` : '/api/scan-resources',
          encType: 'application/json'
        }
      );
    } catch (error) {
      console.error('Resource scan failed:', error);
      addLog(t('logs.operationFailed', { ns: 'home', operation: 'Resource scan', error: error.message }), 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanResourcesFetcher, selectedResourceType, resourceTypeOptions, shopId, shopQueryParam]);

  // 处理分类翻译
  const handleCategoryTranslation = useCallback((categoryKey, resourceIds) => {
    try {
      // 检查是否已在翻译中
      if (translatingCategories.has(categoryKey)) {
        addLog(`⏳ ${categoryKey} is being translated, please wait...`, 'warning');
        return;
      }
      
      // 检查翻译服务状态
      if (translationService && translationService.status === 'unhealthy') {
        const errorMsg = translationService.errors?.[0] || t('home.toasts.translationServiceUnavailable');
        addLog(t('logs.translationServiceUnavailable', { ns: 'home', error: errorMsg }), 'error');
        showToast(t('home.toasts.translationServiceError', { message: errorMsg }), { isError: true });
        return;
      }
      
      // 获取或分配一个可用的fetcher
      let fetcher = categoryFetcherMap.current[categoryKey];
      if (!fetcher) {
        // 找一个未使用的fetcher
        for (let i = 0; i < availableFetchers.current.length; i++) {
          const f = availableFetchers.current[i];
          const isUsed = Object.values(categoryFetcherMap.current).includes(f);
          if (!isUsed) {
            fetcher = f;
            categoryFetcherMap.current[categoryKey] = f;
            break;
          }
        }
      }
      
      if (!fetcher) {
        addLog(t('logs.tooManyCategories', { ns: 'home' }), 'warning');
        return;
      }
      
      // 设置翻译状态
      setTranslatingCategories(prev => new Set([...prev, categoryKey]));
      
      addLog(t('logs.translatingCategory', { ns: 'home', category: categoryKey, count: resourceIds.length, lang: selectedLanguage }), 'info');
      
      // 提交翻译请求
      fetcher.submit({
        language: selectedLanguage,
        resourceIds: JSON.stringify(resourceIds),
        clearCache: clearCache.toString(),
        forceRelatedTranslation: 'true',
        userRequested: 'true',
        shop: shopId
      }, {
        method: 'POST',
        action: shopQueryParam ? `/api/translate?${shopQueryParam}` : '/api/translate'
      });
      
    } catch (error) {
      console.error('Category translation failed:', error);
      addLog(`❌ ${categoryKey} translation failed: ${error.message}`, 'error');
      
      // 清理状态
      setTranslatingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryKey);
        return newSet;
      });
    }
  }, [selectedLanguage, clearCache, translationService, addLog, showToast, translatingCategories, shopId, shopQueryParam]);

  // 处理分类发布（发布到Shopify）
  const handleCategorySync = useCallback(async (categoryKey, category) => {
    try {
      // Check if already publishing
      if (syncingCategories.has(categoryKey)) {
        addLog(`⚠️ Category ${category.name} is publishing, please wait...`, 'warning');
        return;
      }
      
      // Set publishing state
      setSyncingCategories(prev => new Set([...prev, categoryKey]));
      
      addLog(t('logs.categoryPublishStart', { ns: 'home', name: category.name }), 'info');
      
      // 收集该分类下所有资源的ID
      const categoryResourceIds = [];
      Object.values(category.subcategories).forEach(subcategory => {
        subcategory.items.forEach(resource => {
          categoryResourceIds.push(resource.id);
        });
      });
      
      // 提交发布请求
      syncFetcher.submit({
        action: 'syncByCategory',
        categoryKey: categoryKey,
        language: selectedLanguage,
        resourceIds: JSON.stringify(categoryResourceIds),
        shop: shopId
      }, { 
        method: 'POST', 
        action: shopQueryParam ? `/api/sync-translations?${shopQueryParam}` : '/api/sync-translations' 
      });
      
    } catch (error) {
      console.error('Category publish failed:', error);
      addLog(t('logs.categoryPublishFailed', { ns: 'home', name: category.name, error: error.message }), 'error');
      
      // 清理状态
      setSyncingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryKey);
        return newSet;
      });
    }
  }, [selectedLanguage, addLog, syncingCategories, syncFetcher, shopId, shopQueryParam]);

  // Start translation (debounced with operation lock)
  const startTranslation = useCallback(() => {
    debounce('translate', () => {
      safeAsyncOperation('translate', async () => {
        // Validate: nothing to translate
        if (resources.length === 0) {
          addLog(t('logs.translationNoResources', { ns: 'home' }), 'warning');
          showToast(t('home.toasts.noTranslatable'), { isError: true });
          return;
        }

        // Language limit guard: blocking before请求
        if (hasLanguageLimitBlock) {
          const msg = t('errors.languageLimitReached', {
            ns: 'home',
            defaultValue: 'Language limit reached. Please remove a language or upgrade your plan.'
          });
          addLog(msg, 'error');
          showToast(msg, { isError: true });
          return;
        }

        // Credit guard: estimated消耗超额
        if (insufficientCredits) {
          const msg = t('errors.insufficientCreditsForSelection', {
            ns: 'home',
            defaultValue: 'Not enough credits for the selected items. Please top up or reduce the selection.'
          });
          addLog(msg, 'warning');
          showToast(msg, { isError: true });
          return;
        }

        // Check translation service health
        if (translationService && translationService.status === 'unhealthy') {
          const errorMsg = translationService.errors?.[0] || t('home.toasts.translationServiceUnavailable');
          addLog(t('logs.translationServiceUnavailable', { ns: 'home', error: errorMsg }), 'error');
          showToast(t('home.toasts.translationServiceError', { message: errorMsg }), { isError: true });
          return;
        }

        if (hasLanguageLimitBlock) {
          const msg = t('errors.languageLimitReached', {
            ns: 'home',
            defaultValue: `Language limit reached. Plan allows ${maxLanguages}, active ${languageLimit?.activeLanguagesCount ?? 0}. Please remove a language or upgrade your plan.`,
            limit: maxLanguages ?? 0,
            active: languageLimit?.activeLanguagesCount ?? 0,
            includesDraft: true
          });
          addLog(msg, 'error');
          showToast(msg, { isError: true });
          return;
        }

        if (insufficientCredits) {
          const msg = t('errors.insufficientCreditsForSelection', {
            ns: 'home',
            defaultValue: `Not enough credits for the selected items. Need ~${requiredCreditsWithBuffer} credits (incl. 5% buffer), available ${availableCredits}. Please top up or reduce the selection.`,
            required: requiredCreditsWithBuffer,
            available: availableCredits
          });
          addLog(msg, 'warning');
          showToast(msg, { isError: true });
          return;
        }

        // Use all visible resources when none selected
        const resourceIds = selectedResources.length > 0
          ? selectedResources
          : resources.map(r => r.id);

        // Precise log feedback
        const count = resourceIds.length;
        const scope = selectedResources.length > 0 ? 'selected' : 'all';
        addLog(t('logs.translationStart', {
          ns: 'home',
          scope: scope === 'selected' ? t('actions.translateSelected', { ns: 'home', count }) : t('actions.translateAll', { ns: 'home', count }),
          count,
          lang: selectedLanguage,
          cacheNote: clearCache ? ' (clear cache)' : ''
        }), 'info');

        translateFetcher.submit({
          language: selectedLanguage,
          resourceIds: JSON.stringify(resourceIds),
          clearCache: clearCache.toString(),
          forceRelatedTranslation: 'true',
          userRequested: 'true',
          shop: shopId
        }, {
          method: 'POST',
          action: shopQueryParam ? `/api/translate?${shopQueryParam}` : '/api/translate'
        });
      })(); // 立即调用返回的函数
    }, 1000);
  }, [
    selectedLanguage,
    selectedResources,
    resources,
    translationService,
    addLog,
    showToast,
    translateFetcher,
    clearCache,
    debounce,
    safeAsyncOperation,
    shopId,
    shopQueryParam,
    hasLanguageLimitBlock,
    insufficientCredits
  ]);

  // 清空数据（带操作锁）
  useEffect(() => {
    if (translateFetcher.state !== 'idle' || !translateFetcher.data) {
      return;
    }

    const { success, message, data, redirected, mode } = translateFetcher.data;
    if (!success) {
      addLog(t('logs.translationFailed', { ns: 'home', error: message || 'Unknown error' }), 'error');
      showToast(message || t('home.toasts.translationFailed'), { isError: true });
      loadStatus();
      return;
    }

    // 🆕 队列模式特殊处理
    if (redirected && mode === 'queue') {
      addLog(`📋 ${message}`, 'info');
      showToast(message, { isError: false });
      loadStatus();
      return;
    }

    const stats = data?.stats || {};
    const successCount = stats.success || 0;
    const failureCount = stats.failure || 0;
    const skippedCount = stats.skipped || 0;

    if (successCount > 0) {
      addLog(t('logs.translationSuccessCount', { ns: 'home', count: successCount }), 'success');
    }
    if (skippedCount > 0) {
      addLog(t('logs.translationSkippedCount', { ns: 'home', count: skippedCount }), 'info');
    }
    if (failureCount > 0) {
      addLog(t('logs.translationFailureCount', { ns: 'home', count: failureCount }), 'warning');
      showToast(t('home.toasts.translationFailureCount', { count: failureCount }), { isError: true });
    }

    // 🆕 阶段1：消费 relatedSummary（产品关联内容自动处理）
    if (success && data?.relatedSummary) {
      const { options = {}, metafields = {} } = data.relatedSummary;
      const optionsCount = (options.translated || 0) + (options.skipped || 0);
      const metafieldsCount = (metafields.translated || 0) + (metafields.skipped || 0);
      const totalRelated = optionsCount + metafieldsCount;

      if (totalRelated > 0) {
        addLog(
          `ℹ️ Auto-processed ${totalRelated} related items (options: ${optionsCount}, metafields: ${metafieldsCount})`,
          'info'
        );
      }
    }
    // NOTE: 如果 relatedSummary 不存在（旧任务），静默跳过

    loadStatus();
  }, [translateFetcher.state, translateFetcher.data, addLog, showToast, loadStatus]);

  const clearData = useCallback(() => {
    safeAsyncOperation('clear-data', async () => {
      addLog(t('logs.clearDataStart', { ns: 'home', language: selectedLanguage }), 'info');

      clearFetcher.submit({
        type: 'language',
        language: selectedLanguage,
        shop: shopId
      }, {
        method: 'POST',
        action: shopQueryParam ? `/api/clear?${shopQueryParam}` : '/api/clear'
      });

      // Only clear current language data
      setAllLanguagesData(prev => ({
        ...prev,
        [selectedLanguage]: null
      }));

      setSelectedResources([]);
    })();
  }, [addLog, clearFetcher, selectedLanguage, safeAsyncOperation, shopId, shopQueryParam]);

  useEffect(() => {
    if (clearFetcher.state !== 'idle' || !clearFetcher.data) {
      return;
    }

    const { success, data, message } = clearFetcher.data;

    if (success) {
      const result = data || {};
      const finalMessage = message || result.message || `${selectedLanguage} data cleared`;

      addLog(t('logs.clearDataSuccess', { ns: 'home', language: selectedLanguage, defaultValue: finalMessage }), 'success');
      showToast(finalMessage, { duration: 2000 });

      loadStatus(selectedLanguage, viewMode);
    } else {
      const errorMessage = message || t('logs.clearDataFailed', { ns: 'home' });
      addLog(`❌ ${errorMessage}`, 'error');
      showToast(errorMessage, { isError: true });
    }
  }, [clearFetcher.state, clearFetcher.data, addLog, showToast, loadStatus, selectedLanguage, viewMode]);

  // 处理资源选择
  const handleResourceSelection = useCallback((resourceId, checked) => {
    if (checked) {
      setSelectedResources(prev => [...prev, resourceId]);
    } else {
      setSelectedResources(prev => prev.filter(id => id !== resourceId));
    }
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedResources.length === resources.length) {
      setSelectedResources([]);
    } else {
      setSelectedResources(resources.map(r => r.id));
    }
  }, [selectedResources.length, resources]);
  
  // 处理语言更新
  const handleLanguagesUpdated = useCallback((payload = {}) => {
    const languages = payload.languages ?? [];
    const primary = payload.primary ?? primaryLanguage;

    const formattedLanguages = languages
      .map((lang) => ({
        label: lang.label || lang.name,
        value: lang.value || lang.code
      }))
      .filter((lang) => !primary || (lang.value !== (primary.value || primary.code)));

    setDynamicLanguages(formattedLanguages);
    setSelectedLanguage((prev) => {
      if (formattedLanguages.some((lang) => lang.value === prev)) {
        return prev;
      }
      return formattedLanguages[0]?.value ?? prev;
    });
    addLog(t('logs.languageUpdated', { ns: 'home' }), 'success');
  }, [addLog, primaryLanguage]);

  // 语言选择验证和切换处理
  const handleLanguageChange = useCallback((value) => {
    // 语言验证映射
    const languageNames = {
      'de': 'German',
      'nl': 'Dutch',
      'zh-CN': 'Chinese (Simplified)',
      'zh-TW': 'Chinese (Traditional)',
      'en': 'English',
      'fr': 'French',
      'es': 'Spanish',
      'ja': 'Japanese',
      'ko': 'Korean'
    };

    // 记录语言切换
    addLog(t('logs.languageSwitch', { ns: 'home', language: languageNames[value] || value }), 'info');

    // 检测潜在的语言混淆
    if (value === 'nl' && selectedLanguage === 'de') {
      addLog(t('logs.languageSwitchNote1', { ns: 'home' }), 'warning');
    } else if (value === 'de' && selectedLanguage === 'nl') {
      addLog(t('logs.languageSwitchNote2', { ns: 'home' }), 'warning');
    }

    if (primaryLanguage && value === primaryLanguage.value) {
      addLog(t('logs.defaultLanguageWarning', { ns: 'home' }), 'warning');
      return;
    }

    // 验证语言是否在可用列表中
    const isValidLanguage = dynamicLanguages.some(lang => lang.value === value);
    if (!isValidLanguage) {
      addLog(t('logs.languageNotAllowed', { ns: 'home', language: value }), 'error');
      return;
    }

    setSelectedLanguage(value);
    // 切换语言后重新加载状态
    loadStatus(value);
  }, [selectedLanguage, addLog, dynamicLanguages, primaryLanguage, loadStatus]);
  
  // 处理语言添加
  const handleLanguageAdded = useCallback((languageCodes) => {
    addLog(t('logs.languageAdded', { ns: 'home', count: languageCodes.length }), 'success');
    showToast(t('home.toasts.addLanguageSuccess', { count: languageCodes.length }), { duration: 3000 });
  }, [addLog, showToast]);

  // Phase 2: 发布处理函数（带防抖和操作锁）
  const publishPendingTranslations = useCallback(() => {
    debounce('publish', () => {
      safeAsyncOperation('publish-translations', async () => {
        setIsPublishing(true);
        addLog(t('logs.publishPendingStart', { ns: 'home' }), 'info');

        publishFetcher.submit({
          language: selectedLanguage,
          publishAll: "false", // only current language
          shop: shopId
        }, {
          method: 'POST',
          action: shopQueryParam ? `/api/publish?${shopQueryParam}` : '/api/publish'
        });
      })(); // 立即调用返回的函数
    }, 1500); // 发布操作延迟更长，避免重复
  }, [addLog, publishFetcher, selectedLanguage, debounce, safeAsyncOperation, shopId, shopQueryParam]);

  const publishAllPending = useCallback(() => {
    debounce('publishAll', () => {
      safeAsyncOperation('batch-publish', async () => {
        setIsPublishing(true);
        addLog(t('logs.publishAllStart', { ns: 'home' }), 'info');

        batchPublishFetcher.submit({
          batchSize: "5", // limit per batch to avoid rate limits
          delayMs: "1000", // delay between batches
          filters: JSON.stringify({}), // publish all languages
          shop: shopId
        }, {
          method: 'POST',
          action: shopQueryParam ? `/api/batch-publish?${shopQueryParam}` : '/api/batch-publish'
        });
      })(); // 立即调用返回的函数
    }, 2000); // 批量发布延迟最长
  }, [addLog, batchPublishFetcher, debounce, safeAsyncOperation, shopId, shopQueryParam]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending': return <Badge tone="attention">Pending</Badge>;
      case 'processing': return <Badge tone="info">In progress</Badge>;
      case 'completed': return <Badge tone="success">Completed</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  // 获取翻译服务状态显示
  const getTranslationServiceStatus = () => {
    if (!translationService) return null;
    
    const isHealthy = translationService.status === 'healthy';
    const tone = isHealthy ? 'success' : 'critical';
    const icon = isHealthy ? '✅' : '❌';
    
    return (
      <InlineStack gap="200" align="center">
        <Text variant="bodySm">{icon} {t('service.translationLabel', { ns: 'home' })}</Text>
        <Badge tone={tone}>
          {isHealthy ? t('status.healthy', { ns: 'home' }) : t('status.unhealthy', { ns: 'home' })}
        </Badge>
        {!isHealthy && translationService.errors && (
          <Text variant="bodySm" tone="critical">
            {translationService.errors[0]}
          </Text>
        )}
      </InlineStack>
    );
  };

  if (typeof window !== 'undefined' && (!hasHostParam || !isAppBridgeReady)) {
    const loginUrl = shopId
      ? `/auth/login?shop=${encodeURIComponent(shopId)}`
      : '/auth/login';

    return (
      <Page>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Banner tone="warning" title={t("fallback.missingAppBridge")}>
                  <List type="number">
                    <List.Item>{t('fallback.needShopifyAdmin')}</List.Item>
                    <List.Item>{t('fallback.missingHostTitle')}</List.Item>
                  </List>
                  <Text variant="bodySm">
                    {t('fallback.missingHostTip')} ({hasHostParam ? 'host ✓' : 'host ✗'})
                  </Text>
                </Banner>
                <Text as="h2" variant="headingMd">
                  {t("fallback.needShopifyAdmin")}
                </Text>
                <Text variant="bodyMd">
                  {t("fallback.missingAppBridge")}
                </Text>
                {!hasHostParam && (
                  <Banner tone="warning" title={t("fallback.missingHostTitle")}>
                    <Text variant="bodySm">
                      {t("fallback.missingHostTip")}
                    </Text>
                  </Banner>
                )}
                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    onClick={() => {
                      try {
                        if (window.top) {
                          window.top.location.href = loginUrl;
                          return;
                        }
                      } catch {}
                      window.location.href = loginUrl;
                    }}
                  >
                    {t("actions.reauthorize")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => window.location.reload()}
                  >
                    {t("actions.refreshPage")}
                  </Button>
                </InlineStack>
                <Text variant="bodySm" tone="subdued">
                  {t("fallback.troubleshoot")}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page>
      <TitleBar title={t("pages.home.testTitle")}>
        <Button variant="primary" onClick={loadStatus}>
          {t("actions.refreshStatus")}
        </Button>
      </TitleBar>
      
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <CreditBar
              credits={credits}
              subscription={subscription}
              plans={plans}
              onUpgrade={handleOpenUpgrade}
              canCancel={canCancelSubscription}
              onCancel={handleOpenCancel}
            />
          </Layout.Section>
        </Layout>

        {creditWarningLevel && (
          <Layout>
            <Layout.Section>
              <Banner
                tone={creditWarningLevel === 'critical' ? 'critical' : 'warning'}
                title={creditWarningLevel === 'critical' ? t('subscription.creditsCriticalTitle', { ns: 'home' }) : t('subscription.creditsLowTitle', { ns: 'home' })}
              >
                <Text variant="bodySm">
                  {t('subscription.remaining', { ns: 'home', available: credits ? formatCompactNumber(credits.available) : '--', total: credits ? formatCompactNumber(credits.total) : '--' })}
                </Text>
                {upgradeOptions.length > 0 && (
                  <InlineStack gap="200" align="end">
                    <Button onClick={handleOpenUpgrade} size="slim" primary>
                      {t('actions.upgrade', { ns: 'home', defaultValue: 'Upgrade plan' })}
                    </Button>
                  </InlineStack>
                )}
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        <Modal
          open={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
          title="Upgrade plan"
          primaryAction={{
            content: isUpgrading ? 'Upgrading...' : 'Confirm upgrade',
            onAction: handleSubmitUpgrade,
            loading: isUpgrading,
            disabled: !selectedPlanId || upgradeOptions.length === 0
          }}
          secondaryActions={[{
            content: 'Cancel',
            onAction: () => setUpgradeModalOpen(false),
            disabled: isUpgrading
          }]}
        >
          <Modal.Section>
            {upgradeOptions.length === 0 ? (
              <Text variant="bodyMd">You are already on the highest plan. Contact support for higher limits.</Text>
            ) : (
              <BlockStack gap="300">
                <Select
                  label="Choose a plan"
                  options={upgradeOptions.map((plan) => ({
                    label: `${plan.displayName} · ${plan.monthlyCredits.toLocaleString()} credits/mo · ~${formatCompactNumber(plan.monthlyCredits * creditToChars)} chars`,
                    value: plan.id
                  }))}
                  value={(selectedPlanId || upgradeOptions[0]?.id) ?? ''}
                  onChange={setSelectedPlanId}
                />
                {selectedUpgradePlan && (
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="bodySm">
                        Price: ${selectedUpgradePlan.price}/month · Credits: {selectedUpgradePlan.monthlyCredits.toLocaleString()} per month (~{formatCompactNumber(selectedUpgradePlan.monthlyCredits * creditToChars)} chars)
                      </Text>
                      {currentPlan && upgradeDelta != null && (
                        <Text variant="bodySm" color="subdued">
                          Current plan {currentPlan.displayName}: {currentPlan.monthlyCredits.toLocaleString()} credits/mo. This upgrade adds {upgradeDelta.toLocaleString()} credits.
                        </Text>
                      )}
                    </BlockStack>
                  </Card>
                )}
                <Text variant="bodySm" tone="subdued">
                  New credits take effect immediately; used credits remain. You can cancel later from settings or via support.
                </Text>
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>

        <Modal
          open={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          title="Cancel subscription"
          primaryAction={{
            content: isCancelling ? 'Processing...' : 'Confirm cancel',
            destructive: true,
            onAction: handleConfirmCancel,
            loading: isCancelling
          }}
          secondaryActions={[{
            content: 'Keep subscription',
            onAction: () => setCancelModalOpen(false),
            disabled: isCancelling
          }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text variant="bodyMd">
                Confirm cancel plan {currentPlan?.displayName || ''}? You will immediately lose premium credits/features. Used credits are non-refundable.
              </Text>
              <Text variant="bodySm" tone="subdued">
                You can upgrade or resubscribe anytime from this page.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Network warning */}
        {appBridgeError && (
          <Layout>
            <Layout.Section>
              <Card tone="critical">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">{t('network.issueTitle', { ns: 'home' })}</Text>
                  <Text variant="bodyMd">
                    {t('network.description', { ns: 'home' })}
                  </Text>
                  <BlockStack gap="200">
                    <Text variant="bodySm">• {t('network.browserExtensions', { ns: 'home' })}</Text>
                    <Text variant="bodySm">• {t('network.appBridge', { ns: 'home' })}</Text>
                    <Text variant="bodySm">• {t('network.firewall', { ns: 'home' })}</Text>
                  </BlockStack>
                  <Text variant="bodySm" tone="subdued">
                    {t('network.tip', { ns: 'home' })}
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* Translation service status */}
        {translationService && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">{t('service.serviceStatus', { ns: 'home' })}</Text>
                  {getTranslationServiceStatus()}

                  {translationService.status === 'unhealthy' && (
                    <Banner tone="critical" title={t('service.unavailableTitle', { ns: 'home' })}>
                      <BlockStack gap="200">
                        <Text variant="bodySm">
                          {translationService.errors?.[0] || t('service.unableToConnect', { ns: 'home' })}
                        </Text>
                        {translationService.diagnostics?.endpoints?.[0] && (
                          <BlockStack gap="100">
                            <Text variant="bodySm" tone="critical">
                              {t('service.primaryDiagnostics', { ns: 'home', summary: translationService.diagnostics.endpoints[0].summary })}
                            </Text>
                            {translationService.diagnostics.endpoints[0].checks?.map((check, index) => (
                              <Text key={index} variant="bodySm" tone={check.status === 'success' ? 'subdued' : 'critical'}>
                                · {check.name}: {check.status} {check.data?.httpStatus ? `(HTTP ${check.data.httpStatus})` : ''}
                              </Text>
                            ))}
                          </BlockStack>
                        )}
                        {translationService.diagnostics?.recommendations?.length > 0 && (
                          <BlockStack gap="100">
                            <Text variant="bodySm" tone="critical">{t('service.suggestedActions', { ns: 'home' })}</Text>
                            {translationService.diagnostics.recommendations.map((tip, index) => (
                              <Text key={index} variant="bodySm" tone="critical">
                                • {tip}
                              </Text>
                            ))}
                          </BlockStack>
                        )}
                        <InlineStack gap="200">
                          <Button size="slim" onClick={() => loadStatus(selectedLanguage, viewMode, true)}>
                            {t('service.retryHealthCheck', { ns: 'home' })}
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Banner>
                  )}

                  {translationService.warnings && translationService.warnings.length > 0 && (
                    <BlockStack gap="200">
                      {translationService.warnings.map((warning, index) => (
                        <Text key={index} variant="bodySm" tone="warning">
                          ⚠️ {warning}
                        </Text>
                      ))}
                    </BlockStack>
                  )}
                  
                      {translationService.config && (
                    <InlineStack gap="400">
                      <Text variant="bodySm">
                        {translationService.config.apiKeyConfigured ? t('service.apiConfigured', { ns: 'home' }) : t('service.apiNotConfigured', { ns: 'home' })}
                      </Text>
                      <Text variant="bodySm">
                        {t('service.modelConnected', { ns: 'home' })}
                      </Text>
                      <Text variant="bodySm">
                        {t('service.timeout', { ns: 'home', value: translationService.config.timeout })}
                      </Text>
                      {typeof translationService.config.maxRequestsPerMinute === 'number' && (
                        <Text variant="bodySm">
                          {t('service.rateLimit', { ns: 'home', value: translationService.config.maxRequestsPerMinute })}
                        </Text>
                      )}
                      {typeof translationService.config.minRequestIntervalMs === 'number' && (
                        <Text variant="bodySm">
                          {t('service.minInterval', { ns: 'home', value: translationService.config.minRequestIntervalMs })}
                        </Text>
                      )}
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* Controls */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t('ui.controlPanel', { ns: 'home' })}</Text>
                
                <BlockStack gap="400">
                  <Select
                    label={t('ui.targetLanguage', { ns: 'home' })}
                    options={dynamicLanguages}
                    value={selectedLanguage}
                    onChange={handleLanguageChange}
                    helpText={t('ui.chooseTargetLanguage', { ns: 'home' })}
                  />
                  
                  <Select
                    label={t('ui.filterView', { ns: 'home' })}
                    options={[
                      { label: t('filterOptions.all', { ns: 'home' }), value: 'all' },
                      { label: t('filterOptions.withTranslations', { ns: 'home' }), value: 'with-translations' },
                      { label: t('filterOptions.withoutTranslations', { ns: 'home' }), value: 'without-translations' }
                    ]}
                    value={viewMode}
                    onChange={(value) => {
                      setViewMode(value);
                      loadStatus(selectedLanguage, value);
                    }}
                    helpText={viewMode !== 'all' ? 
                      (viewMode === 'with-translations'
                        ? t('ui.filterHelpWith', { ns: 'home' })
                        : t('ui.filterHelpWithout', { ns: 'home' })) : 
                      t('ui.filterHelpAll', { ns: 'home' })
                    }
                  />
                  
                  <Box>
                    <LanguageManager
                      currentLanguages={dynamicLanguages}
                      primaryLanguage={primaryLanguage}
                      onLanguageAdded={handleLanguageAdded}
                      onLanguagesUpdated={handleLanguagesUpdated}
                      shopId={shopId}
                      languageLimit={billing?.languageLimit}
                    />
                  </Box>
                </BlockStack>

                {primaryLanguage && (
                  <Text variant="bodySm" tone="subdued">
                    {t('ui.defaultLanguageNote', { ns: 'home', name: primaryLanguage.label })}
                  </Text>
                )}

                <Box>
                  <Checkbox
                    label={t('ui.clearCacheAndRetranslate', { ns: 'home' })}
                    checked={clearCache}
                    onChange={setClearCache}
                    helpText={t('ui.clearCacheHelp', { ns: 'home' })}
                  />
                </Box>
                
                <BlockStack gap="300">
                  <InlineStack gap="200">
                    <Button
                      onClick={scanAllResources}
                      loading={isScanning}
                      variant="primary"
                    >
                      {t('actions.scanResources', { ns: 'home' })}
                    </Button>
                    <Tooltip
                      content={translateDisabledReason}
                      active={Boolean(translateDisabledReason)}
                      preferredPosition="above"
                    >
                      <Button
                        onClick={startTranslation}
                        loading={isTranslating}
                        variant="primary"
                        disabled={
                          resources.length === 0 ||
                          (translationService && translationService.status === 'unhealthy') ||
                          !canTranslate
                        }
                      >
                        {selectedResources.length > 0
                          ? t('actions.translateSelected', { ns: 'home', count: selectedResources.length })
                          : resources.length > 0
                            ? t('actions.translateAll', { ns: 'home', count: resources.length })
                            : t('empty.noResources', { ns: 'home' })}
                      </Button>
                    </Tooltip>
                    <Button
                      onClick={clearData}
                      loading={isClearing}
                      variant="tertiary"
                      tone="critical"
                    >
                      {t('actions.clearData', { ns: 'home' })}
                    </Button>
                  </InlineStack>

                  <BlockStack gap="150">
                    <Text variant="bodySm" tone="subdued">
                      {t('ui.scanningNote', { ns: 'home', credits: formatCompactNumber(availableCredits), chars: formatCompactNumber(availableCredits * creditToChars) })} {` ${estimatedSummaryWithLimit}`}
                    </Text>
                    {!hasActiveSubscription && (
                      <Banner tone="warning" title={t('subscription.inactiveTitle', { ns: 'home' })}>
                        <Text variant="bodySm">
                          {t('subscription.inactiveBody', { ns: 'home' })}
                        </Text>
                      </Banner>
                    )}
                    {hasActiveSubscription && availableCredits <= 0 && (
                      <Banner tone="critical" title={t('home.subscription.noCreditsTitle')}>
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="bodySm">
                            {t('home.subscription.noCreditsBody')}
                          </Text>
              <Button size="slim" onClick={handleOpenUpgrade}>
                {t('home.subscription.viewPlans')}
              </Button>
            </InlineStack>
          </Banner>
        )}
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text variant="headingSm">{t('home.publish.title')}</Text>
                    <InlineStack gap="200">
                      <BlockStack gap="100">
                        <Button
                          onClick={publishPendingTranslations}
                          loading={isPublishing}
                          variant="primary"
                          tone="success"
                          disabled={!stats.pendingTranslations}
                        >
                          {t('home.publish.now', { count: stats.pendingTranslations || 0 })}
                        </Button>
                        <Text variant="bodySm" tone="subdued">
                          {t('home.publish.nowHelp')}
                        </Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Button
                          onClick={publishAllPending}
                          loading={isPublishing}
                          variant="secondary"
                          tone="success"
                          disabled={!stats.totalPendingTranslations}
                        >
                          {t('home.publish.all', { count: stats.totalPendingTranslations || 0 })}
                        </Button>
                        <Text variant="bodySm" tone="subdued">
                          {t('home.publish.allHelp')}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* 🆕 阶段1：产品翻译说明 Banner */}
        {stats.total > 0 && resources.some(r => r.resourceType === 'PRODUCT') && (
          <Layout>
            <Layout.Section>
              <Banner tone="info" title={t('home.tips.productTitle')}>
                <Text variant="bodySm">
                  {t('home.tips.productBody')}
                </Text>
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        {/* 智能提示Banner */}
        {stats.translated === 0 && viewMode === 'all' && resources.length > 0 && (
          <Layout>
            <Layout.Section>
              <Banner status="info" title={t('home.empty.startTitle')}>
                {t('home.empty.startBody')}
              </Banner>
            </Layout.Section>
          </Layout>
        )}
        
        {viewMode === 'with-translations' && resources.length === 0 && (
          <Layout>
            <Layout.Section>
              <Banner>
                {t('home.empty.noTranslated')}
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        {/* 统计信息 */}
        <Layout>
          <Layout.Section>
            <InlineStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{t('home.stats.total')}</Text>
                  <Text as="p" variant="headingLg">{stats.total || 0}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{t('home.stats.pending')}</Text>
                  <Text as="p" variant="headingLg" tone="critical">{stats.pending || 0}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{t('home.stats.translated')}</Text>
                  <Text as="p" variant="headingLg" tone="success">{stats.translated || 0}</Text>
                  {stats.translationRate !== undefined && (
                    <Text variant="bodySm" tone="subdued">
                      {t('home.stats.completion', { rate: stats.translationRate })}
                    </Text>
                  )}
                </BlockStack>
              </Card>            </InlineStack>
          </Layout.Section>
        </Layout>

        {/* 语言域名配置入口 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd">{t('stats.languageDomainMapping', { ns: 'home' })}</Text>
                    <Text variant="bodySm" color="subdued">
                      {t('stats.viewUrlMappings', { ns: 'home' })}
                    </Text>
                  </BlockStack>
                  <Button url="/app/language-domains" size="slim">
                    {t('stats.viewConfiguration', { ns: 'home' })}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Operation logs */}
        {logs.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">{t('empty.operationLogs', { ns: 'home' })}</Text>
                  <Box style={{maxHeight: "200px", overflowY: "scroll"}}>
                    <BlockStack gap="100">
                      {logs.map((log, index) => (
                        <Text 
                          key={index} 
                          variant="bodySm" 
                          tone={log.type === 'error' ? 'critical' : log.type === 'warning' ? 'warning' : log.type === 'success' ? 'success' : undefined}
                        >
                          [{log.timestamp}] {log.message}
                        </Text>
                      ))}
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* Resource categories */}
        {resources.length > 0 ? (
          <ResourceCategoryDisplay 
            resources={resources}
            selectedResources={selectedResources}
            onSelectionChange={handleResourceSelection}
            currentLanguage={selectedLanguage}
            onResourceClick={(resource) => {
              // 统一路由处理 - Linus哲学：消除特殊情况
              const resourceType = resource.resourceType.toLowerCase();
              
              // 所有资源使用统一路由格式
              // Theme资源保持向后兼容，其他资源使用新路由
              // 确保lang参数始终有效
              const targetLang = selectedLanguage ||
                                 (supportedLanguages[0]?.value ?? supportedLanguages[0]?.locale);
              if (!targetLang) {
                if (typeof window !== 'undefined' && window.shopify?.toast) {
                  window.shopify.toast.show('Please select a target language', { isError: true });
                }
                return;
              }

              if (resourceType.includes('theme') || resourceType.includes('online_store')) {
                // 保持Theme专用页面的向后兼容
                navigate(`/app/theme/detail/${resource.id}?lang=${targetLang}`);
              } else {
                // 所有其他资源使用统一路由
                navigate(`/app/resource/${resourceType}/${resource.id}?lang=${targetLang}`);
              }
            }}
            onTranslateCategory={handleCategoryTranslation}
            onSyncCategory={handleCategorySync}
            translatingCategories={translatingCategories}
            syncingCategories={syncingCategories}
            clearCache={clearCache}
          />
        ) : (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="3">
                  <Text as="h2" variant="headingMd">{t('empty.noResources', { ns: 'home' })}</Text>
                  <Text as="p" tone="subdued">
                    {t('empty.scanToStart', { ns: 'home' })}
                  </Text>
                  <InlineStack gap="2">
                    <Button onClick={scanSelectedResourceType} loading={isScanning}>
                      {t('empty.scanSelected', { ns: 'home', label: resourceTypeOptions.find(opt => opt.value === selectedResourceType)?.label || selectedResourceType })}
                    </Button>
                    <Button onClick={scanProducts} variant="secondary" loading={isScanning}>
                      {t('empty.quickScanProducts', { ns: 'home' })}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}

// 使用错误边界包装组件
export default function IndexWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <Index />
    </ErrorBoundary>
  );
}
