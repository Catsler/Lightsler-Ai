-- CreateTable
CREATE TABLE "TranslationLog" (
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

-- CreateIndex
CREATE INDEX "TranslationLog_shopId_timestamp_idx" ON "TranslationLog"("shopId", "timestamp");

-- CreateIndex
CREATE INDEX "TranslationLog_level_timestamp_idx" ON "TranslationLog"("level", "timestamp");

-- CreateIndex
CREATE INDEX "TranslationLog_resourceId_language_idx" ON "TranslationLog"("resourceId", "language");

-- CreateIndex
CREATE INDEX "TranslationLog_category_timestamp_idx" ON "TranslationLog"("category", "timestamp");
