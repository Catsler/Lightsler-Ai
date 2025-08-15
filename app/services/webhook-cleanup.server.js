/**
 * Webhook事件清理服务
 * 定期清理过期的webhook事件记录
 */

import prisma from '../db.server.js';
import { logger } from '../utils/logger.server.js';
import { getEventCleanupDate } from '../config/webhook-config.js';

/**
 * 清理过期的webhook事件
 */
export async function cleanupWebhookEvents() {
  try {
    const cleanupDate = getEventCleanupDate();
    
    logger.info('开始清理webhook事件', {
      cleanupDate,
      retentionDays: process.env.WEBHOOK_EVENT_RETENTION_DAYS || 30
    });
    
    // 删除过期的已处理事件
    const deletedProcessed = await prisma.webhookEvent.deleteMany({
      where: {
        createdAt: { lt: cleanupDate },
        processed: true
      }
    });
    
    // 删除超过60天的未处理事件（可能是异常事件）
    const veryOldDate = new Date();
    veryOldDate.setDate(veryOldDate.getDate() - 60);
    
    const deletedUnprocessed = await prisma.webhookEvent.deleteMany({
      where: {
        createdAt: { lt: veryOldDate },
        processed: false
      }
    });
    
    logger.info('Webhook事件清理完成', {
      deletedProcessed: deletedProcessed.count,
      deletedUnprocessed: deletedUnprocessed.count,
      total: deletedProcessed.count + deletedUnprocessed.count
    });
    
    return {
      success: true,
      deletedProcessed: deletedProcessed.count,
      deletedUnprocessed: deletedUnprocessed.count
    };
    
  } catch (error) {
    logger.error('清理webhook事件失败', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 获取webhook事件统计
 */
export async function getWebhookEventStats() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 统计总数
    const totalCount = await prisma.webhookEvent.count();
    
    // 统计已处理和未处理
    const processedCount = await prisma.webhookEvent.count({
      where: { processed: true }
    });
    
    const unprocessedCount = await prisma.webhookEvent.count({
      where: { processed: false }
    });
    
    // 统计最近24小时
    const last24HoursCount = await prisma.webhookEvent.count({
      where: { createdAt: { gte: oneDayAgo } }
    });
    
    // 统计最近7天
    const last7DaysCount = await prisma.webhookEvent.count({
      where: { createdAt: { gte: oneWeekAgo } }
    });
    
    // 按事件类型统计
    const eventsByType = await prisma.webhookEvent.groupBy({
      by: ['topic'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });
    
    // 按店铺统计
    const eventsByShop = await prisma.webhookEvent.groupBy({
      by: ['shop'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });
    
    // 获取最旧和最新的事件
    const oldestEvent = await prisma.webhookEvent.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });
    
    const newestEvent = await prisma.webhookEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });
    
    return {
      total: totalCount,
      processed: processedCount,
      unprocessed: unprocessedCount,
      last24Hours: last24HoursCount,
      last7Days: last7DaysCount,
      byType: eventsByType.map(e => ({
        topic: e.topic,
        count: e._count.id
      })),
      byShop: eventsByShop.map(e => ({
        shop: e.shop,
        count: e._count.id
      })),
      dateRange: {
        oldest: oldestEvent?.createdAt,
        newest: newestEvent?.createdAt
      }
    };
    
  } catch (error) {
    logger.error('获取webhook事件统计失败', {
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
}

/**
 * 重试失败的webhook事件
 */
export async function retryFailedWebhookEvents(limit = 10) {
  try {
    // 查找未处理且重试次数少于3次的事件
    const failedEvents = await prisma.webhookEvent.findMany({
      where: {
        processed: false,
        retryCount: { lt: 3 }
      },
      orderBy: { createdAt: 'asc' },
      take: limit
    });
    
    logger.info(`找到 ${failedEvents.length} 个需要重试的webhook事件`);
    
    const results = [];
    
    for (const event of failedEvents) {
      try {
        // 这里需要调用实际的处理逻辑
        // 暂时只更新重试次数
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            retryCount: event.retryCount + 1,
            processedAt: new Date()
          }
        });
        
        results.push({
          eventId: event.id,
          success: true
        });
        
      } catch (error) {
        logger.error(`重试webhook事件失败: ${event.id}`, {
          error: error.message
        });
        
        results.push({
          eventId: event.id,
          success: false,
          error: error.message
        });
      }
    }
    
    return {
      total: failedEvents.length,
      results
    };
    
  } catch (error) {
    logger.error('重试webhook事件失败', {
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
}

// 定期执行清理（如果在主进程中运行）
let cleanupInterval = null;

/**
 * 启动定期清理
 */
export function startWebhookCleanup(intervalHours = 24) {
  if (cleanupInterval) {
    logger.warn('Webhook清理任务已在运行');
    return;
  }
  
  // 立即执行一次
  cleanupWebhookEvents();
  
  // 设置定期执行
  cleanupInterval = setInterval(() => {
    cleanupWebhookEvents();
  }, intervalHours * 60 * 60 * 1000);
  
  logger.info(`Webhook清理任务已启动，每${intervalHours}小时执行一次`);
}

/**
 * 停止定期清理
 */
export function stopWebhookCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Webhook清理任务已停止');
  }
}

export default {
  cleanupWebhookEvents,
  getWebhookEventStats,
  retryFailedWebhookEvents,
  startWebhookCleanup,
  stopWebhookCleanup
};