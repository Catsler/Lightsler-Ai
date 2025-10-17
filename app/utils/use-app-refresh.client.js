import { useNavigate, useLocation } from "@remix-run/react";
import { useCallback } from "react";

/**
 * Remix 导航刷新 Hook
 *
 * 替代 window.location.reload()，避免在 Shopify iframe 环境中触发同源策略错误
 * 错误示例: "?shopify-reload must be same-origin (https://onewind.ease-joy.fun !== https://fynony.ease-joy.fun)"
 *
 * @returns {{ refresh: Function, hardRefresh: Function }}
 * - refresh: 软刷新（Remix 重新导航到当前路由，触发loader重新运行）
 * - hardRefresh: 硬刷新（添加时间戳强制清除缓存）
 *
 * @example
 * ```javascript
 * const { refresh, hardRefresh } = useAppRefresh();
 *
 * // 错误恢复、翻译后刷新（不需要清缓存）
 * <Button onClick={() => refresh()}>刷新</Button>
 *
 * // 主题更新、构建后刷新（需要清缓存）
 * setTimeout(() => hardRefresh(), 1500);
 * ```
 */
export function useAppRefresh() {
  const navigate = useNavigate();
  const location = useLocation();

  const refresh = useCallback(() => {
    // 使用 Remix 导航到当前路径，触发 loader 重新运行
    // replace: true 避免添加历史记录
    navigate(location.pathname + location.search, { replace: true });
  }, [navigate, location.pathname, location.search]);

  const hardRefresh = useCallback(() => {
    // 添加时间戳参数强制刷新（清除缓存）
    const url = new URL(location.pathname + location.search, window.location.origin);
    url.searchParams.set('_refresh', Date.now().toString());
    navigate(url.pathname + url.search, { replace: true });
  }, [navigate, location.pathname, location.search]);

  return {
    refresh,
    hardRefresh
  };
}
