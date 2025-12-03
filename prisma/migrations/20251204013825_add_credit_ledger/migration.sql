/*
  Warnings:

  - You are about to drop the `ApiMetrics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GdprRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PlanOverrideAudit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceLock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `deletedAt` on the `CreditReservation` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `CreditReservation` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `CreditReservation` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `CreditUsage` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `CreditUsage` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `CreditUsage` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `ErrorLog` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `ErrorLog` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `ErrorLog` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `Language` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `Language` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `Language` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `QueueBackup` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `QueueBackup` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `QueueBackup` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `Resource` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `Resource` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `Resource` table. All the data in the column will be lost.
  - You are about to drop the column `activeLanguages` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the column `gdprRequestType` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the column `redactedAt` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the column `redactionToken` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `ShopSettings` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `ShopSettings` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `ShopSettings` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `ShopSubscription` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `ShopSubscription` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `ShopSubscription` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `TranslationLog` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `TranslationLog` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `TranslationLog` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `TranslationSession` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `TranslationSession` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `TranslationSession` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `WebhookEvent` table. All the data in the column will be lost.
  - You are about to drop the column `deletionToken` on the `WebhookEvent` table. All the data in the column will be lost.
  - You are about to drop the column `deletionType` on the `WebhookEvent` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `CreditReservation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CreditUsage` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ApiMetrics_createdAt_idx";

-- DropIndex
DROP INDEX "ApiMetrics_operation_timestamp_idx";

-- DropIndex
DROP INDEX "GdprRequest_scheduledPurgeAt_idx";

-- DropIndex
DROP INDEX "GdprRequest_status_idx";

-- DropIndex
DROP INDEX "GdprRequest_shopId_requestType_idx";

-- DropIndex
DROP INDEX "PlanOverrideAudit_shopId_deletedAt_idx";

-- DropIndex
DROP INDEX "PlanOverrideAudit_shopId_createdAt_idx";

-- DropIndex
DROP INDEX "ServiceLock_acquiredAt_idx";

-- DropIndex
DROP INDEX "SubscriptionPlan_isActive_sortOrder_idx";

-- DropIndex
DROP INDEX "SubscriptionPlan_name_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ApiMetrics";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "GdprRequest";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanOverrideAudit";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ServiceLock";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreditReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "reservedCredits" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actualCredits" INTEGER,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditReservation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditReservation_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ShopSubscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CreditReservation" ("actualCredits", "createdAt", "expiresAt", "id", "releasedAt", "reservedCredits", "shopId", "status", "subscriptionId") SELECT "actualCredits", "createdAt", "expiresAt", "id", "releasedAt", "reservedCredits", "shopId", "status", "subscriptionId" FROM "CreditReservation";
DROP TABLE "CreditReservation";
ALTER TABLE "new_CreditReservation" RENAME TO "CreditReservation";
CREATE INDEX "CreditReservation_shopId_idx" ON "CreditReservation"("shopId");
CREATE INDEX "CreditReservation_status_idx" ON "CreditReservation"("status");
CREATE INDEX "CreditReservation_expiresAt_idx" ON "CreditReservation"("expiresAt");
CREATE TABLE "new_CreditUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "operation" TEXT,
    "sourceCharCount" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL,
    "estimatedCredits" INTEGER NOT NULL DEFAULT 0,
    "actualCredits" INTEGER NOT NULL DEFAULT 0,
    "creditsDiff" INTEGER NOT NULL DEFAULT 0,
    "diffPercentage" REAL NOT NULL DEFAULT 0,
    "sourceLanguage" TEXT,
    "targetLanguage" TEXT,
    "batchId" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "usageDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditUsage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditUsage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ShopSubscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CreditUsage" ("actualCredits", "batchId", "createdAt", "creditsDiff", "creditsUsed", "diffPercentage", "estimatedCredits", "id", "metadata", "operation", "resourceId", "resourceType", "sessionId", "shopId", "sourceCharCount", "sourceLanguage", "status", "subscriptionId", "targetLanguage", "usageDate") SELECT coalesce("actualCredits", 0) AS "actualCredits", "batchId", "createdAt", coalesce("creditsDiff", 0) AS "creditsDiff", "creditsUsed", coalesce("diffPercentage", 0) AS "diffPercentage", coalesce("estimatedCredits", 0) AS "estimatedCredits", "id", "metadata", "operation", "resourceId", "resourceType", "sessionId", "shopId", "sourceCharCount", "sourceLanguage", "status", "subscriptionId", "targetLanguage", "usageDate" FROM "CreditUsage";
DROP TABLE "CreditUsage";
ALTER TABLE "new_CreditUsage" RENAME TO "CreditUsage";
CREATE INDEX "CreditUsage_shopId_idx" ON "CreditUsage"("shopId");
CREATE INDEX "CreditUsage_usageDate_idx" ON "CreditUsage"("usageDate");
CREATE TABLE "new_ErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "errorType" TEXT NOT NULL,
    "errorCategory" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "fingerprint" TEXT NOT NULL,
    "groupId" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB NOT NULL,
    "requestUrl" TEXT,
    "requestMethod" TEXT,
    "requestBody" TEXT,
    "responseStatus" INTEGER,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "environment" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "operation" TEXT,
    "userImpact" INTEGER NOT NULL DEFAULT 0,
    "severity" INTEGER NOT NULL DEFAULT 2,
    "businessImpact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assignedTo" TEXT,
    "resolution" TEXT,
    "fixVersion" TEXT,
    "notes" TEXT,
    "suggestedFix" TEXT,
    "rootCause" TEXT,
    "relatedErrors" JSONB,
    "tags" JSONB,
    "translationSessionId" TEXT,
    "recoveryAction" TEXT,
    "autoFixStatus" TEXT,
    "autoFixAttempts" INTEGER NOT NULL DEFAULT 0,
    "isTranslationError" BOOLEAN NOT NULL DEFAULT false,
    "translationContext" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "acknowledgedAt" DATETIME,
    CONSTRAINT "ErrorLog_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ErrorLog_translationSessionId_fkey" FOREIGN KEY ("translationSessionId") REFERENCES "TranslationSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ErrorLog" ("acknowledgedAt", "assignedTo", "autoFixAttempts", "autoFixStatus", "businessImpact", "context", "createdAt", "environment", "errorCategory", "errorCode", "errorType", "fingerprint", "firstSeenAt", "fixVersion", "groupId", "id", "ipAddress", "isTranslationError", "lastSeenAt", "message", "notes", "occurrences", "operation", "priority", "recoveryAction", "relatedErrors", "requestBody", "requestMethod", "requestUrl", "resolution", "resolvedAt", "resourceId", "resourceType", "responseStatus", "rootCause", "sessionId", "severity", "shopId", "stackTrace", "status", "suggestedFix", "tags", "translationContext", "translationSessionId", "updatedAt", "userAgent", "userId", "userImpact") SELECT "acknowledgedAt", "assignedTo", "autoFixAttempts", "autoFixStatus", "businessImpact", "context", "createdAt", "environment", "errorCategory", "errorCode", "errorType", "fingerprint", "firstSeenAt", "fixVersion", "groupId", "id", "ipAddress", "isTranslationError", "lastSeenAt", "message", "notes", "occurrences", "operation", "priority", "recoveryAction", "relatedErrors", "requestBody", "requestMethod", "requestUrl", "resolution", "resolvedAt", "resourceId", "resourceType", "responseStatus", "rootCause", "sessionId", "severity", "shopId", "stackTrace", "status", "suggestedFix", "tags", "translationContext", "translationSessionId", "updatedAt", "userAgent", "userId", "userImpact" FROM "ErrorLog";
DROP TABLE "ErrorLog";
ALTER TABLE "new_ErrorLog" RENAME TO "ErrorLog";
CREATE INDEX "ErrorLog_fingerprint_idx" ON "ErrorLog"("fingerprint");
CREATE INDEX "ErrorLog_shopId_errorType_idx" ON "ErrorLog"("shopId", "errorType");
CREATE INDEX "ErrorLog_status_priority_idx" ON "ErrorLog"("status", "priority");
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
CREATE INDEX "ErrorLog_lastSeenAt_idx" ON "ErrorLog"("lastSeenAt");
CREATE INDEX "ErrorLog_resourceType_resourceId_idx" ON "ErrorLog"("resourceType", "resourceId");
CREATE INDEX "ErrorLog_translationSessionId_idx" ON "ErrorLog"("translationSessionId");
CREATE INDEX "ErrorLog_isTranslationError_idx" ON "ErrorLog"("isTranslationError");
CREATE INDEX "ErrorLog_autoFixStatus_idx" ON "ErrorLog"("autoFixStatus");
CREATE TABLE "new_Language" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Language_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Language" ("code", "enabled", "id", "isActive", "name", "shopId") SELECT "code", "enabled", "id", "isActive", "name", "shopId" FROM "Language";
DROP TABLE "Language";
ALTER TABLE "new_Language" RENAME TO "Language";
CREATE UNIQUE INDEX "Language_shopId_code_key" ON "Language"("shopId", "code");
CREATE TABLE "new_QueueBackup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobData" TEXT NOT NULL,
    "jobOpts" TEXT NOT NULL,
    "backupReason" TEXT,
    "restored" BOOLEAN NOT NULL DEFAULT false,
    "restoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_QueueBackup" ("backupReason", "createdAt", "id", "jobData", "jobId", "jobName", "jobOpts", "restored", "restoredAt", "shopId", "updatedAt") SELECT "backupReason", "createdAt", "id", "jobData", "jobId", "jobName", "jobOpts", "restored", "restoredAt", "shopId", "updatedAt" FROM "QueueBackup";
DROP TABLE "QueueBackup";
ALTER TABLE "new_QueueBackup" RENAME TO "QueueBackup";
CREATE INDEX "QueueBackup_shopId_restored_idx" ON "QueueBackup"("shopId", "restored");
CREATE INDEX "QueueBackup_jobName_createdAt_idx" ON "QueueBackup"("jobName", "createdAt");
CREATE INDEX "QueueBackup_restored_createdAt_idx" ON "QueueBackup"("restored", "createdAt");
CREATE TABLE "new_Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "originalResourceId" TEXT,
    "gid" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "descriptionHtml" TEXT,
    "handle" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "summary" TEXT,
    "label" TEXT,
    "contentFields" JSONB,
    "contentDigests" JSONB,
    "status" TEXT NOT NULL,
    "contentHash" TEXT,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "lastScannedAt" DATETIME,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorAt" DATETIME,
    "riskScore" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Resource_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Resource" ("contentDigests", "contentFields", "contentHash", "contentVersion", "createdAt", "description", "descriptionHtml", "errorCount", "gid", "handle", "id", "label", "lastErrorAt", "lastScannedAt", "originalResourceId", "resourceId", "resourceType", "riskScore", "seoDescription", "seoTitle", "shopId", "status", "summary", "title", "updatedAt") SELECT "contentDigests", "contentFields", "contentHash", "contentVersion", "createdAt", "description", "descriptionHtml", "errorCount", "gid", "handle", "id", "label", "lastErrorAt", "lastScannedAt", "originalResourceId", "resourceId", "resourceType", "riskScore", "seoDescription", "seoTitle", "shopId", "status", "summary", "title", "updatedAt" FROM "Resource";
DROP TABLE "Resource";
ALTER TABLE "new_Resource" RENAME TO "Resource";
CREATE INDEX "Resource_contentHash_idx" ON "Resource"("contentHash");
CREATE INDEX "Resource_lastScannedAt_idx" ON "Resource"("lastScannedAt");
CREATE INDEX "Resource_riskScore_idx" ON "Resource"("riskScore");
CREATE UNIQUE INDEX "Resource_shopId_resourceType_resourceId_key" ON "Resource"("shopId", "resourceType", "resourceId");
CREATE TABLE "new_Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "autoTranslateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pendingPlanId" TEXT,
    "planChangeRequestedAt" DATETIME,
    "gracePeriodEndsAt" DATETIME,
    "overridePlanId" TEXT,
    "overrideExpiresAt" DATETIME,
    "overrideReason" TEXT,
    "allowBillingBypass" BOOLEAN NOT NULL DEFAULT false,
    "topUpCredits" INTEGER NOT NULL DEFAULT 0,
    "topUpExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shop_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "SubscriptionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shop_overridePlanId_fkey" FOREIGN KEY ("overridePlanId") REFERENCES "SubscriptionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shop" ("accessToken", "allowBillingBypass", "autoTranslateEnabled", "createdAt", "domain", "gracePeriodEndsAt", "id", "overrideExpiresAt", "overridePlanId", "overrideReason", "pendingPlanId", "planChangeRequestedAt", "topUpCredits", "topUpExpiresAt", "updatedAt") SELECT "accessToken", "allowBillingBypass", "autoTranslateEnabled", "createdAt", "domain", "gracePeriodEndsAt", "id", "overrideExpiresAt", "overridePlanId", "overrideReason", "pendingPlanId", "planChangeRequestedAt", "topUpCredits", "topUpExpiresAt", "updatedAt" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "marketConfig" JSONB,
    "marketConfigAt" DATETIME,
    "configVersion" TEXT,
    "urlStrategy" TEXT NOT NULL DEFAULT 'subfolder',
    "enableLinkConversion" BOOLEAN NOT NULL DEFAULT false,
    "autoTranslate" BOOLEAN NOT NULL DEFAULT false,
    "translationDelay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShopSettings" ("autoTranslate", "configVersion", "createdAt", "enableLinkConversion", "id", "marketConfig", "marketConfigAt", "shopId", "translationDelay", "updatedAt", "urlStrategy") SELECT "autoTranslate", "configVersion", "createdAt", "enableLinkConversion", "id", "marketConfig", "marketConfigAt", "shopId", "translationDelay", "updatedAt", "urlStrategy" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");
CREATE INDEX "ShopSettings_shopId_idx" ON "ShopSettings"("shopId");
CREATE INDEX "ShopSettings_marketConfigAt_idx" ON "ShopSettings"("marketConfigAt");
CREATE TABLE "new_ShopSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT,
    "shopifyChargeId" TEXT,
    "billingCycle" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "cancelledAt" DATETIME,
    "overridePlanId" TEXT,
    "overrideExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSubscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShopSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShopSubscription" ("billingCycle", "cancelledAt", "createdAt", "endDate", "id", "planId", "shopId", "shopifyChargeId", "startDate", "status", "updatedAt") SELECT "billingCycle", "cancelledAt", "createdAt", "endDate", "id", "planId", "shopId", "shopifyChargeId", "startDate", "status", "updatedAt" FROM "ShopSubscription";
DROP TABLE "ShopSubscription";
ALTER TABLE "new_ShopSubscription" RENAME TO "ShopSubscription";
CREATE INDEX "ShopSubscription_shopId_idx" ON "ShopSubscription"("shopId");
CREATE INDEX "ShopSubscription_planId_idx" ON "ShopSubscription"("planId");
CREATE UNIQUE INDEX "ShopSubscription_shopId_key" ON "ShopSubscription"("shopId");
CREATE TABLE "new_Translation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "titleTrans" TEXT,
    "descTrans" TEXT,
    "handleTrans" TEXT,
    "summaryTrans" TEXT,
    "labelTrans" TEXT,
    "seoTitleTrans" TEXT,
    "seoDescTrans" TEXT,
    "translationFields" JSONB,
    "status" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "syncedAt" DATETIME,
    "syncError" TEXT,
    "syncBatch" INTEGER,
    "sourceVersion" INTEGER NOT NULL DEFAULT 1,
    "skipReason" TEXT,
    "skipConditions" JSONB,
    "qualityScore" REAL NOT NULL DEFAULT 0.0,
    "errorFingerprint" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" DATETIME,
    "isManualReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNotes" TEXT,
    "translationSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Translation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Translation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Translation_translationSessionId_fkey" FOREIGN KEY ("translationSessionId") REFERENCES "TranslationSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Translation" ("createdAt", "descTrans", "errorFingerprint", "handleTrans", "id", "isManualReview", "labelTrans", "language", "lastRetryAt", "qualityScore", "resourceId", "retryCount", "reviewNotes", "seoDescTrans", "seoTitleTrans", "shopId", "skipConditions", "skipReason", "sourceVersion", "status", "summaryTrans", "syncBatch", "syncError", "syncStatus", "syncedAt", "titleTrans", "translationFields", "translationSessionId", "updatedAt") SELECT "createdAt", "descTrans", "errorFingerprint", "handleTrans", "id", "isManualReview", "labelTrans", "language", "lastRetryAt", "qualityScore", "resourceId", "retryCount", "reviewNotes", "seoDescTrans", "seoTitleTrans", "shopId", "skipConditions", "skipReason", "sourceVersion", "status", "summaryTrans", "syncBatch", "syncError", "syncStatus", "syncedAt", "titleTrans", "translationFields", "translationSessionId", "updatedAt" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE INDEX "Translation_sourceVersion_idx" ON "Translation"("sourceVersion");
CREATE INDEX "Translation_skipReason_idx" ON "Translation"("skipReason");
CREATE INDEX "Translation_qualityScore_idx" ON "Translation"("qualityScore");
CREATE INDEX "Translation_errorFingerprint_idx" ON "Translation"("errorFingerprint");
CREATE UNIQUE INDEX "Translation_resourceId_language_key" ON "Translation"("resourceId", "language");
CREATE TABLE "new_TranslationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "shopId" TEXT,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "language" TEXT,
    "durationMs" INTEGER,
    "context" JSONB,
    "tags" JSONB,
    "operation" TEXT,
    "source" TEXT,
    "batchId" TEXT,
    "requestId" TEXT,
    "environment" TEXT,
    "errorFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TranslationLog" ("batchId", "category", "context", "createdAt", "durationMs", "environment", "errorFlag", "id", "language", "level", "message", "operation", "requestId", "resourceId", "resourceType", "shopId", "source", "tags", "timestamp", "updatedAt") SELECT "batchId", "category", "context", "createdAt", "durationMs", "environment", "errorFlag", "id", "language", "level", "message", "operation", "requestId", "resourceId", "resourceType", "shopId", "source", "tags", "timestamp", "updatedAt" FROM "TranslationLog";
DROP TABLE "TranslationLog";
ALTER TABLE "new_TranslationLog" RENAME TO "TranslationLog";
CREATE INDEX "TranslationLog_shopId_timestamp_idx" ON "TranslationLog"("shopId", "timestamp");
CREATE INDEX "TranslationLog_level_timestamp_idx" ON "TranslationLog"("level", "timestamp");
CREATE INDEX "TranslationLog_resourceId_language_idx" ON "TranslationLog"("resourceId", "language");
CREATE INDEX "TranslationLog_category_timestamp_idx" ON "TranslationLog"("category", "timestamp");
CREATE TABLE "new_TranslationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "sessionName" TEXT,
    "sessionType" TEXT NOT NULL,
    "totalResources" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "currentBatch" INTEGER NOT NULL DEFAULT 0,
    "lastCheckpoint" DATETIME,
    "resumeData" JSONB,
    "batchSize" INTEGER NOT NULL DEFAULT 10,
    "languages" JSONB NOT NULL,
    "resourceTypes" JSONB NOT NULL,
    "translationConfig" JSONB,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryDelay" INTEGER NOT NULL DEFAULT 5000,
    "failureThreshold" REAL NOT NULL DEFAULT 0.3,
    "autoRecovery" BOOLEAN NOT NULL DEFAULT true,
    "qualityThreshold" REAL NOT NULL DEFAULT 0.7,
    "enableManualReview" BOOLEAN NOT NULL DEFAULT false,
    "averageQuality" REAL NOT NULL DEFAULT 0.0,
    "estimatedTimeRemaining" INTEGER,
    "throughputPerMinute" REAL NOT NULL DEFAULT 0.0,
    "errorRate" REAL NOT NULL DEFAULT 0.0,
    "startedAt" DATETIME,
    "pausedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TranslationSession" ("autoRecovery", "averageQuality", "batchSize", "completedAt", "createdAt", "currentBatch", "enableManualReview", "errorRate", "estimatedTimeRemaining", "failedCount", "failureThreshold", "id", "languages", "lastCheckpoint", "maxRetries", "pausedAt", "processedCount", "qualityThreshold", "resourceTypes", "resumeData", "retryDelay", "sessionName", "sessionType", "shopId", "skippedCount", "startedAt", "status", "succeededCount", "throughputPerMinute", "totalResources", "translationConfig", "updatedAt") SELECT "autoRecovery", "averageQuality", "batchSize", "completedAt", "createdAt", "currentBatch", "enableManualReview", "errorRate", "estimatedTimeRemaining", "failedCount", "failureThreshold", "id", "languages", "lastCheckpoint", "maxRetries", "pausedAt", "processedCount", "qualityThreshold", "resourceTypes", "resumeData", "retryDelay", "sessionName", "sessionType", "shopId", "skippedCount", "startedAt", "status", "succeededCount", "throughputPerMinute", "totalResources", "translationConfig", "updatedAt" FROM "TranslationSession";
DROP TABLE "TranslationSession";
ALTER TABLE "new_TranslationSession" RENAME TO "TranslationSession";
CREATE INDEX "TranslationSession_shopId_status_idx" ON "TranslationSession"("shopId", "status");
CREATE INDEX "TranslationSession_sessionType_idx" ON "TranslationSession"("sessionType");
CREATE INDEX "TranslationSession_createdAt_idx" ON "TranslationSession"("createdAt");
CREATE INDEX "TranslationSession_status_lastCheckpoint_idx" ON "TranslationSession"("status", "lastCheckpoint");
CREATE TABLE "new_WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" DATETIME,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop" ("domain") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WebhookEvent" ("createdAt", "error", "id", "payload", "processed", "processedAt", "resourceId", "resourceType", "retryCount", "shop", "topic") SELECT "createdAt", "error", "id", "payload", "processed", "processedAt", "resourceId", "resourceType", "retryCount", "shop", "topic" FROM "WebhookEvent";
DROP TABLE "WebhookEvent";
ALTER TABLE "new_WebhookEvent" RENAME TO "WebhookEvent";
CREATE INDEX "WebhookEvent_shop_topic_idx" ON "WebhookEvent"("shop", "topic");
CREATE INDEX "WebhookEvent_processed_createdAt_idx" ON "WebhookEvent"("processed", "createdAt");
CREATE INDEX "WebhookEvent_resourceType_resourceId_idx" ON "WebhookEvent"("resourceType", "resourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
