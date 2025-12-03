-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "autoTranslateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "activeLanguages" INTEGER NOT NULL DEFAULT 1,
    "pendingPlanId" TEXT,
    "planChangeRequestedAt" DATETIME,
    "gracePeriodEndsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shop_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "SubscriptionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shop" ("accessToken", "activeLanguages", "autoTranslateEnabled", "createdAt", "domain", "id", "updatedAt") SELECT "accessToken", "activeLanguages", "autoTranslateEnabled", "createdAt", "domain", "id", "updatedAt" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
