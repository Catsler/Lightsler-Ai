import { translationQueue } from '../app/services/queue.server.js';
import { logger } from '../app/utils/logger.server.js';

const SHOP_ID = process.env.SHOP_ID || 'unknown';

// 🔍 捕获未处理的Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Worker] Unhandled Promise Rejection', {
    reason: reason,
    reasonType: typeof reason,
    stack: reason?.stack,
    promise: String(promise)
  });
});

async function logStartup() {
  try {
    await translationQueue?.isReady?.();
    const counts = await translationQueue?.getJobCounts?.();
    logger.info(`[Worker] Translation queue worker ready`, {
      shopId: SHOP_ID,
      counts
    });
  } catch (error) {
    logger.error('[Worker] Failed to initialize queue worker', {
      shopId: SHOP_ID,
      error: error.message
    });
  }
}

async function gracefulShutdown(signal) {
  logger.info(`[Worker] Received ${signal}, shutting down queue worker`, { shopId: SHOP_ID });
  try {
    await translationQueue?.close?.();
  } catch (error) {
    logger.warn('[Worker] Failed to close translation queue gracefully', {
      shopId: SHOP_ID,
      error: error.message
    });
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

await logStartup();

setInterval(() => {
  // keep the worker process alive and log queue depth for debugging
  translationQueue?.getJobCounts?.()
    ?.then((counts) => {
      logger.debug('[Worker] Translation queue heartbeat', {
        shopId: SHOP_ID,
        counts
      });
    })
    ?.catch((error) => {
      logger.warn('[Worker] Failed to fetch queue counts', {
        shopId: SHOP_ID,
        error: error.message
      });
    });
}, 60_000);
