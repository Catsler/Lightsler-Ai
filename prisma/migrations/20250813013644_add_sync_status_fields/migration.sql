-- AlterTable
ALTER TABLE "Resource" ADD COLUMN "originalResourceId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Translation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Translation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Translation" ("createdAt", "descTrans", "handleTrans", "id", "labelTrans", "language", "resourceId", "seoDescTrans", "seoTitleTrans", "shopId", "status", "summaryTrans", "titleTrans", "translationFields", "updatedAt") SELECT "createdAt", "descTrans", "handleTrans", "id", "labelTrans", "language", "resourceId", "seoDescTrans", "seoTitleTrans", "shopId", "status", "summaryTrans", "titleTrans", "translationFields", "updatedAt" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE UNIQUE INDEX "Translation_resourceId_language_key" ON "Translation"("resourceId", "language");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
