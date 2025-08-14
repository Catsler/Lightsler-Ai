import { json } from '@remix-run/node';
import { withErrorHandling } from '../utils/error-handler.server.js';
import { translationSessionManager } from '../services/translation-session-manager.server.js';
import { shopify } from '../shopify.server.js';

/**
 * 翻译会话管理API端点
 * 
 * 支持的操作:
 * - GET: 获取店铺的翻译会话列表
 * - POST: 创建新的翻译会话
 * - PUT: 更新会话状态（启动、暂停、恢复）
 */

export const action = withErrorHandling(async ({ request }) => {
  const method = request.method;
  const { admin } = await shopify.authenticate.admin(request);
  const shopId = admin.rest.session.shop;

  switch (method) {
    case 'GET':
      return await handleGetSessions(request, shopId);
    
    case 'POST':
      return await handleCreateSession(request, shopId);
    
    case 'PUT':
      return await handleUpdateSession(request, shopId);
    
    default:
      return json({ error: 'Method not allowed' }, { status: 405 });
  }
});

export const loader = withErrorHandling(async ({ request }) => {
  const { admin } = await shopify.authenticate.admin(request);
  const shopId = admin.rest.session.shop;

  return await handleGetSessions(request, shopId);
});

/**
 * 处理获取会话列表
 */
async function handleGetSessions(request, shopId) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  
  // 如果指定了sessionId，返回单个会话的详细信息
  if (sessionId) {
    const sessionStatus = await translationSessionManager.getSessionStatus(sessionId);
    return json({
      success: true,
      data: sessionStatus
    });
  }

  // 否则返回会话列表
  const filters = {
    status: url.searchParams.get('status'),
    sessionType: url.searchParams.get('sessionType'),
    limit: parseInt(url.searchParams.get('limit')) || 20,
    offset: parseInt(url.searchParams.get('offset')) || 0
  };

  const sessions = await translationSessionManager.getShopSessions(shopId, filters);
  
  return json({
    success: true,
    data: sessions,
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      total: sessions.length
    }
  });
}

/**
 * 处理创建新会话
 */
async function handleCreateSession(request, shopId) {
  const requestData = await request.json();
  
  const {
    sessionName,
    sessionType = 'BATCH',
    resourceIds = [],
    resourceTypes = [],
    languages = [],
    translationConfig = {},
    batchSize = 10,
    maxRetries = 3,
    qualityThreshold = 0.7,
    enableManualReview = false
  } = requestData;

  // 验证必要参数
  if (!Array.isArray(languages) || languages.length === 0) {
    return json({
      success: false,
      error: '至少需要指定一种目标语言',
      code: 'INVALID_LANGUAGES'
    }, { status: 400 });
  }

  if (resourceIds.length === 0 && resourceTypes.length === 0) {
    return json({
      success: false,
      error: '需要指定要翻译的资源ID或资源类型',
      code: 'NO_RESOURCES_SPECIFIED'
    }, { status: 400 });
  }

  try {
    const session = await translationSessionManager.createSession({
      shopId,
      sessionName,
      sessionType,
      resourceIds,
      resourceTypes,
      languages,
      translationConfig,
      batchSize,
      maxRetries,
      qualityThreshold,
      enableManualReview
    });

    return json({
      success: true,
      message: '翻译会话创建成功',
      data: session
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'SESSION_CREATION_FAILED'
    }, { status: 400 });
  }
}

/**
 * 处理会话状态更新
 */
async function handleUpdateSession(request, shopId) {
  const requestData = await request.json();
  const { sessionId, action, ...params } = requestData;

  if (!sessionId) {
    return json({
      success: false,
      error: '缺少会话ID',
      code: 'MISSING_SESSION_ID'
    }, { status: 400 });
  }

  try {
    let result;

    switch (action) {
      case 'start':
        result = await translationSessionManager.startSession(sessionId);
        break;

      case 'pause':
        const reason = params.reason || 'USER_REQUEST';
        result = await translationSessionManager.pauseSession(sessionId, reason);
        break;

      case 'resume':
        result = await translationSessionManager.resumeSession(sessionId);
        break;

      case 'complete':
        result = await translationSessionManager.completeSession(sessionId, params.finalStats);
        break;

      case 'updateProgress':
        await translationSessionManager.updateProgress(sessionId, params.progress);
        result = { success: true, message: '进度更新成功' };
        break;

      default:
        return json({
          success: false,
          error: '不支持的操作',
          code: 'INVALID_ACTION',
          supportedActions: ['start', 'pause', 'resume', 'complete', 'updateProgress']
        }, { status: 400 });
    }

    return json({
      success: true,
      message: `会话${action}操作成功`,
      data: result
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      code: error.code || 'SESSION_UPDATE_FAILED'
    }, { status: 400 });
  }
}

// 导出loader以支持GET请求
export { loader as GET };