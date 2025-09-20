/**
 * Webhook事件管理服务
 * 处理Shopify webhook事件，触发自动翻译
 */

import prisma from '../db.server.js';
import { logger } from '../utils/logger.server.js';
import { addTranslationJob } from './queue.server.js';
import { captureError } from '../utils/error-handler.server.js';
import { invalidateCoverageCache } from './language-coverage.server.js';
import { webhookConfig, getResourcePriority, getDedupWindowMs } from '../config/webhook-config.js';

/**
 * Webhook事件处理器注册表
 */
const WEBHOOK_HANDLERS = {
  'products/create': handleProductCreate,
  'products/update': handleProductUpdate,
  'products/delete': handleProductDelete,
  'collections/create': handleCollectionCreate,
  'collections/update': handleCollectionUpdate,
  'pages/create': handlePageCreate,
  'pages/update': handlePageUpdate,
  'themes/publish': handleThemePublish,
  'themes/update': handleThemeUpdate,
  'locales/create': handleLocaleCreate,
  'locales/update': handleLocaleUpdate,
  'articles/create': handleArticleCreate,
  'articles/update': handleArticleUpdate
};

/**
 * 记录webhook事件
 */
export async function logWebhookEvent(shop, topic, payload) {
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        shop,
        topic,
        resourceType: getResourceTypeFromTopic(topic),
        resourceId: payload.admin_graphql_api_id || payload.id?.toString(),
        payload,
        processed: false
      }
    });
    
    logger.info(`Webhook事件记录: ${topic}`, {
      shop,
      eventId: event.id,
      resourceId: event.resourceId
    });
    
    return event;
  } catch (error) {
    logger.error('记录webhook事件失败', {
      shop,
      topic,
      error: error.message
    });
    throw error;
  }
}

/**
 * 处理webhook事件
 */
export async function processWebhookEvent(shop, topic, payload) {
  try {
    // 检查是否启用自动翻译
    if (!webhookConfig.autoTranslateEnabled) {
      logger.info('Webhook自动翻译未启用', { shop, topic });
      return { success: true, message: '自动翻译未启用' };
    }
    
    // 检查去重（避免短时间内重复处理）
    const isDuplicate = await checkDuplicateEvent(shop, topic, payload);
    if (isDuplicate) {
      logger.info('检测到重复webhook事件，跳过处理', { shop, topic });
      return { success: true, message: '重复事件已跳过' };
    }
    
    // 记录事件
    const event = await logWebhookEvent(shop, topic, payload);
    
    // 检查是否有对应的处理器
    const handler = WEBHOOK_HANDLERS[topic];
    if (!handler) {
      logger.warn(`未找到webhook处理器: ${topic}`);
      return { success: false, message: '未找到处理器' };
    }
    
    // 添加延迟处理（避免频繁更新）
    if (webhookConfig.translateDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, webhookConfig.translateDelay));
    }
    
    // 执行处理器
    const result = await handler(shop, payload, event);
    
    // 更新事件状态
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        processed: true,
        processedAt: new Date()
      }
    });
    
    // 如果处理失败且启用了错误通知
    if (!result.success && webhookConfig.errorNotification) {
      await sendErrorNotification(shop, topic, result);
    }
    
    return result;
  } catch (error) {
    await captureError(error, {
      operation: 'processWebhookEvent',
      context: { shop, topic }
    });
    
    // 发送错误通知
    if (webhookConfig.errorNotification) {
      await sendErrorNotification(shop, topic, { error: error.message });
    }
    
    throw error;
  }
}

/**
 * 检查重复事件
 */
async function checkDuplicateEvent(shop, topic, payload) {
  const dedupWindow = getDedupWindowMs();
  const cutoffTime = new Date(Date.now() - dedupWindow);
  
  const existingEvent = await prisma.webhookEvent.findFirst({
    where: {
      shop,
      topic,
      resourceId: payload.admin_graphql_api_id || payload.id?.toString(),
      createdAt: { gte: cutoffTime }
    }
  });
  
  return !!existingEvent;
}

/**
 * 发送错误通知
 */
async function sendErrorNotification(shop, topic, result) {
  const message = `Webhook处理失败\n店铺: ${shop}\n事件: ${topic}\n错误: ${result.error || result.message}`;
  
  // 发送到Slack
  if (webhookConfig.notification.slackWebhook) {
    try {
      await fetch(webhookConfig.notification.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message })
      });
    } catch (error) {
      logger.error('发送Slack通知失败', { error: error.message });
    }
  }
  
  // 记录到日志
  logger.error('Webhook处理失败', {
    shop,
    topic,
    result
  });
}

/**
 * 检查是否需要翻译
 */
async function shouldTranslate(shop, resourceType, resourceId) {
  try {
    // 检查店铺是否启用自动翻译
    const shopSettings = await prisma.shop.findUnique({
      where: { domain: shop },
      select: { autoTranslateEnabled: true }
    });
    
    if (!shopSettings?.autoTranslateEnabled) {
      return false;
    }
    
    // 检查资源是否已存在且最近翻译过
    const existingResource = await prisma.resource.findFirst({
      where: {
        shopId: shop,
        resourceType,
        originalResourceId: resourceId
      },
      include: {
        translations: {
          where: {
            status: 'completed',
            updatedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24小时内
            }
          }
        }
      }
    });
    
    // 如果最近已翻译，跳过
    if (existingResource?.translations.length > 0) {
      logger.info('资源最近已翻译，跳过', {
        resourceType,
        resourceId,
        lastTranslated: existingResource.translations[0].updatedAt
      });
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('检查是否需要翻译失败', {
      shop,
      resourceType,
      resourceId,
      error: error.message
    });
    return false;
  }
}

/**
 * 将资源加入翻译队列
 */
async function queueTranslation(shop, resourceType, resourceId, priority = 'NORMAL') {
  try {
    // 首先需要确保资源存在于数据库中
    let resource = await prisma.resource.findFirst({
      where: {
        shopId: shop,
        resourceType,
        originalResourceId: resourceId
      }
    });
    
    // 如果资源不存在，需要先创建（这里简化处理，实际需要从Shopify获取详细信息）
    if (!resource) {
      resource = await prisma.resource.create({
        data: {
          shopId: shop,
          resourceType,
          resourceId: `${resourceType.toLowerCase()}_${Date.now()}`,
          originalResourceId: resourceId,
          gid: resourceId,
          title: 'Pending scan',
          status: 'pending'
        }
      });
    }
    
    // 获取店铺的目标语言
    const languages = await prisma.language.findMany({
      where: {
        shopId: shop,
        enabled: true
      }
    });
    
    if (languages.length === 0) {
      logger.warn('店铺未配置目标语言', { shop });
      return;
    }
    
    // 为每个语言创建翻译任务
    const jobIds = [];
    for (const lang of languages) {
      const jobId = await addTranslationJob(
        resource.id,
        shop,
        lang.code,
        {
          priority: priority === 'HIGH' ? 1 : priority === 'NORMAL' ? 5 : 10,
          source: 'webhook'
        }
      );
      jobIds.push(jobId);
    }
    
    logger.info('翻译任务已加入队列', {
      shop,
      resourceType,
      resourceId,
      taskCount: jobIds.length,
      jobIds,
      priority
    });
    
    return jobIds;
    
  } catch (error) {
    logger.error('加入翻译队列失败', {
      shop,
      resourceType,
      resourceId,
      error: error.message
    });
    throw error;
  }
}

// ===== 具体的webhook处理器 =====

/**
 * 处理产品创建
 */
async function handleProductCreate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'PRODUCT',
    scope: 'resource',
    scopeId: resourceId
  });
  
  if (await shouldTranslate(shop, 'PRODUCT', resourceId)) {
    const priority = getResourcePriority('PRODUCT');
    await queueTranslation(shop, 'PRODUCT', resourceId, priority);
    return { success: true, message: '产品翻译任务已创建' };
  }
  
  return { success: true, message: '产品无需翻译' };
}

/**
 * 处理产品更新
 */
async function handleProductUpdate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'PRODUCT',
    scope: 'resource',
    scopeId: resourceId
  });
  
  // 检查是否是实质性更新
  const significantFields = ['title', 'body_html', 'vendor', 'product_type'];
  const hasSignificantChange = significantFields.some(field => 
    payload.hasOwnProperty(field)
  );
  
  if (!hasSignificantChange) {
    return { success: true, message: '产品更新不涉及需翻译内容' };
  }
  
  if (await shouldTranslate(shop, 'PRODUCT', resourceId)) {
    const priority = getResourcePriority('PRODUCT');
    await queueTranslation(shop, 'PRODUCT', resourceId, priority);
    return { success: true, message: '产品更新翻译任务已创建' };
  }
  
  return { success: true, message: '产品无需翻译' };
}

/**
 * 处理产品删除
 */
async function handleProductDelete(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'PRODUCT',
    scope: 'resource',
    scopeId: resourceId
  });
  
  // 清理相关翻译记录
  await prisma.translation.deleteMany({
    where: {
      resource: {
        shopId: shop,
        resourceType: 'PRODUCT',
        originalResourceId: resourceId
      }
    }
  });
  
  await prisma.resource.deleteMany({
    where: {
      shopId: shop,
      resourceType: 'PRODUCT',
      originalResourceId: resourceId
    }
  });
  
  return { success: true, message: '产品翻译记录已清理' };
}

/**
 * 处理集合创建
 */
async function handleCollectionCreate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'COLLECTION',
    scope: 'resource',
    scopeId: resourceId
  });
  
  if (await shouldTranslate(shop, 'COLLECTION', resourceId)) {
    const priority = getResourcePriority('COLLECTION');
    await queueTranslation(shop, 'COLLECTION', resourceId, priority);
    return { success: true, message: '集合翻译任务已创建' };
  }
  
  return { success: true, message: '集合无需翻译' };
}

/**
 * 处理集合更新
 */
async function handleCollectionUpdate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'COLLECTION',
    scope: 'resource',
    scopeId: resourceId
  });
  
  // 检查是否是实质性更新
  const significantFields = ['title', 'body_html', 'handle'];
  const hasSignificantChange = significantFields.some(field => 
    payload.hasOwnProperty(field)
  );
  
  if (!hasSignificantChange) {
    return { success: true, message: '集合更新不涉及需翻译内容' };
  }
  
  if (await shouldTranslate(shop, 'COLLECTION', resourceId)) {
    const priority = getResourcePriority('COLLECTION');
    await queueTranslation(shop, 'COLLECTION', resourceId, priority);
    return { success: true, message: '集合更新翻译任务已创建' };
  }
  
  return { success: true, message: '集合无需翻译' };
}

/**
 * 处理页面创建
 */
async function handlePageCreate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'PAGE',
    scope: 'resource',
    scopeId: resourceId
  });
  
  if (await shouldTranslate(shop, 'PAGE', resourceId)) {
    const priority = getResourcePriority('PAGE');
    await queueTranslation(shop, 'PAGE', resourceId, priority);
    return { success: true, message: '页面翻译任务已创建' };
  }
  
  return { success: true, message: '页面无需翻译' };
}

/**
 * 处理页面更新
 */
async function handlePageUpdate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'PAGE',
    scope: 'resource',
    scopeId: resourceId
  });
  
  const significantFields = ['title', 'body_html', 'handle'];
  const hasSignificantChange = significantFields.some(field => 
    payload.hasOwnProperty(field)
  );
  
  if (!hasSignificantChange) {
    return { success: true, message: '页面更新不涉及需翻译内容' };
  }
  
  if (await shouldTranslate(shop, 'PAGE', resourceId)) {
    const priority = getResourcePriority('PAGE');
    await queueTranslation(shop, 'PAGE', resourceId, priority);
    return { success: true, message: '页面更新翻译任务已创建' };
  }
  
  return { success: true, message: '页面无需翻译' };
}

/**
 * 处理主题发布
 */
async function handleThemePublish(shop, payload, event) {
  invalidateCoverageCache(shop, {
    resourceType: 'ONLINE_STORE_THEME',
    scope: 'resource',
    scopeId: payload.id?.toString()
  });
  logger.info('主题发布事件', {
    shop,
    themeId: payload.id,
    themeName: payload.name
  });
  
  // 主题发布后，扫描主题资源并翻译
  // 这是一个重要事件，可能需要重新翻译所有主题内容
  const priority = getResourcePriority('THEME');
  await queueTranslation(shop, 'ONLINE_STORE_THEME', payload.id?.toString(), priority);
  
  return { success: true, message: '主题翻译任务已创建' };
}

/**
 * 处理主题更新
 */
async function handleThemeUpdate(shop, payload, event) {
  invalidateCoverageCache(shop, {
    resourceType: 'ONLINE_STORE_THEME',
    scope: 'resource',
    scopeId: payload.id?.toString()
  });
  // 主题更新通常是设置变更，可能不需要翻译
  logger.info('主题更新事件', {
    shop,
    themeId: payload.id
  });
  
  return { success: true, message: '主题更新已记录' };
}

/**
 * 处理语言创建
 */
async function handleLocaleCreate(shop, payload, event) {
  logger.info('新语言添加事件', {
    shop,
    locale: payload.locale
  });
  
  // 新语言添加后，可能需要触发全站翻译
  // 这里可以发送通知给管理员
  
  return { success: true, message: '新语言已记录，请手动触发翻译' };
}

/**
 * 处理语言更新
 */
async function handleLocaleUpdate(shop, payload, event) {
  logger.info('语言设置更新事件', {
    shop,
    locale: payload.locale
  });
  
  return { success: true, message: '语言更新已记录' };
}

/**
 * 处理文章创建
 */
async function handleArticleCreate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'ARTICLE',
    scope: 'resource',
    scopeId: resourceId
  });
  
  if (await shouldTranslate(shop, 'ARTICLE', resourceId)) {
    const priority = getResourcePriority('ARTICLE');
    await queueTranslation(shop, 'ARTICLE', resourceId, priority);
    return { success: true, message: '文章翻译任务已创建' };
  }
  
  return { success: true, message: '文章无需翻译' };
}

/**
 * 处理文章更新
 */
async function handleArticleUpdate(shop, payload, event) {
  const resourceId = payload.admin_graphql_api_id;
  invalidateCoverageCache(shop, {
    resourceType: 'ARTICLE',
    scope: 'resource',
    scopeId: resourceId
  });
  
  const significantFields = ['title', 'content', 'summary', 'handle'];
  const hasSignificantChange = significantFields.some(field => 
    payload.hasOwnProperty(field)
  );
  
  if (!hasSignificantChange) {
    return { success: true, message: '文章更新不涉及需翻译内容' };
  }
  
  if (await shouldTranslate(shop, 'ARTICLE', resourceId)) {
    const priority = getResourcePriority('ARTICLE');
    await queueTranslation(shop, 'ARTICLE', resourceId, priority);
    return { success: true, message: '文章更新翻译任务已创建' };
  }
  
  return { success: true, message: '文章无需翻译' };
}

/**
 * 从topic获取资源类型
 */
function getResourceTypeFromTopic(topic) {
  const mapping = {
    'products': 'PRODUCT',
    'collections': 'COLLECTION',
    'pages': 'PAGE',
    'themes': 'THEME',
    'articles': 'ARTICLE',
    'blogs': 'BLOG',
    'locales': 'LOCALE'
  };
  
  const topicPrefix = topic.split('/')[0];
  return mapping[topicPrefix] || 'UNKNOWN';
}

export default {
  logWebhookEvent,
  processWebhookEvent,
  shouldTranslate,
  queueTranslation
};
