import { useAppBridge } from '@shopify/app-bridge-react';

/**
 * 安全封装 useAppBridge，防止 App Bridge 初始化失败时直接抛错导致白屏。
 * 当 window.shopify 不存在时返回 null，便于上层渲染友好的提示。
 */
export function useSafeAppBridge() {
  try {
    return useAppBridge();
  } catch (error) {
    if (typeof window !== 'undefined') {
      console.error('[AppBridge] 初始化失败，window.shopify 未定义', error);
    }
    return null;
  }
}

export default useSafeAppBridge;
