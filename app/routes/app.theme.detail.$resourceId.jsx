import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * DEPRECATED: 主题专用详情页已废弃，统一重定向到通用资源详情页
 * 保留文件仅为兼容历史链接。
 */
export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { resourceId } = params;

  if (!resourceId) {
    throw new Response("Resource ID is required", { status: 400 });
  }

  // 统一重定向到通用资源详情页（使用 type=theme 保持兼容，通用页会进行类型校验）
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang');
  return redirect(`/app/resource/theme/${resourceId}${lang ? `?lang=${lang}` : ''}`);
};

/**
 * DEPRECATED: 此组件已废弃，所有请求已重定向到通用资源详情页
 * 该函数永远不会被调用，保留仅为避免 Remix 路由错误
 */
export default function ThemeDetailPage() {
  // 此组件永远不会渲染，因为 loader 总是重定向
  return null;
}
