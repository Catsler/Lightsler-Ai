-- CreateTable
CREATE TABLE "QueueBackup" (
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

-- CreateTable
CREATE TABLE "ShopSettings" (
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

-- CreateIndex
CREATE INDEX "QueueBackup_shopId_restored_idx" ON "QueueBackup"("shopId", "restored");

-- CreateIndex
CREATE INDEX "QueueBackup_jobName_createdAt_idx" ON "QueueBackup"("jobName", "createdAt");

-- CreateIndex
CREATE INDEX "QueueBackup_restored_createdAt_idx" ON "QueueBackup"("restored", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");

-- CreateIndex
CREATE INDEX "ShopSettings_shopId_idx" ON "ShopSettings"("shopId");

-- CreateIndex
CREATE INDEX "ShopSettings_marketConfigAt_idx" ON "ShopSettings"("marketConfigAt");
