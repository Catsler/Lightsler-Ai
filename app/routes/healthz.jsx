import { json } from '@remix-run/node';

/**
 * 公共健康检查端点，用于部署脚本和外部探针。
 *
 * 返回 200 表示服务进程可用，未来如有需要可扩展更多检查。
 */
export const loader = async () => {
  return json({
    ok: true,
    timestamp: new Date().toISOString(),
  });
};
