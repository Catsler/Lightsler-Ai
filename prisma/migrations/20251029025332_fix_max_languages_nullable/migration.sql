-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SubscriptionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "price" REAL NOT NULL DEFAULT 0,
    "monthlyCredits" INTEGER NOT NULL,
    "maxLanguages" INTEGER,
    "features" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SubscriptionPlan" ("createdAt", "displayName", "features", "id", "isActive", "maxLanguages", "monthlyCredits", "name", "price", "sortOrder", "updatedAt") SELECT "createdAt", "displayName", "features", "id", "isActive", "maxLanguages", "monthlyCredits", "name", "price", "sortOrder", "updatedAt" FROM "SubscriptionPlan";
DROP TABLE "SubscriptionPlan";
ALTER TABLE "new_SubscriptionPlan" RENAME TO "SubscriptionPlan";
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");
CREATE INDEX "SubscriptionPlan_isActive_sortOrder_idx" ON "SubscriptionPlan"("isActive", "sortOrder");

-- Backfill maxLanguages values
UPDATE "SubscriptionPlan" SET "maxLanguages" = 2 WHERE LOWER("name") = 'free';
UPDATE "SubscriptionPlan" SET "maxLanguages" = 5 WHERE LOWER("name") = 'starter';
UPDATE "SubscriptionPlan" SET "maxLanguages" = 20 WHERE LOWER("name") IN ('pro', 'standard');
UPDATE "SubscriptionPlan" SET "maxLanguages" = NULL WHERE LOWER("name") IN ('enterprise', 'silver', 'gold');
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
