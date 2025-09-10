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
import prisma from "../db.server";

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
  
  // 获取店铺已启用的语言（从数据库）
  const shop = await prisma.shop.findUnique({
    where: { id: session.shop },
    include: { languages: { where: { isActive: true } } }
  });
  
  // 格式化语言列表供Select组件使用
  const supportedLanguages = shop?.languages?.length > 0
    ? shop.languages.map(lang => ({
        label: lang.name,
        value: lang.code
      }))
    : [
        // 默认语言列表（如果数据库中没有）
        { label: 'Chinese (Simplified)', value: 'zh-CN' },
        { label: 'Chinese (Traditional)', value: 'zh-TW' },
        { label: 'English', value: 'en' },
        { label: 'Japanese', value: 'ja' },
        { label: 'Korean', value: 'ko' },
        { label: 'French', value: 'fr' },
        { label: 'German', value: 'de' },
        { label: 'Spanish', value: 'es' },
      ];
  
  return {
    supportedLanguages,
    shopId: session.shop  // 新增：传递shopId给前端用于localStorage键
  };
};

function Index() {
  console.log('[Index Component] Rendering started');
  
  const { supportedLanguages, shopId } = useLoaderData();
  console.log('[Index Component] Loader data:', { supportedLanguages, shopId });
  
  const scanProductsFetcher = useFetcher();
  const scanCollectionsFetcher = useFetcher();
  const scanResourcesFetcher = useFetcher();
  const scanAllFetcher = useFetcher();
  const translateFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const clearFetcher = useFetcher();
  
  // React Hooks必须在顶层调用，不能在条件语句中
  const shopify = useAppBridge();
  const navigate = useNavigate();
  console.log('[Index Component] App Bridge initialized successfully');
  
  // Language selector persistence: read saved preference on init
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    // SSR compatibility check
    if (typeof window === 'undefined') {
      console.log('[Language Preference] Server environment, using default: zh-CN');
      return 'zh-CN';
    }
    
    // Read saved language preference
    const savedLanguage = getLanguagePreference(shopId);
    
    // Validate saved language is in current available list
    if (savedLanguage && supportedLanguages.some(lang => lang.value === savedLanguage)) {
      console.log('[Language Preference] Restored saved language:', savedLanguage);
      return savedLanguage;
    }
    
    // Default to Chinese Simplified
    console.log('[Language Preference] Using default language: zh-CN');
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
  
  // 分类翻译状态管理
  const [translatingCategories, setTranslatingCategories] = useState(new Set());
  const [syncingCategories, setSyncingCategories] = useState(new Set());

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

  // 资源类型选项 - 按类别组织但不使用禁用的分隔符
  const resourceTypeOptions = useMemo(() => [
    // 基础内容类型
    { label: '产品', value: 'PRODUCT' },
    { label: '产品集合', value: 'COLLECTION' },
    { label: '博客文章', value: 'ARTICLE' },
    { label: '博客', value: 'BLOG' },
    { label: '页面', value: 'PAGE' },
    { label: '菜单', value: 'MENU' },
    { label: '链接', value: 'LINK' },
    { label: '过滤器', value: 'FILTER' },
    
    // Theme相关资源
    { label: '[主题] 主题设置', value: 'ONLINE_STORE_THEME' },
    { label: '[主题] 应用嵌入', value: 'ONLINE_STORE_THEME_APP_EMBED' },
    { label: '[主题] JSON模板', value: 'ONLINE_STORE_THEME_JSON_TEMPLATE' },
    { label: '[主题] 本地化内容', value: 'ONLINE_STORE_THEME_LOCALE_CONTENT' },
    { label: '[主题] 区块组', value: 'ONLINE_STORE_THEME_SECTION_GROUP' },
    { label: '[主题] 设置分类', value: 'ONLINE_STORE_THEME_SETTINGS_CATEGORY' },
    { label: '[主题] 静态区块', value: 'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS' },
    
    // 产品扩展
    { label: '[产品扩展] 产品选项', value: 'PRODUCT_OPTION' },
    { label: '[产品扩展] 产品选项值', value: 'PRODUCT_OPTION_VALUE' },
    { label: '[产品扩展] 销售计划', value: 'SELLING_PLAN' },
    { label: '[产品扩展] 销售计划组', value: 'SELLING_PLAN_GROUP' },
    
    // 店铺配置
    { label: '[店铺] 店铺信息', value: 'SHOP' },
    { label: '[店铺] 店铺政策', value: 'SHOP_POLICY' }
  ], []);;

  // 加载状态
  const isScanning = scanProductsFetcher.state === 'submitting' || 
                     scanCollectionsFetcher.state === 'submitting' || 
                     scanResourcesFetcher.state === 'submitting' ||
                     scanAllFetcher.state === 'submitting';
  const isTranslating = translateFetcher.state === 'submitting';
  const isClearing = clearFetcher.state === 'submitting';

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

  // 加载状态 - 添加错误重试机制
  const loadStatus = useCallback(() => {
    try {
      statusFetcher.load('/api/status');
    } catch (error) {
      console.error('状态加载失败:', error);
      addLog('⚠️ 网络连接异常，请检查网络设置', 'error');
      setAppBridgeError(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        
        // 将数据存储到对应语言的槽位
        setAllLanguagesData(prev => ({
          ...prev,
          [selectedLanguage]: {
            resources: resourcesData || [],
            stats: statsData?.database || {
              totalResources: 0,
              pendingResources: 0,
              completedResources: 0
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

  // 监听同步响应
  useEffect(() => {
    if (syncFetcher.state === 'idle' && syncFetcher.data) {
      // 找出正在同步的分类
      const syncingCategory = Array.from(syncingCategories)[0];
      
      if (syncingCategory) {
        // 处理响应
        if (syncFetcher.data.success) {
          const { successCount = 0, failedCount = 0 } = syncFetcher.data.result || {};
          
          if (successCount > 0) {
            addLog(`✅ 分类同步完成: 成功 ${successCount} 个，失败 ${failedCount} 个`, 'success');
            showToast(`分类发布成功！`, { duration: 3000 });
          } else if (failedCount > 0) {
            addLog(`⚠️ 分类同步完成，但有 ${failedCount} 个失败`, 'warning');
          } else {
            addLog(`ℹ️ 分类暂无需要同步的内容`, 'info');
          }
          
          // 刷新状态
          loadStatus();
        } else {
          const errorMsg = syncFetcher.data.error || '同步失败';
          addLog(`❌ 分类同步失败: ${errorMsg}`, 'error');
          showToast(`同步失败: ${errorMsg}`, { isError: true });
        }
        
        // 清理同步状态
        setSyncingCategories(prev => {
          const newSet = new Set(prev);
          newSet.delete(syncingCategory);
          return newSet;
        });
      }
    }
  }, [syncFetcher.state, syncFetcher.data, syncingCategories, addLog, showToast, loadStatus]);

  // 页面加载时获取状态 - 只在首次加载时执行
  useEffect(() => {
    console.log('[Index Component] Initial useEffect - loading status');
    loadStatus();
  }, []); // 只在组件挂载时执行一次

  // 设置智能定时刷新
  useEffect(() => {
    const interval = setInterval(() => {
      // 根据当前状态调整轮询频率
      const isActiveOperation = isScanning || isTranslating || isClearing;
      const currentInterval = isActiveOperation ? 10000 : 60000; // 操作中10秒，空闲60秒
      
      if (currentInterval !== pollInterval) {
        setPollInterval(currentInterval);
      }
      
      if (!isActiveOperation) {
        loadStatus();
      }
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [pollInterval, isScanning, isTranslating, isClearing]); // eslint-disable-line react-hooks/exhaustive-deps

  // 扫描产品
  const scanProducts = useCallback(() => {
    try {
      addLog('🔍 开始扫描产品...', 'info');
      scanProductsFetcher.submit({}, { 
        method: 'POST', 
        action: '/api/scan-products' 
      });
    } catch (error) {
      console.error('扫描产品失败:', error);
      addLog('❌ 扫描产品失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanProductsFetcher]);

  // 扫描集合
  const scanCollections = useCallback(() => {
    try {
      addLog('🔍 开始扫描集合...', 'info');
      scanCollectionsFetcher.submit({}, { 
        method: 'POST', 
        action: '/api/scan-collections' 
      });
    } catch (error) {
      console.error('扫描集合失败:', error);
      addLog('❌ 扫描集合失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanCollectionsFetcher]);

  // 扫描所有资源
  const scanAllResources = useCallback(() => {
    try {
      addLog('🔍 开始扫描所有资源类型...', 'info');
      scanAllFetcher.submit({}, { 
        method: 'POST', 
        action: '/api/scan-all' 
      });
    } catch (error) {
      console.error('扫描所有资源失败:', error);
      addLog('❌ 扫描所有资源失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanAllFetcher]);

  // 扫描选定的资源类型
  const scanSelectedResourceType = useCallback(() => {
    try {
      const selectedType = resourceTypeOptions.find(opt => opt.value === selectedResourceType);
      addLog(`🔍 开始扫描${selectedType?.label || selectedResourceType}...`, 'info');
      scanResourcesFetcher.submit(
        { resourceType: selectedResourceType }, 
        { 
          method: 'POST', 
          action: '/api/scan-resources',
          encType: 'application/json'
        }
      );
    } catch (error) {
      console.error('扫描资源失败:', error);
      addLog('❌ 扫描资源失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [addLog, scanResourcesFetcher, selectedResourceType, resourceTypeOptions]);

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
        clearCache: clearCache.toString()
      }, { 
        method: 'POST', 
        action: '/api/translate' 
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
  }, [selectedLanguage, clearCache, translationService, addLog, showToast, translatingCategories]);

  // 处理分类同步（发布到Shopify）
  const handleCategorySync = useCallback(async (categoryKey, category) => {
    try {
      // 检查是否已在同步中
      if (syncingCategories.has(categoryKey)) {
        addLog(`⚠️ ${category.name} 分类正在同步中，请稍候...`, 'warning');
        return;
      }
      
      // 设置同步状态
      setSyncingCategories(prev => new Set([...prev, categoryKey]));
      
      addLog(`🚀 开始同步 ${category.name} 分类到Shopify...`, 'info');
      
      // 收集该分类下所有资源的ID
      const categoryResourceIds = [];
      Object.values(category.subcategories).forEach(subcategory => {
        subcategory.items.forEach(resource => {
          categoryResourceIds.push(resource.id);
        });
      });
      
      // 提交同步请求
      syncFetcher.submit({
        action: 'syncByCategory',
        categoryKey: categoryKey,
        language: selectedLanguage,
        resourceIds: JSON.stringify(categoryResourceIds)
      }, { 
        method: 'POST', 
        action: '/api/sync-translations' 
      });
      
    } catch (error) {
      console.error('分类同步失败:', error);
      addLog(`❌ ${category.name} 分类同步失败: ${error.message}`, 'error');
      
      // 清理状态
      setSyncingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryKey);
        return newSet;
      });
    }
  }, [selectedLanguage, addLog, syncingCategories, syncFetcher]);

  // 开始翻译
  const startTranslation = useCallback(() => {
    try {
      // 检查翻译服务状态
      if (translationService && translationService.status === 'unhealthy') {
        const errorMsg = translationService.errors?.[0] || '翻译服务不可用';
        addLog(`❌ 翻译服务异常: ${errorMsg}`, 'error');
        showToast(`翻译服务异常: ${errorMsg}`, { isError: true });
        return;
      }
      
      const resourceIds = selectedResources.length > 0 ? selectedResources : [];
      addLog(`🔄 开始翻译到 ${selectedLanguage}...${clearCache ? ' (清除缓存)' : ''}`, 'info');
      
      translateFetcher.submit({
        language: selectedLanguage,
        resourceIds: JSON.stringify(resourceIds),
        clearCache: clearCache.toString()
      }, { 
        method: 'POST', 
        action: '/api/translate' 
      });
    } catch (error) {
      console.error('翻译失败:', error);
      addLog('❌ 翻译失败，请检查网络连接', 'error');
      setAppBridgeError(true);
    }
  }, [selectedLanguage, selectedResources, translationService, addLog, showToast, translateFetcher, clearCache]);

  // 清空数据
  const clearData = useCallback(() => {
    addLog(`🗑️ 清空 ${selectedLanguage} 语言数据...`, 'info');
    clearFetcher.submit({ type: 'all' }, { 
      method: 'POST', 
      action: '/api/clear' 
    });
    
    // 只清空当前语言的数据
    setAllLanguagesData(prev => ({
      ...prev,
      [selectedLanguage]: null
    }));
    
    setSelectedResources([]);
  }, [addLog, clearFetcher, selectedLanguage]);

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
  const handleLanguagesUpdated = useCallback((languages) => {
    // 更新可用语言列表
    const formattedLanguages = languages.map(lang => ({
      label: lang.label || lang.name,
      value: lang.value || lang.code
    }));
    setDynamicLanguages(formattedLanguages);
    addLog('✅ 语言列表已更新', 'success');
  }, [addLog]);
  
  // 处理语言添加
  const handleLanguageAdded = useCallback((languageCodes) => {
    addLog(`✅ 成功添加 ${languageCodes.length} 个语言`, 'success');
    showToast(`成功添加 ${languageCodes.length} 个语言`, { duration: 3000 });
  }, [addLog, showToast]);

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
                
                <InlineStack gap="300">
                  <Box minWidth="200px">
                    <Select
                      label="目标语言"
                      options={dynamicLanguages}
                      value={selectedLanguage}
                      onChange={setSelectedLanguage}
                      helpText="Select target language for translation (selection auto-saved)"
                    />
                  </Box>
                  <Box paddingBlockStart="600">
                    <LanguageManager
                      currentLanguages={dynamicLanguages}
                      onLanguageAdded={handleLanguageAdded}
                      onLanguagesUpdated={handleLanguagesUpdated}
                    />
                  </Box>
                </InlineStack>
                
                <Box>
                  <Checkbox
                    label="清除缓存并重新翻译"
                    checked={clearCache}
                    onChange={setClearCache}
                    helpText="勾选后将删除现有翻译并重新生成（仅影响选中的资源）"
                  />
                </Box>
                
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
                    开始翻译 {selectedResources.length > 0 ? `(${selectedResources.length}项)` : ''}
                  </Button>
                  <Button 
                    url="/app/sync"
                    variant="primary"
                    tone="success"
                  >
                    同步管理
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
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* 统计信息 */}
        <Layout>
          <Layout.Section>
            <InlineStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">总资源数</Text>
                  <Text as="p" variant="headingLg">{stats.totalResources}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">待翻译</Text>
                  <Text as="p" variant="headingLg" tone="critical">{stats.pendingResources}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">已完成</Text>
                  <Text as="p" variant="headingLg" tone="success">{stats.completedResources}</Text>
                </BlockStack>
              </Card>
            </InlineStack>
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
              if (resourceType.includes('theme') || resourceType.includes('online_store')) {
                // 保持Theme专用页面的向后兼容
                navigate(`/app/theme/detail/${resource.id}?lang=${selectedLanguage}`);
              } else {
                // 所有其他资源使用统一路由
                navigate(`/app/resource/${resourceType}/${resource.id}?lang=${selectedLanguage}`);
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
                    请先选择资源类型并点击"扫描选定类型"按钮来加载资源数据
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
