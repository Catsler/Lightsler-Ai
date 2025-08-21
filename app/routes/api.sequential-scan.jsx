import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { scanWithIntelligence } from '../services/scan-intelligence.server';
import { withErrorHandling } from '../utils/error-handler.server';
import { createApiResponse } from '../utils/api-response.server';

/**
 * Sequential Thinking 智能扫描API
 * 集成AI决策引擎，优化扫描流程
 */
export const action = withErrorHandling(async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const language = formData.get('language') || 'zh-CN';
  const resourceType = formData.get('resourceType') || 'ALL';
  const useIntelligence = formData.get('useIntelligence') !== 'false';
  
  console.log('[Sequential Scan] 开始智能扫描', { 
    language, 
    resourceType, 
    useIntelligence 
  });
  
  try {
    // 使用智能扫描服务
    const result = await scanWithIntelligence({
      admin,
      language,
      resourceType,
      options: {
        useSequentialThinking: useIntelligence,
        trackProgress: true,
        generateThinkingChain: true,
        optimizeBatch: true
      }
    });
    
    console.log('[Sequential Scan] 扫描完成', {
      totalResources: result.stats?.total,
      duration: result.stats?.duration,
      thinkingSteps: result.thinkingChain?.length
    });
    
    return json(createApiResponse(true, '智能扫描完成', result));
  } catch (error) {
    console.error('[Sequential Scan] 扫描失败:', error);
    return json(createApiResponse(
      false, 
      `智能扫描失败: ${error.message}`,
      null,
      { 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    ), { status: 500 });
  }
});

/**
 * 获取扫描进度
 */
export const loader = withErrorHandling(async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  
  if (!sessionId) {
    return json(createApiResponse(false, '缺少会话ID'));
  }
  
  try {
    // 从内存或缓存中获取扫描进度
    const progress = global.scanProgress?.[sessionId] || {
      progress: 0,
      phase: 'initializing',
      currentResource: null,
      scannedResources: 0,
      totalResources: 0,
      thinkingChain: [],
      stats: null
    };
    
    return json(createApiResponse(true, '获取进度成功', progress));
  } catch (error) {
    console.error('[Sequential Scan] 获取进度失败:', error);
    return json(createApiResponse(false, `获取进度失败: ${error.message}`));
  }
});