#!/usr/bin/env node
/**
 * Translation Queue Worker Process
 *
 * This worker process handles background translation jobs from the Bull queue.
 * It runs separately from the main Remix application to ensure queue processing
 * doesn't block the web server.
 *
 * Environment variables required:
 * - QUEUE_ROLE=worker (tells the queue service to register processors)
 * - SHOP_ID=shop1|shop2 (for multi-tenant isolation)
 * - REDIS_URL (Bull queue Redis connection)
 * - All other env vars from .env file
 */

import './app/load-env.server.js';
import { getEnvWithDevOverride } from './app/utils/env.server.js';
import { translationQueue, registerQueueProcessors } from './app/services/queue.server.js';
import { logger } from './app/utils/logger.server.js';

const SHOP_ID = getEnvWithDevOverride('SHOP_ID', 'default');
const queueRole = getEnvWithDevOverride('QUEUE_ROLE', process.env.QUEUE_ROLE);


async function startWorker() {
  try {
    logger.info(`[Worker] Starting translation worker for ${SHOP_ID}`, {
      shopId: SHOP_ID,
      queueRole,
      nodeEnv: process.env.NODE_ENV
    });

    logger.info('[Worker] Registering queue processors...');

    // Register processors (this is required for worker mode)
    await registerQueueProcessors();

    logger.info('[Worker] Translation worker started successfully', {
      shopId: SHOP_ID,
      queueName: translationQueue?.name || 'translation'
    });

    // Keep process alive
    process.on('SIGTERM', async () => {
      logger.info('[Worker] Received SIGTERM, shutting down gracefully...');
      try {
        if (translationQueue && typeof translationQueue.close === 'function') {
          await translationQueue.close();
        }
      } catch (err) {
        logger.warn('[Worker] Error closing queue during shutdown:', err.message);
      }
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('[Worker] Received SIGINT, shutting down gracefully...');
      try {
        if (translationQueue && typeof translationQueue.close === 'function') {
          await translationQueue.close();
        }
      } catch (err) {
        logger.warn('[Worker] Error closing queue during shutdown:', err.message);
      }
      process.exit(0);
    });

  } catch (error) {
    logger.error('[Worker] Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();
