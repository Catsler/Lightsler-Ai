import { useCallback, useEffect, useMemo, useState } from 'react';

// 聚合翻译控制台核心状态，容器可直接解构 state/setters，减少 useState/useEffect 噪声
export default function useTranslationState({ supportedLanguages, shopId, getLanguagePreference, initialViewMode = 'all' }) {
  const computeInitialLanguage = useCallback(() => {
    const defaultTarget = supportedLanguages?.[0]?.value || supportedLanguages?.[0]?.languageCode;

    if (typeof window === 'undefined') {
      return defaultTarget ?? 'zh-CN';
    }

    const saved = typeof getLanguagePreference === 'function' ? getLanguagePreference(shopId) : null;
    if (saved && supportedLanguages?.some((lang) => lang.value === saved || lang.languageCode === saved)) {
      return saved;
    }
    if (defaultTarget) return defaultTarget;
    return 'zh-CN';
  }, [getLanguagePreference, shopId, supportedLanguages]);

  const [viewMode, setViewMode] = useState(initialViewMode);
  const [selectedLanguage, setSelectedLanguage] = useState(() => computeInitialLanguage());
  const [selectedResourceType, setSelectedResourceType] = useState('PRODUCT');
  const [selectedResources, setSelectedResources] = useState([]);
  const [allLanguagesData, setAllLanguagesData] = useState({});
  const [dynamicLanguages, setDynamicLanguages] = useState(supportedLanguages || []);
  const [translatingCategories, setTranslatingCategories] = useState(new Set());
  const [syncingCategories, setSyncingCategories] = useState(new Set());
  const [pendingTranslations, setPendingTranslations] = useState([]);
  const [operationLock, setOperationLock] = useState(new Set());
  const [translationService, setTranslationService] = useState(null);
  const [logs, setLogs] = useState([]);
  const [appBridgeError, setAppBridgeError] = useState(false);
  const [lastServiceError, setLastServiceError] = useState(null);
  const [clearCache, setClearCache] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishingProgress, setPublishingProgress] = useState({ current: 0, total: 0 });
  const [pollInterval, setPollInterval] = useState(60000);
  const [lastStatusData, setLastStatusData] = useState(null);

  useEffect(() => {
    setDynamicLanguages(supportedLanguages || []);
    setSelectedLanguage((prev) => {
      if (supportedLanguages?.some((lang) => lang.value === prev || lang.languageCode === prev)) {
        return prev;
      }
      return supportedLanguages?.[0]?.value ?? supportedLanguages?.[0]?.languageCode ?? prev;
    });
  }, [supportedLanguages]);

  const languageMap = useMemo(() => {
    return (dynamicLanguages || []).reduce((acc, lang) => {
      const code = lang.languageCode || lang.value;
      if (code) acc[code] = lang;
      return acc;
    }, {});
  }, [dynamicLanguages]);

  const selectLanguage = useCallback((lang) => setSelectedLanguage(lang), []);
  const selectResourceType = useCallback((type) => setSelectedResourceType(type), []);
  const updateResources = useCallback((items) => setSelectedResources(items || []), []);

  return {
    state: {
      viewMode,
      selectedLanguage,
      selectedResourceType,
      selectedResources,
      allLanguagesData,
      dynamicLanguages,
      translatingCategories,
      syncingCategories,
      pendingTranslations,
      operationLock,
      translationService,
      logs,
      appBridgeError,
      lastServiceError,
      clearCache,
      isPublishing,
      publishingProgress,
      languageMap,
      pollInterval,
      lastStatusData
    },
    setters: {
      setViewMode,
      setSelectedLanguage,
      setSelectedResourceType,
      setSelectedResources,
      setAllLanguagesData,
      setDynamicLanguages,
      setTranslatingCategories,
      setSyncingCategories,
      setPendingTranslations,
      setOperationLock,
      setTranslationService,
      setLogs,
      setAppBridgeError,
      setLastServiceError,
      setClearCache,
      setIsPublishing,
      setPublishingProgress,
      setPollInterval,
      setLastStatusData
    },
    actions: {
      selectLanguage,
      selectResourceType,
      updateResources
    }
  };
}
