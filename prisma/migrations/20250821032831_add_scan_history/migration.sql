-- CreateTable
CREATE TABLE "ScanHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "lastScanned" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resourceCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "scanDuration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScanHistory_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScanHistory_shopId_idx" ON "ScanHistory"("shopId");

-- CreateIndex
CREATE INDEX "ScanHistory_lastScanned_idx" ON "ScanHistory"("lastScanned");

-- CreateIndex
CREATE UNIQUE INDEX "ScanHistory_shopId_language_key" ON "ScanHistory"("shopId", "language");
