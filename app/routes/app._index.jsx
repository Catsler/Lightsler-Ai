import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
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
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
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

const RESOURCE_TYPE_LABELS = {
  PRODUCT: '产品',
  COLLECTION: '集合',
  PRODUCT_OPTION: '产品选项',
  PRODUCT_METAFIELD: '产品元字段',
  PRODUCT_OPTION_VALUE: '产品选项值',
  ARTICLE: '博客文章',
  BLOG: '博客',
  PAGE: '页面',
  FILTER: '筛选条件',
  MENU: '菜单',
  LINK: '链接',
  SHOP: '店铺',
  SHOP_POLICY: '店铺政策',
  ONLINE_STORE_THEME: '主题资源',
  ONLINE_STORE_THEME_JSON_TEMPLATE: '主题模板',
  ONLINE_STORE_THEME_SETTINGS_CATEGORY: '主题设置',
  ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS: '主题区块',
  ONLINE_STORE_THEME_SECTION_GROUP: '主题区块组',
  ONLINE_STORE_THEME_APP_EMBED: '主题App嵌入',
  ONLINE_STORE_THEME_LOCALE_CONTENT: '主题语言内容',
  SELLING_PLAN: '订阅计划',
  SELLING_PLAN_GROUP: '订阅计划组'
};

function getResourceTypeLabel(type) {
  const normalized = String(type || '').toUpperCase();
  return RESOURCE_TYPE_LABELS[normalized] || normalized || 'UNKNOWN';
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

  // 从 Shopify 读取店铺语言，区分默认语言与目标语言
  const shopLocales = await getShopLocales(admin);
  const primaryLocale = shopLocales.find((locale) => locale.primary) || null;
  const alternateLocales = shopLocales.filter((locale) => !locale.primary);

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

  return {
    supportedLanguages,
    primaryLanguage: primaryLocale
      ? { label: primaryLocale.name || primaryLocale.locale, value: primaryLocale.locale }
      : null,
    shopId: session.shop
  };
};

function Index() {
  console.log('[Index Component] Rendering started');
  
  const { supportedLanguages, primaryLanguage, shopId } = useLoaderData();
  console.log('[Index Component] Loader data:', { supportedLanguages, primaryLanguage, shopId });
  
  const scanProductsFetcher = useFetcher();
  const scanCollectionsFetcher = useFetcher();
  const scanResourcesFetcher = useFetcher();
  const scanAllFetcher = useFetcher();
  const translateFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const clearFetcher = useFetcher();
  
  const shopQueryParam = shopId ? `shop=${encodeURIComponent(shopId)}` : '';
  
  // React Hooks必须在顶层调用，不能在条件语句中
  const shopify = useAppBridge();
  const navigate = useNavigate();
  console.log('[Index Component] App Bridge initialized successfully');
  
  // Language selector persistence: read saved preference on init
  const [viewMode, setViewMode] = useState('all');  // 新增：视图模式状态
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
      console.error('Toast显示错误:', error);
      addLog(message, options.isError ? 'error' : 'info');
      setAppBridgeError(true);
    }
  }, [shopify, addLog]);

  // 操作锁机制
  const withOperationLock = useCallback((operationKey, fn) => {
    return async (...args) => {
      // 检查是否已有相同操作在进行
      if (operationLock.has(operationKey)) {
        console.warn(`[UI] 操作 ${operationKey} 正在进行中，跳过重复请求`);
        addLog(`⚠️ ${operationKey} 操作正在进行中...`, 'warning');
        return;
      }

      try {
        // 设置操作锁
        setOperationLock(prev => new Set([...prev, operationKey]));

        // 执行操作
        await fn(...args);
      } catch (error) {
        console.error(`[UI] 操作 ${operationKey} 失败:`, error);
        addLog(`❌ ${operationKey} 操作失败: ${error.message}`, 'error');
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
      console.log(`[Language Switch] 语言 ${selectedLanguage} 暂无数据`);
    } else {
      console.log(`[Language Switch] 加载 ${selectedLanguage} 缓存数据，资源数: ${languageData.resources?.length || 0}`);
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
    // Products
    { label: 'Products', value: 'PRODUCT' },
    { label: 'Collections', value: 'COLLECTION' },

    // Online Store
    { label: 'Blog posts', value: 'ARTICLE' },
    { label: 'Blog titles', value: 'BLOG' },
    { label: 'Pages', value: 'PAGE' },
    { label: 'Filters', value: 'FILTER' },
    // Metafields（探测性支持，避免默认暴露扫描入口）——如需扫描可手动添加
    // { label: 'Metafields', value: 'METAFIELD' },
    { label: 'Policies', value: 'SHOP_POLICY' },
    { label: 'Store metadata', value: 'SHOP' },

    // Content
    { label: 'Menu', value: 'MENU' },

    // Theme
    { label: 'App embeds', value: 'ONLINE_STORE_THEME_APP_EMBED' },
    { label: 'Section groups', value: 'ONLINE_STORE_THEME_SECTION_GROUP' },
    { label: 'Static sections', value: 'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS' },
    { label: 'Templates', value: 'ONLINE_STORE_THEME_JSON_TEMPLATE' },
    { label: 'Theme settings', value: 'ONLINE_STORE_THEME_SETTINGS_CATEGORY' },
    { label: 'Locale content', value: 'ONLINE_STORE_THEME_LOCALE_CONTENT' },
  ], []);

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
          console.error('状态加载失败:', error);
          addLog('⚠️ 网络连接异常，请检查网络设置', 'error');
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
          const currentError = serviceData.errors?.[0] || '未知错误';
          if (currentError !== lastServiceError) {
            addLog(`⚠️ 翻译服务异常: ${currentError}`, 'error');
            setLastServiceError(currentError);
          }
        } else if (lastServiceError) {
          // Service recovered normally
          addLog('[RECOVERY] Translation service restored', 'success');
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
              addLog(`✅ ${categoryKey} 分类翻译完成: 成功 ${successCount} 个，失败 ${failureCount} 个`, 'success');
              showToast(`${categoryKey} 分类翻译完成！`, { duration: 3000 });
            } else {
              addLog(`⚠️ ${categoryKey} 分类翻译完成，但没有成功的项目`, 'warning');
            }
            
            // 刷新状态
            loadStatus();
          } else {
            const errorMsg = fetcher.data.error || '翻译失败';
            addLog(`❌ ${categoryKey} 分类翻译失败: ${errorMsg}`, 'error');
            showToast(`翻译失败: ${errorMsg}`, { isError: true });
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
            addLog(`✅ 分类发布完成: 成功 ${successCount} 个，失败 ${failedCount} 个`, 'success');
            showToast(`分类发布成功！`, { duration: 3000 });
          } else if (failedCount > 0) {
            addLog(`⚠️ 分类发布完成，但有 ${failedCount} 个失败`, 'warning');
          } else {
            addLog(`ℹ️ 分类暂无需要发布的内容`, 'info');
          }
          
          // 刷新状态
          loadStatus();
        } else {
          const errorMsg = syncFetcher.data.error || '发布失败';
          addLog(`❌ 分类发布失败: ${errorMsg}`, 'error');
          showToast(`发布失败: ${errorMsg}`, { isError: true });
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

    if (typeof responseData !== 'object' || !('success' in responseData)) {
      addLog('❌ 发布失败: API响应格式异常', 'error');
      showToast('发布失败: API响应格式异常', { isError: true });
      return;
    }

    if (responseData.success) {
      const { published = 0, total = 0, errors = [] } = responseData;
      const successRate = total > 0 ? ((published / total) * 100).toFixed(1) : '100';

      addLog(`✅ 发布完成: ${published}/${total} 成功 (${successRate}%)`, 'success');
      showToast(`发布成功！已发布 ${published} 个翻译`, { duration: 3000 });

      if (errors.length > 0) {
        addLog(`⚠️ 有 ${errors.length} 个翻译发布失败，请查看详细错误`, 'warning');
      }

      // 刷新状态
      loadStatus();
    } else {
      // 🔍 调试：保留原始响应结构供排查
      console.debug('[Publish Error] Raw response:', responseData);
      const errorMsg = responseData.error || responseData.message || '发布失败';
      addLog(`❌ 发布失败: ${errorMsg}`, 'error');
      showToast(`发布失败: ${errorMsg}`, { isError: true });
    }
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

    if (typeof responseData !== 'object' || !('success' in responseData)) {
      addLog('❌ 批量发布失败: API响应格式异常', 'error');
      showToast('批量发布失败: API响应格式异常', { isError: true });
      return;
    }

    if (responseData.success) {
      const {
        published = 0,
        total = 0,
        successRate = '0%',
        byType = {},
        errors = []
      } = responseData;

      let detailMessage = `✅ 批量发布完成: ${published}/${total} 成功 (${successRate})`;

      const typeEntries = Object.entries(byType);
      if (typeEntries.length > 0) {
        const hiddenTypes = new Set(['PRODUCT_OPTION', 'PRODUCT_METAFIELD', 'PRODUCT_OPTION_VALUE']);
        detailMessage += '\n\n按类型统计:';
        typeEntries
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([type, stats]) => {
            const successCount = stats?.success ?? 0;
            const failedCount = stats?.failed ?? 0;
            const suffix = hiddenTypes.has(type) ? ' (自动处理)' : '';
            detailMessage += `\n  • ${getResourceTypeLabel(type)}: ${successCount} 成功`;
            if (failedCount > 0) {
              detailMessage += `, ${failedCount} 失败`;
            }
            detailMessage += suffix;
          });
      }

      addLog(detailMessage, 'success');
      showToast(`批量发布成功！已发布 ${published} 个翻译`, { duration: 3000 });

      if (Array.isArray(errors) && errors.length > 0) {
        addLog(`⚠️ 有 ${errors.length} 个翻译发布失败，请查看详细错误`, 'warning');
      }

      // 刷新状态
      loadStatus();
    } else {
      // 🔍 调试：保留原始响应结构供排查
      console.debug('[Batch Publish Error] Raw response:', responseData);
      const errorMsg = responseData.error || responseData.message || '批量发布失败';
      addLog(`❌ 批量发布失败: ${errorMsg}`, 'error');
      showToast(`批量发布失败: ${errorMsg}`, { isError: true });
    }
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
      addLog('🔍 开始扫描产品...', 'info');
      scanProductsFetcher.submit(
        shopId ? { shop: shopId } : {},
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-products?${shopQueryParam}` : '/api/scan-products'
        }
      );
    } catch (error) {
      console.error('扫描产品失败:', error);
      addLog('❌ 扫描产品失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanProductsFetcher, shopId, shopQueryParam]);

  // 扫描集合
  const scanCollections = useCallback(() => {
    try {
      addLog('🔍 开始扫描集合...', 'info');
      scanCollectionsFetcher.submit(
        shopId ? { shop: shopId } : {},
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-collections?${shopQueryParam}` : '/api/scan-collections'
        }
      );
    } catch (error) {
      console.error('扫描集合失败:', error);
      addLog('❌ 扫描集合失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanCollectionsFetcher, shopId, shopQueryParam]);

  // 扫描所有资源
  const scanAllResources = useCallback(() => {
    try {
      addLog('🔍 开始扫描所有资源类型...', 'info');
      scanAllFetcher.submit(
        shopId ? { shop: shopId } : {},
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-all?${shopQueryParam}` : '/api/scan-all'
        }
      );
    } catch (error) {
      console.error('扫描所有资源失败:', error);
      addLog('❌ 扫描所有资源失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanAllFetcher, shopId, shopQueryParam]);

  // 扫描选定的资源类型
  const scanSelectedResourceType = useCallback(() => {
    try {
      const selectedType = resourceTypeOptions.find(opt => opt.value === selectedResourceType);
      addLog(`🔍 开始扫描${selectedType?.label || selectedResourceType}...`, 'info');
      scanResourcesFetcher.submit(
        { resourceType: selectedResourceType, ...(shopId ? { shop: shopId } : {}) },
        {
          method: 'POST',
          action: shopQueryParam ? `/api/scan-resources?${shopQueryParam}` : '/api/scan-resources',
          encType: 'application/json'
        }
      );
    } catch (error) {
      console.error('扫描资源失败:', error);
      addLog('❌ 扫描资源失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanResourcesFetcher, selectedResourceType, resourceTypeOptions, shopId, shopQueryParam]);

  // 处理分类翻译
  const handleCategoryTranslation = useCallback((categoryKey, resourceIds) => {
    try {
      // 检查是否已在翻译中
      if (translatingCategories.has(categoryKey)) {
        addLog(`⏳ ${categoryKey} 分类正在翻译中，请稍候...`, 'warning');
        return;
      }
      
      // 检查翻译服务状态
      if (translationService && translationService.status === 'unhealthy') {
        const errorMsg = translationService.errors?.[0] || '翻译服务不可用';
        addLog(`❌ 翻译服务异常: ${errorMsg}`, 'error');
        showToast(`翻译服务异常: ${errorMsg}`, { isError: true });
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
        addLog(`⚠️ 同时翻译的分类过多，请稍后再试`, 'warning');
        return;
      }
      
      // 设置翻译状态
      setTranslatingCategories(prev => new Set([...prev, categoryKey]));
      
      addLog(`🔄 开始翻译 ${categoryKey} 分类 (${resourceIds.length} 个资源) 到 ${selectedLanguage}...`, 'info');
      
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
      console.error('分类翻译失败:', error);
      addLog(`❌ ${categoryKey} 分类翻译失败: ${error.message}`, 'error');
      
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
      // 检查是否已在发布中
      if (syncingCategories.has(categoryKey)) {
        addLog(`⚠️ ${category.name} 分类正在发布中，请稍候...`, 'warning');
        return;
      }
      
      // 设置发布状态
      setSyncingCategories(prev => new Set([...prev, categoryKey]));
      
      addLog(`🚀 开始发布 ${category.name} 分类到Shopify...`, 'info');
      
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
      console.error('分类发布失败:', error);
      addLog(`❌ ${category.name} 分类发布失败: ${error.message}`, 'error');
      
      // 清理状态
      setSyncingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryKey);
        return newSet;
      });
    }
  }, [selectedLanguage, addLog, syncingCategories, syncFetcher, shopId, shopQueryParam]);

  // 开始翻译（带防抖和操作锁）
  const startTranslation = useCallback(() => {
    debounce('translate', () => {
      safeAsyncOperation('翻译', async () => {
        // 提前验证：没有资源时直接返回
        if (resources.length === 0) {
          addLog('❌ 没有可翻译的资源', 'warning');
          showToast('没有可翻译的资源', { isError: true });
          return;
        }

        // 检查翻译服务状态
        if (translationService && translationService.status === 'unhealthy') {
          const errorMsg = translationService.errors?.[0] || '翻译服务不可用';
          addLog(`❌ 翻译服务异常: ${errorMsg}`, 'error');
          showToast(`翻译服务异常: ${errorMsg}`, { isError: true });
          return;
        }

        // KISS：空选时使用所有可见资源
        const resourceIds = selectedResources.length > 0
          ? selectedResources
          : resources.map(r => r.id);

        // 准确的日志反馈
        const count = resourceIds.length;
        const scope = selectedResources.length > 0 ? '选中的' : '全部';
        addLog(`🔄 开始翻译${scope} ${count} 个资源到 ${selectedLanguage}...${clearCache ? ' (清除缓存)' : ''}`, 'info');

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
  }, [selectedLanguage, selectedResources, resources, translationService, addLog, showToast, translateFetcher, clearCache, debounce, safeAsyncOperation, shopId, shopQueryParam]);

  // 清空数据（带操作锁）
  useEffect(() => {
    if (translateFetcher.state !== 'idle' || !translateFetcher.data) {
      return;
    }

    const { success, message, data, redirected, mode } = translateFetcher.data;
    if (!success) {
      addLog(`❌ 翻译失败: ${message || '未知错误'}`, 'error');
      showToast(message || '翻译失败', { isError: true });
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
      addLog(`✅ ${successCount} 个资源翻译成功`, 'success');
    }
    if (skippedCount > 0) {
      addLog(`ℹ️ ${skippedCount} 个资源内容未变化，已跳过`, 'info');
    }
    if (failureCount > 0) {
      addLog(`⚠️ ${failureCount} 个资源翻译失败，请检查日志`, 'warning');
      showToast(`${failureCount} 个资源翻译失败`, { isError: true });
    }

    // 🆕 阶段1：消费 relatedSummary（产品关联内容自动处理）
    if (success && data?.relatedSummary) {
      const { options = {}, metafields = {} } = data.relatedSummary;
      const optionsCount = (options.translated || 0) + (options.skipped || 0);
      const metafieldsCount = (metafields.translated || 0) + (metafields.skipped || 0);
      const totalRelated = optionsCount + metafieldsCount;

      if (totalRelated > 0) {
        addLog(
          `ℹ️ 自动处理了 ${totalRelated} 个关联内容（选项: ${optionsCount}，元字段: ${metafieldsCount}）`,
          'info'
        );
      }
    }
    // NOTE: 如果 relatedSummary 不存在（旧任务），静默跳过

    loadStatus();
  }, [translateFetcher.state, translateFetcher.data, addLog, showToast, loadStatus]);

  const clearData = useCallback(() => {
    safeAsyncOperation('清空数据', async () => {
      addLog(`🗑️ 清空 ${selectedLanguage} 语言数据...`, 'info');

      clearFetcher.submit({
        type: 'language',
        language: selectedLanguage,
        shop: shopId
      }, {
        method: 'POST',
        action: shopQueryParam ? `/api/clear?${shopQueryParam}` : '/api/clear'
      });

      // 只清空当前语言的数据
      setAllLanguagesData(prev => ({
        ...prev,
        [selectedLanguage]: null
      }));

      setSelectedResources([]);
    })(); // 立即调用返回的函数
  }, [addLog, clearFetcher, selectedLanguage, safeAsyncOperation, shopId, shopQueryParam]);

  useEffect(() => {
    if (clearFetcher.state !== 'idle' || !clearFetcher.data) {
      return;
    }

    const { success, data, message } = clearFetcher.data;

    if (success) {
      const result = data || {};
      const finalMessage = message || result.message || `${selectedLanguage} 数据已清空`;

      addLog(`✅ ${finalMessage}`, 'success');
      showToast(finalMessage, { duration: 2000 });

      loadStatus(selectedLanguage, viewMode);
    } else {
      const errorMessage = message || '清空数据失败';
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
    addLog('✅ 语言列表已更新', 'success');
  }, [addLog, primaryLanguage]);

  // 语言选择验证和切换处理
  const handleLanguageChange = useCallback((value) => {
    // 语言验证映射
    const languageNames = {
      'de': '德语',
      'nl': '荷兰语',
      'zh-CN': '简体中文',
      'zh-TW': '繁体中文',
      'en': '英语',
      'fr': '法语',
      'es': '西班牙语',
      'ja': '日语',
      'ko': '韩语'
    };

    // 记录语言切换
    addLog(`📝 切换语言至: ${languageNames[value] || value}`, 'info');

    // 检测潜在的语言混淆
    if (value === 'nl' && selectedLanguage === 'de') {
      addLog('⚠️ 注意：从德语切换到荷兰语', 'warning');
    } else if (value === 'de' && selectedLanguage === 'nl') {
      addLog('⚠️ 注意：从荷兰语切换到德语', 'warning');
    }

    if (primaryLanguage && value === primaryLanguage.value) {
      addLog('⚠️ 默认语言不可作为翻译目标', 'warning');
      return;
    }

    // 验证语言是否在可用列表中
    const isValidLanguage = dynamicLanguages.some(lang => lang.value === value);
    if (!isValidLanguage) {
      addLog(`❌ 警告：语言 ${value} 不在可用列表中`, 'error');
      return;
    }

    setSelectedLanguage(value);
    // 切换语言后重新加载状态
    loadStatus(value);
  }, [selectedLanguage, addLog, dynamicLanguages, primaryLanguage, loadStatus]);
  
  // 处理语言添加
  const handleLanguageAdded = useCallback((languageCodes) => {
    addLog(`✅ 成功添加 ${languageCodes.length} 个语言`, 'success');
    showToast(`成功添加 ${languageCodes.length} 个语言`, { duration: 3000 });
  }, [addLog, showToast]);

  // Phase 2: 发布处理函数（带防抖和操作锁）
  const publishPendingTranslations = useCallback(() => {
    debounce('publish', () => {
      safeAsyncOperation('发布翻译', async () => {
        setIsPublishing(true);
        addLog('📤 开始发布待发布翻译...', 'info');

        publishFetcher.submit({
          language: selectedLanguage,
          publishAll: "false", // 只发布当前语言
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
      safeAsyncOperation('批量发布', async () => {
        setIsPublishing(true);
        addLog('📤 开始批量发布所有待发布翻译...', 'info');

        batchPublishFetcher.submit({
          batchSize: "5", // 每批5个，避免API限流
          delayMs: "1000", // 批次间延迟1秒
          filters: JSON.stringify({}), // 发布所有语言
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
      case 'pending': return <Badge tone="attention">待翻译</Badge>;
      case 'processing': return <Badge tone="info">翻译中</Badge>;
      case 'completed': return <Badge tone="success">已完成</Badge>;
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
        <Text variant="bodySm">{icon} 翻译服务:</Text>
        <Badge tone={tone}>
          {isHealthy ? '正常' : '异常'}
        </Badge>
        {!isHealthy && translationService.errors && (
          <Text variant="bodySm" tone="critical">
            {translationService.errors[0]}
          </Text>
        )}
      </InlineStack>
    );
  };

  return (
    <Page>
      <TitleBar title="翻译应用测试">
        <Button variant="primary" onClick={loadStatus}>
          刷新状态
        </Button>
      </TitleBar>
      
      <BlockStack gap="500">
        {/* 网络状态警告 */}
        {appBridgeError && (
          <Layout>
            <Layout.Section>
              <Card tone="critical">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">⚠️ 网络连接异常</Text>
                  <Text variant="bodyMd">
                    检测到网络请求被拦截或失败。这可能是由于：
                  </Text>
                  <BlockStack gap="200">
                    <Text variant="bodySm">• 浏览器扩展程序干扰（如广告拦截器）</Text>
                    <Text variant="bodySm">• Shopify App Bridge连接问题</Text>
                    <Text variant="bodySm">• 网络防火墙或代理设置</Text>
                  </BlockStack>
                  <Text variant="bodySm" tone="subdued">
                    建议：尝试禁用浏览器扩展或使用无痕模式访问
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* 服务状态显示 */}
        {translationService && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">服务状态</Text>
                  {getTranslationServiceStatus()}

                  {translationService.status === 'unhealthy' && (
                    <Banner tone="critical" title="翻译服务不可用">
                      <BlockStack gap="200">
                        <Text variant="bodySm">
                          {translationService.errors?.[0] || '无法连接到翻译服务，请稍后重试。'}
                        </Text>
                        <InlineStack gap="200">
                          <Button size="slim" onClick={() => loadStatus(selectedLanguage, viewMode, true)}>
                            重试健康检查
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
                        API密钥: {translationService.config.apiKeyConfigured ? '✅ 已配置' : '❌ 未配置'}
                      </Text>
                      <Text variant="bodySm">
                        模型: {translationService.config.model}
                      </Text>
                      <Text variant="bodySm">
                        超时: {translationService.config.timeout}ms
                      </Text>
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* 配置区域 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">操作面板</Text>
                
                <BlockStack gap="400">
                  <Select
                    label="目标语言"
                    options={dynamicLanguages}
                    value={selectedLanguage}
                    onChange={handleLanguageChange}
                    helpText="选择要翻译的目标语言（自动保存选择）"
                  />
                  
                  <Select
                    label="显示筛选"
                    options={[
                      { label: '全部资源', value: 'all' },
                      { label: '仅已翻译', value: 'with-translations' },
                      { label: '仅待翻译', value: 'without-translations' }
                    ]}
                    value={viewMode}
                    onChange={(value) => {
                      setViewMode(value);
                      loadStatus(selectedLanguage, value);
                    }}
                    helpText={viewMode !== 'all' ? 
                      `当前显示: ${viewMode === 'with-translations' ? '已翻译' : '待翻译'}的资源` : 
                      '显示所有可翻译的资源'
                    }
                  />
                  
                  <Box>
                    <LanguageManager
                      currentLanguages={dynamicLanguages}
                      primaryLanguage={primaryLanguage}
                      onLanguageAdded={handleLanguageAdded}
                      onLanguagesUpdated={handleLanguagesUpdated}
                      shopId={shopId}
                    />
                  </Box>
                </BlockStack>

                {primaryLanguage && (
                  <Text variant="bodySm" tone="subdued">
                    默认语言：{primaryLanguage.label}（不可作为翻译目标）
                  </Text>
                )}

                <Box>
                  <Checkbox
                    label="清除缓存并重新翻译"
                    checked={clearCache}
                    onChange={setClearCache}
                    helpText="勾选后将删除现有翻译并重新生成（仅影响选中的资源）"
                  />
                </Box>
                
                <BlockStack gap="300">
                  <InlineStack gap="200">
                    <Button
                      onClick={scanAllResources}
                      loading={isScanning}
                      variant="primary"
                    >
                      扫描所有资源
                    </Button>
                    <Button
                      onClick={startTranslation}
                      loading={isTranslating}
                      variant="primary"
                      disabled={resources.length === 0 || (translationService && translationService.status === 'unhealthy')}
                    >
                      {selectedResources.length > 0
                        ? `翻译选中 ${selectedResources.length} 项`
                        : resources.length > 0
                          ? `翻译全部 ${resources.length} 项`
                          : '暂无资源'}
                    </Button>
                    <Button
                      onClick={clearData}
                      loading={isClearing}
                      variant="tertiary"
                      tone="critical"
                    >
                      清空数据
                    </Button>
                  </InlineStack>

                  <BlockStack gap="200">
                    <Text variant="headingSm">发布选项</Text>
                    <InlineStack gap="200">
                      <BlockStack gap="100">
                        <Button
                          onClick={publishPendingTranslations}
                          loading={isPublishing}
                          variant="primary"
                          tone="success"
                          disabled={!stats.pendingTranslations}
                        >
                          立即发布 (当前语言 {stats.pendingTranslations || 0})
                        </Button>
                        <Text variant="bodySm" tone="subdued">
                          直接同步，适用所有数据（包括旧记录）
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
                          批量发布 (所有语言 {stats.totalPendingTranslations || 0})
                        </Button>
                        <Text variant="bodySm" tone="subdued">
                          批量高级发布，支持进度跟踪（已优化验证）
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
              <Banner tone="info" title="💡 产品翻译说明">
                <Text variant="bodySm">
                  翻译产品时会自动处理产品选项（Options）和元字段（Metafields）。
                  可在翻译日志和发布日志中查看处理详情。
                </Text>
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        {/* 智能提示Banner */}
        {stats.translated === 0 && viewMode === 'all' && resources.length > 0 && (
          <Layout>
            <Layout.Section>
              <Banner status="info" title="开始翻译">
                当前语言暂无翻译记录。请选择需要翻译的资源，然后点击"开始翻译"按钮。
              </Banner>
            </Layout.Section>
          </Layout>
        )}
        
        {viewMode === 'with-translations' && resources.length === 0 && (
          <Layout>
            <Layout.Section>
              <Banner>
                没有找到已翻译的资源。请切换到"全部资源"查看所有可翻译内容。
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
                  <Text as="h3" variant="headingMd">总资源数</Text>
                  <Text as="p" variant="headingLg">{stats.total || 0}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">待翻译</Text>
                  <Text as="p" variant="headingLg" tone="critical">{stats.pending || 0}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">已翻译</Text>
                  <Text as="p" variant="headingLg" tone="success">{stats.translated || 0}</Text>
                  {stats.translationRate !== undefined && (
                    <Text variant="bodySm" tone="subdued">
                      {stats.translationRate}% 完成率
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
                    <Text variant="headingMd">语言域名配置</Text>
                    <Text variant="bodySm" color="subdued">
                      查看所有语言的URL映射配置
                    </Text>
                  </BlockStack>
                  <Button url="/app/language-domains" size="slim">
                    查看配置
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* 操作日志 */}
        {logs.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">操作日志</Text>
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

        {/* 资源分类展示 */}
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
                  window.shopify.toast.show('请先选择目标语言', { isError: true });
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
                  <Text as="h2" variant="headingMd">暂无资源数据</Text>
                  <Text as="p" tone="subdued">
                    请先完成以下流程后再启动翻译：① 扫描资源 ② 执行翻译 ③ 发布同步。当前未检测到任何已扫描资源，请使用下方按钮开始扫描。
                  </Text>
                  <InlineStack gap="2">
                    <Button onClick={scanSelectedResourceType} loading={isScanning}>
                      扫描 {resourceTypeOptions.find(opt => opt.value === selectedResourceType)?.label || selectedResourceType}
                    </Button>
                    <Button onClick={scanProducts} variant="secondary" loading={isScanning}>
                      快速扫描产品
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
