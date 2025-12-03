-- CreateTable
CREATE TABLE "ServiceLock" (
    "service" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "success" INTEGER NOT NULL DEFAULT 0,
    "failure" INTEGER NOT NULL DEFAULT 0,
    "successRate" REAL NOT NULL DEFAULT 0,
    "failureRate" REAL NOT NULL DEFAULT 0,
    "p95" INTEGER NOT NULL DEFAULT 0,
    "instanceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ServiceLock_acquiredAt_idx" ON "ServiceLock"("acquiredAt");

-- CreateIndex
CREATE INDEX "ApiMetrics_operation_timestamp_idx" ON "ApiMetrics"("operation", "timestamp");

-- CreateIndex
CREATE INDEX "ApiMetrics_createdAt_idx" ON "ApiMetrics"("createdAt");
