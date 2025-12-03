/*
  Warnings:

  - You are about to alter the column `metadata` on the `ApiMetrics` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- AlterTable
ALTER TABLE "CreditReservation" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "CreditReservation" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "CreditReservation" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "CreditUsage" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "CreditUsage" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "CreditUsage" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "ErrorLog" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ErrorLog" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "ErrorLog" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "QueueBackup" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "QueueBackup" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "QueueBackup" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Resource" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "Resource" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "gdprRequestType" TEXT;
ALTER TABLE "Shop" ADD COLUMN "redactedAt" DATETIME;
ALTER TABLE "Shop" ADD COLUMN "redactionToken" TEXT;

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ShopSettings" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Translation" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "Translation" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "TranslationLog" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "TranslationLog" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "TranslationLog" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "TranslationSession" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "TranslationSession" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "TranslationSession" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "WebhookEvent" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "WebhookEvent" ADD COLUMN "deletionType" TEXT;

-- CreateTable
CREATE TABLE "GdprRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT,
    "requestType" TEXT NOT NULL,
    "customerId" TEXT,
    "payload" JSONB,
    "deletionToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledPurgeAt" DATETIME NOT NULL,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "success" INTEGER NOT NULL DEFAULT 0,
    "failure" INTEGER NOT NULL DEFAULT 0,
    "successRate" REAL NOT NULL DEFAULT 0,
    "failureRate" REAL NOT NULL DEFAULT 0,
    "p95" INTEGER NOT NULL DEFAULT 0,
    "instanceId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ApiMetrics" ("createdAt", "failure", "failureRate", "id", "instanceId", "metadata", "operation", "p95", "success", "successRate", "timestamp") SELECT "createdAt", "failure", "failureRate", "id", "instanceId", "metadata", "operation", "p95", "success", "successRate", "timestamp" FROM "ApiMetrics";
DROP TABLE "ApiMetrics";
ALTER TABLE "new_ApiMetrics" RENAME TO "ApiMetrics";
CREATE INDEX "ApiMetrics_operation_timestamp_idx" ON "ApiMetrics"("operation", "timestamp");
CREATE INDEX "ApiMetrics_createdAt_idx" ON "ApiMetrics"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GdprRequest_shopId_requestType_idx" ON "GdprRequest"("shopId", "requestType");

-- CreateIndex
CREATE INDEX "GdprRequest_status_idx" ON "GdprRequest"("status");

-- CreateIndex
CREATE INDEX "GdprRequest_scheduledPurgeAt_idx" ON "GdprRequest"("scheduledPurgeAt");
