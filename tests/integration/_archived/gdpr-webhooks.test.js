/* eslint-disable import/first */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
const noopLogger = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../../app/utils/logger.server.js', () => ({
    logger: noopLogger
}));

// Mock Queue Manager
vi.mock('../../app/services/queue-manager.server.js', () => ({
    getQueueManager: vi.fn(() => ({
        getQueue: () => ({
            add: vi.fn(),
            getJobs: vi.fn(() => []),
            getRepeatableJobs: vi.fn(() => [])
        })
    }))
}));

// Mock Prisma
const prismaMock = vi.hoisted(() => {
    const logCall = (name) => (...args) => { console.log(`Mock ${name} called`); return []; };

    const mockObj = {
        gdprRequest: {
            create: vi.fn(logCall('gdprRequest.create')),
            findFirst: vi.fn(logCall('gdprRequest.findFirst')),
            findMany: vi.fn(logCall('gdprRequest.findMany')),
            updateMany: vi.fn(logCall('gdprRequest.updateMany')),
        },
        resource: { updateMany: vi.fn(logCall('resource.updateMany')), deleteMany: vi.fn(logCall('resource.deleteMany')) },
        translation: { updateMany: vi.fn(logCall('translation.updateMany')), deleteMany: vi.fn(logCall('translation.deleteMany')) },
        translationSession: { updateMany: vi.fn(logCall('translationSession.updateMany')), deleteMany: vi.fn(logCall('translationSession.deleteMany')) },
        translationLog: { updateMany: vi.fn(logCall('translationLog.updateMany')), deleteMany: vi.fn(logCall('translationLog.deleteMany')) },
        errorLog: { updateMany: vi.fn(logCall('errorLog.updateMany')), deleteMany: vi.fn(logCall('errorLog.deleteMany')), findMany: vi.fn(logCall('errorLog.findMany')) },
        webhookEvent: { updateMany: vi.fn(logCall('webhookEvent.updateMany')), deleteMany: vi.fn(logCall('webhookEvent.deleteMany')) },
        queueBackup: { updateMany: vi.fn(logCall('queueBackup.updateMany')), deleteMany: vi.fn(logCall('queueBackup.deleteMany')) },
        creditUsage: { updateMany: vi.fn(logCall('creditUsage.updateMany')), deleteMany: vi.fn(logCall('creditUsage.deleteMany')) },
        creditReservation: { updateMany: vi.fn(logCall('creditReservation.updateMany')), deleteMany: vi.fn(logCall('creditReservation.deleteMany')) },
        shopSettings: { updateMany: vi.fn(logCall('shopSettings.updateMany')), deleteMany: vi.fn(logCall('shopSettings.deleteMany')) },
        session: { deleteMany: vi.fn(logCall('session.deleteMany')) },
        shop: { updateMany: vi.fn(logCall('shop.updateMany')) },
        errorPatternMatch: { deleteMany: vi.fn(logCall('errorPatternMatch.deleteMany')) },
    };

    mockObj.$transaction = vi.fn(async (callback) => {
        console.log('Mock $transaction called');
        if (typeof callback === 'function') {
            try {
                const result = await callback(mockObj);
                console.log('Mock $transaction callback finished');
                return result;
            } catch (e) {
                console.log('Mock $transaction callback failed', e);
                throw e;
            }
        }
        return callback;
    });

    return mockObj;
});

vi.mock('../../app/db.server.js', () => ({
    prisma: prismaMock
}));

// Import the functions to test
import {
    handleShopRedact,
    purgeSoftDeletedData
} from '../../app/services/gdpr-compliance.server.js';

describe('GDPR Compliance Integration', () => {
    const shopId = 'test-shop.myshopify.com';
    const payload = { shop_domain: shopId };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Override $transaction to ensure it works
        prismaMock.$transaction.mockImplementation(async (callback) => {
            console.log('Overridden $transaction called');
            if (typeof callback === 'function') {
                return callback(prismaMock);
            }
            return callback;
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('handleShopRedact', () => {
        it('should process new shop redact request and soft delete data', async () => {
            // Mock no existing request
            prismaMock.gdprRequest.findFirst.mockResolvedValue(null);

            // Mock transaction success
            prismaMock.$transaction.mockResolvedValue([]);
            prismaMock.gdprRequest.create.mockResolvedValue({ id: 'req_1' });

            const result = await handleShopRedact({ shop: shopId, payload });

            expect(result).toHaveProperty('deletionToken');
            expect(result).toHaveProperty('scheduledPurgeAt');
            expect(prismaMock.gdprRequest.findFirst).toHaveBeenCalled();
            expect(prismaMock.$transaction).toHaveBeenCalled();

            // Verify soft delete updates were called
            expect(prismaMock.resource.updateMany).toHaveBeenCalled();
            expect(prismaMock.shop.updateMany).toHaveBeenCalled();
        });

        it('should be idempotent: return existing token for recent request', async () => {
            const existingToken = 'gdpr_shop_redact_1234567890_test-shop';
            const existingPurgeDate = new Date();

            // Mock existing request found
            prismaMock.gdprRequest.findFirst.mockResolvedValue({
                deletionToken: existingToken,
                scheduledPurgeAt: existingPurgeDate,
                status: 'soft-deleted'
            });

            const result = await handleShopRedact({ shop: shopId, payload });

            expect(result.deletionToken).toBe(existingToken);
            expect(result.scheduledPurgeAt).toBe(existingPurgeDate);

            // Should NOT trigger new soft delete transaction
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('purgeSoftDeletedData', () => {
        it('should permanently delete data for due requests', async () => {
            const deletionToken = 'token_123';
            const mockRequest = {
                deletionToken,
                shopId,
                status: 'soft-deleted',
                payload: {}
            };

            // Mock finding due requests
            prismaMock.gdprRequest.findMany.mockResolvedValue([mockRequest]);

            // Mock error logs check
            prismaMock.errorLog.findMany.mockResolvedValue([]);

            const result = await purgeSoftDeletedData({ shopId });

            expect(result.success).toContain(deletionToken);
            expect(prismaMock.$transaction).toHaveBeenCalled();

            // Verify deleteMany calls
            if (prismaMock.resource.deleteMany.mock.calls.length === 0) {
                console.log('Resource deleteMany not called. Checking for errors...');
                console.log('Logger error calls:', noopLogger.error.mock.calls);
                console.log('GDPR findMany result:', await prismaMock.gdprRequest.findMany());
            }

            expect(prismaMock.resource.deleteMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ deletionToken })
                })
            );
            expect(prismaMock.gdprRequest.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { deletionToken },
                    data: expect.objectContaining({ status: 'purged' })
                })
            );
        });

        it('should handle errors during purge gracefully', async () => {
            const deletionToken = 'token_error';
            const mockRequest = {
                deletionToken,
                shopId,
                status: 'soft-deleted',
                payload: {}
            };

            prismaMock.gdprRequest.findMany.mockResolvedValue([mockRequest]);

            // Mock transaction failure
            prismaMock.$transaction.mockRejectedValue(new Error('DB Error'));

            const result = await purgeSoftDeletedData({ shopId });

            expect(result.failed).toHaveLength(1);
            expect(result.failed[0].deletionToken).toBe(deletionToken);

            // Should mark request as failed
            expect(prismaMock.gdprRequest.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { deletionToken },
                    data: expect.objectContaining({ status: 'failed' })
                })
            );
        });
    });
});
