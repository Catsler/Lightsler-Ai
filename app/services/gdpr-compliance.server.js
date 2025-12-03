import { prisma } from '../db.server.js';
import { logger } from '../utils/logger.server.js';
import { getQueueManager } from './queue-manager.server.js';

const GDPR_RETENTION_DAYS = 30;

export const GDPR_REQUEST_TYPES = {
  CUSTOMER_DATA: 'customers/data_request',
  CUSTOMER_REDACT: 'customers/redact',
  SHOP_REDACT: 'shop/redact'
};

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isSameShop(data, shopId) {
  if (!data || !shopId) return false;
  const candidates = [data.shopId, data.shop, data.shopDomain, data.domain];
  const nested = data.session?.shop || data.session?.shopId;
  return [...candidates, nested].filter(Boolean).some((val) => val === shopId);
}

async function cleanQueueJobs(shopId) {
  try {
    const queueManager = getQueueManager();
    const queue = queueManager?.getQueue?.() ?? queueManager?.currentQueue;
    if (!queue) {
      logger.debug('[GDPR] 队列未初始化，跳过队列清理', { shopId });
      return { removed: 0, failed: 0, repeatableRemoved: 0 };
    }

    // 内存队列
    if (queue.constructor?.name === 'MemoryQueue') {
      const allJobs = Array.from(queue.jobs?.values?.() || []);
      let removed = 0;
      for (const job of allJobs) {
        if (isSameShop(job.data, shopId)) {
          queue.jobs.delete(job.id);
          queue.queue = queue.queue?.filter?.((item) => item.id !== job.id) || [];
          removed++;
        }
      }
      return { removed, failed: 0, repeatableRemoved: 0 };
    }

    // Bull/Redis 队列
    const STATES = ['waiting', 'active', 'delayed', 'paused', 'completed', 'failed'];
    let jobs = [];
    try {
      jobs = await queue.getJobs(STATES);
    } catch (error) {
      logger.warn('[GDPR] 获取队列任务失败', { shopId, error: error.message });
    }

    const toRemove = jobs.filter((job) => isSameShop(job?.data, shopId));
    let removed = 0;
    let failed = 0;

    for (const job of toRemove) {
      try {
        await job.remove();
        removed++;
      } catch (error) {
        failed++;
        logger.warn('[GDPR] 队列任务移除失败', { shopId, jobId: job?.id, error: error.message });
      }
    }

    let repeatableRemoved = 0;
    if (typeof queue.getRepeatableJobs === 'function' && typeof queue.removeRepeatableByKey === 'function') {
      try {
        const repeatables = await queue.getRepeatableJobs();
        const related = repeatables.filter((item) => item?.key?.includes(shopId) || item?.name?.includes?.(shopId));
        for (const item of related) {
          try {
            await queue.removeRepeatableByKey(item.key);
            repeatableRemoved++;
          } catch (error) {
            logger.warn('[GDPR] 移除重复任务失败', { shopId, key: item.key, error: error.message });
          }
        }
      } catch (error) {
        logger.warn('[GDPR] 获取重复任务失败', { shopId, error: error.message });
      }
    }

    return { removed, failed, repeatableRemoved };
  } catch (error) {
    logger.warn('[GDPR] 队列清理异常', { shopId, error: error.message });
    return { removed: 0, failed: 0, repeatableRemoved: 0 };
  }
}

async function recordGdprRequest({ shopId, requestType, customerId, payload, deletionToken, scheduledPurgeAt, status }) {
  return prisma.gdprRequest.create({
    data: {
      shopId,
      requestType,
      customerId,
      payload: payload || null,
      deletionToken,
      scheduledPurgeAt,
      status: status || 'pending'
    }
  });
}

async function enqueuePurgeJob({ shopId, deletionToken, scheduledPurgeAt }) {
  try {
    const queueManager = getQueueManager();
    const queue = queueManager?.getQueue?.() ?? queueManager?.currentQueue;
    if (!queue) {
      logger.debug('[GDPR] 未初始化队列，跳过延迟清理任务');
      return;
    }
    const delayMs = Math.max(scheduledPurgeAt.getTime() - Date.now(), 0);
    await queue.add(
      'purge-gdpr-data',
      { shopId, deletionToken },
      { delay: delayMs, removeOnComplete: true, removeOnFail: true }
    );
    logger.info('[GDPR] 已调度延迟硬删除任务', { shopId, deletionToken, delayMs });
  } catch (error) {
    logger.warn('[GDPR] 调度延迟清理任务失败，需手动运行 purgeSoftDeletedData', { error: error.message });
  }
}

export async function softDeleteShopData({ shopId, requestType, customerId, payload, retentionDays = GDPR_RETENTION_DAYS }) {
  const now = new Date();
  const deletionToken = `gdpr_${requestType}_${now.getTime()}_${shopId}`;
  const scheduledPurgeAt = addDays(now, retentionDays);

  const softDeleteData = {
    deletedAt: now,
    deletionToken,
    deletionType: requestType
  };

  const operations = [
    prisma.resource.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.translation.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.translationSession.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.translationLog.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.errorLog.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.webhookEvent.updateMany({ where: { shop: shopId, deletedAt: null }, data: softDeleteData }),
    prisma.queueBackup.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.creditUsage.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.creditReservation.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.shopSettings.updateMany({ where: { shopId, deletedAt: null }, data: softDeleteData }),
    prisma.session.deleteMany({ where: { shop: shopId } }),
    prisma.shop.updateMany({
      where: { id: shopId },
      data: {
        accessToken: '',
        redactedAt: now,
        redactionToken: deletionToken,
        gdprRequestType: requestType
      }
    })
  ];

  await prisma.$transaction(operations);

  await recordGdprRequest({
    shopId,
    requestType,
    customerId,
    payload,
    deletionToken,
    scheduledPurgeAt,
    status: 'soft-deleted'
  });

  await enqueuePurgeJob({ shopId, deletionToken, scheduledPurgeAt });

  const queueResult = await cleanQueueJobs(shopId);
  logger.info('[GDPR] 队列清理完成', { shopId, queueResult });

  logger.info('[GDPR] 完成软删除标记', {
    shopId,
    requestType,
    customerId,
    scheduledPurgeAt,
    retentionDays
  });

  return { deletionToken, scheduledPurgeAt };
}

export async function purgeSoftDeletedData({ shopId, before = new Date() }) {
  const purgedAt = new Date();
  const requestFilter = {
    status: 'soft-deleted',
    scheduledPurgeAt: { lte: before },
    ...(shopId ? { shopId } : {})
  };

  const requests = await prisma.gdprRequest.findMany({ where: requestFilter });
  if (requests.length === 0) {
    logger.info('[GDPR] 无待硬删除的数据', { shopId, before });
    return { success: [], failed: [] };
  }

  const results = { success: [], failed: [] };

  for (const request of requests) {
    const deletionToken = request.deletionToken;
    const shopFilter = request.shopId ? { shopId: request.shopId } : {};

    try {
      await prisma.$transaction(async (tx) => {
        // 先删除依赖项，避免外键约束
        const errorLogIds = await tx.errorLog.findMany({
          where: { deletionToken, ...shopFilter },
          select: { id: true },
          skipSoftDeleteFilter: true
        });
        if (errorLogIds.length > 0) {
          await tx.errorPatternMatch.deleteMany({
            where: { errorLogId: { in: errorLogIds.map((e) => e.id) } },
            applySoftDelete: false,
            skipSoftDeleteFilter: true
          });
        }

        await tx.translationLog.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.translation.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.translationSession.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.errorLog.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.webhookEvent.deleteMany({ where: { deletionToken, shop: request.shopId }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.queueBackup.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.creditReservation.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.creditUsage.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.shopSettings.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.session.deleteMany({ where: { shop: request.shopId }, applySoftDelete: false, skipSoftDeleteFilter: true });
        await tx.resource.deleteMany({ where: { deletionToken, ...shopFilter }, applySoftDelete: false, skipSoftDeleteFilter: true });

        await tx.gdprRequest.updateMany({
          where: { deletionToken },
          data: { status: 'purged', processedAt: purgedAt }
        });
      });

      results.success.push(deletionToken);
      logger.info('[GDPR] 硬删除完成', { shopId: request.shopId, deletionToken });
    } catch (error) {
      results.failed.push({ deletionToken, error: error.message });
      logger.error('[GDPR] 硬删除失败', { shopId: request.shopId, deletionToken, error: error.message });
      await prisma.gdprRequest.updateMany({
        where: { deletionToken },
        data: { status: 'failed', payload: request.payload, customerId: request.customerId }
      });
    }
  }

  return results;
}

export async function handleCustomerDataRequest({ shop, payload }) {
  const customerId = payload?.customer?.id?.toString?.() || payload?.customer?.id || null;
  const deletionToken = `gdpr_data_request_${Date.now()}_${shop}`;
  const scheduledPurgeAt = addDays(new Date(), GDPR_RETENTION_DAYS);

  await recordGdprRequest({
    shopId: shop,
    requestType: GDPR_REQUEST_TYPES.CUSTOMER_DATA,
    customerId,
    payload,
    deletionToken,
    scheduledPurgeAt,
    status: 'completed'
  });

  logger.info('[GDPR] 客户数据导出请求已记录', { shop, customerId });
}

export async function handleCustomerRedact({ shop, payload }) {
  const customerId = payload?.customer?.id?.toString?.() || payload?.customer?.id || null;
  const deletionToken = `gdpr_customer_redact_${Date.now()}_${shop}`;
  const scheduledPurgeAt = addDays(new Date(), GDPR_RETENTION_DAYS);

  await recordGdprRequest({
    shopId: shop,
    requestType: GDPR_REQUEST_TYPES.CUSTOMER_REDACT,
    customerId,
    payload,
    deletionToken,
    scheduledPurgeAt,
    status: 'completed'
  });

  logger.info('[GDPR] 客户删除请求已记录，无客户数据存储', { shop, customerId });
}

export async function handleShopRedact({ shop, payload }) {
  const recent = await prisma.gdprRequest.findFirst({
    where: {
      shopId: shop,
      requestType: GDPR_REQUEST_TYPES.SHOP_REDACT,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      status: { in: ['soft-deleted', 'purged'] }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (recent) {
    logger.info('[GDPR] 跳过重复 shop/redact 请求', { shop, existingToken: recent.deletionToken });
    return { deletionToken: recent.deletionToken, scheduledPurgeAt: recent.scheduledPurgeAt };
  }

  return softDeleteShopData({
    shopId: shop,
    requestType: GDPR_REQUEST_TYPES.SHOP_REDACT,
    customerId: null,
    payload
  });
}
