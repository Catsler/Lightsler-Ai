-- CreateTable
CREATE TABLE "TranslationSession" (
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

-- CreateTable
CREATE TABLE "ErrorPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "errorTypePattern" TEXT,
    "messagePattern" TEXT,
    "contextPattern" JSONB,
    "stackTracePattern" TEXT,
    "occurrenceThreshold" INTEGER NOT NULL DEFAULT 1,
    "timeWindowMinutes" INTEGER NOT NULL DEFAULT 60,
    "resourceTypeFilter" JSONB,
    "autoFixEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fixAction" TEXT,
    "fixParameters" JSONB,
    "fixScript" TEXT,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "fixSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "fixFailureCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ErrorPatternMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "errorLogId" TEXT NOT NULL,
    "errorPatternId" TEXT NOT NULL,
    "matchScore" REAL NOT NULL,
    "matchedFields" JSONB NOT NULL,
    "fixApplied" BOOLEAN NOT NULL DEFAULT false,
    "fixStatus" TEXT,
    "fixResult" JSONB,
    "fixAttempts" INTEGER NOT NULL DEFAULT 0,
    "matchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fixedAt" DATETIME,
    CONSTRAINT "ErrorPatternMatch_errorLogId_fkey" FOREIGN KEY ("errorLogId") REFERENCES "ErrorLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorPatternMatch_errorPatternId_fkey" FOREIGN KEY ("errorPatternId") REFERENCES "ErrorPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ResourceToTranslationSession" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ResourceToTranslationSession_A_fkey" FOREIGN KEY ("A") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ResourceToTranslationSession_B_fkey" FOREIGN KEY ("B") REFERENCES "TranslationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
INSERT INTO "new_ErrorLog" ("acknowledgedAt", "assignedTo", "businessImpact", "context", "createdAt", "environment", "errorCategory", "errorCode", "errorType", "fingerprint", "firstSeenAt", "fixVersion", "groupId", "id", "ipAddress", "lastSeenAt", "message", "notes", "occurrences", "operation", "priority", "relatedErrors", "requestBody", "requestMethod", "requestUrl", "resolution", "resolvedAt", "resourceId", "resourceType", "responseStatus", "rootCause", "sessionId", "severity", "shopId", "stackTrace", "status", "suggestedFix", "tags", "updatedAt", "userAgent", "userId", "userImpact") SELECT "acknowledgedAt", "assignedTo", "businessImpact", "context", "createdAt", "environment", "errorCategory", "errorCode", "errorType", "fingerprint", "firstSeenAt", "fixVersion", "groupId", "id", "ipAddress", "lastSeenAt", "message", "notes", "occurrences", "operation", "priority", "relatedErrors", "requestBody", "requestMethod", "requestUrl", "resolution", "resolvedAt", "resourceId", "resourceType", "responseStatus", "rootCause", "sessionId", "severity", "shopId", "stackTrace", "status", "suggestedFix", "tags", "updatedAt", "userAgent", "userId", "userImpact" FROM "ErrorLog";
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
INSERT INTO "new_Resource" ("contentFields", "createdAt", "description", "descriptionHtml", "gid", "handle", "id", "label", "originalResourceId", "resourceId", "resourceType", "seoDescription", "seoTitle", "shopId", "status", "summary", "title", "updatedAt") SELECT "contentFields", "createdAt", "description", "descriptionHtml", "gid", "handle", "id", "label", "originalResourceId", "resourceId", "resourceType", "seoDescription", "seoTitle", "shopId", "status", "summary", "title", "updatedAt" FROM "Resource";
DROP TABLE "Resource";
ALTER TABLE "new_Resource" RENAME TO "Resource";
CREATE INDEX "Resource_contentHash_idx" ON "Resource"("contentHash");
CREATE INDEX "Resource_lastScannedAt_idx" ON "Resource"("lastScannedAt");
CREATE INDEX "Resource_riskScore_idx" ON "Resource"("riskScore");
CREATE UNIQUE INDEX "Resource_shopId_resourceType_resourceId_key" ON "Resource"("shopId", "resourceType", "resourceId");
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
INSERT INTO "new_Translation" ("createdAt", "descTrans", "handleTrans", "id", "labelTrans", "language", "resourceId", "seoDescTrans", "seoTitleTrans", "shopId", "status", "summaryTrans", "syncBatch", "syncError", "syncStatus", "syncedAt", "titleTrans", "translationFields", "updatedAt") SELECT "createdAt", "descTrans", "handleTrans", "id", "labelTrans", "language", "resourceId", "seoDescTrans", "seoTitleTrans", "shopId", "status", "summaryTrans", "syncBatch", "syncError", "syncStatus", "syncedAt", "titleTrans", "translationFields", "updatedAt" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE INDEX "Translation_sourceVersion_idx" ON "Translation"("sourceVersion");
CREATE INDEX "Translation_skipReason_idx" ON "Translation"("skipReason");
CREATE INDEX "Translation_qualityScore_idx" ON "Translation"("qualityScore");
CREATE INDEX "Translation_errorFingerprint_idx" ON "Translation"("errorFingerprint");
CREATE UNIQUE INDEX "Translation_resourceId_language_key" ON "Translation"("resourceId", "language");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TranslationSession_shopId_status_idx" ON "TranslationSession"("shopId", "status");

-- CreateIndex
CREATE INDEX "TranslationSession_sessionType_idx" ON "TranslationSession"("sessionType");

-- CreateIndex
CREATE INDEX "TranslationSession_createdAt_idx" ON "TranslationSession"("createdAt");

-- CreateIndex
CREATE INDEX "TranslationSession_status_lastCheckpoint_idx" ON "TranslationSession"("status", "lastCheckpoint");

-- CreateIndex
CREATE INDEX "ErrorPattern_category_severity_idx" ON "ErrorPattern"("category", "severity");

-- CreateIndex
CREATE INDEX "ErrorPattern_isActive_priority_idx" ON "ErrorPattern"("isActive", "priority");

-- CreateIndex
CREATE INDEX "ErrorPattern_lastMatchedAt_idx" ON "ErrorPattern"("lastMatchedAt");

-- CreateIndex
CREATE INDEX "ErrorPatternMatch_matchScore_idx" ON "ErrorPatternMatch"("matchScore");

-- CreateIndex
CREATE INDEX "ErrorPatternMatch_fixApplied_fixStatus_idx" ON "ErrorPatternMatch"("fixApplied", "fixStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorPatternMatch_errorLogId_errorPatternId_key" ON "ErrorPatternMatch"("errorLogId", "errorPatternId");

-- CreateIndex
CREATE UNIQUE INDEX "_ResourceToTranslationSession_AB_unique" ON "_ResourceToTranslationSession"("A", "B");

-- CreateIndex
CREATE INDEX "_ResourceToTranslationSession_B_index" ON "_ResourceToTranslationSession"("B");
