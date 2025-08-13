-- CreateTable
CREATE TABLE "ErrorLog" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "acknowledgedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ErrorLog_fingerprint_idx" ON "ErrorLog"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorLog_shopId_errorType_idx" ON "ErrorLog"("shopId", "errorType");

-- CreateIndex
CREATE INDEX "ErrorLog_status_priority_idx" ON "ErrorLog"("status", "priority");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_lastSeenAt_idx" ON "ErrorLog"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorLog_resourceType_resourceId_idx" ON "ErrorLog"("resourceType", "resourceId");
