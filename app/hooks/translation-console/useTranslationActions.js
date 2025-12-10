import { useCallback } from 'react';

// 翻译相关操作的聚合，依赖外部注入的 service / fetcher 等，容器负责注入依赖
export default function useTranslationActions({
  translationService,
  setTranslationService,
  setLogs,
  setLastServiceError,
  setTranslatingCategories,
  setSyncingCategories,
  setPendingTranslations,
  setOperationLock,
  setIsPublishing,
  setPublishingProgress
}) {
  // TODO: 将具体业务操作从 app._index.jsx 按需迁移到这里，保持接口纯粹
  // 这里先留空框架，后续逐步填充，避免一次性大迁移影响行为

  const attachService = useCallback((svc) => {
    setTranslationService?.(svc);
  }, [setTranslationService]);

  return {
    attachService,
    // 占位：后续补充 translate/sync/publish 等动作
  };
}

