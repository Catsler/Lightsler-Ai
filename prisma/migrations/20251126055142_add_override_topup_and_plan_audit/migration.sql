-- CreateTable
CREATE TABLE "PlanOverrideAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "fromPlanId" TEXT,
    "toPlanId" TEXT,
    "reason" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanOverrideAudit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "overridePlanId" TEXT,
    "overrideExpiresAt" DATETIME,
    "overrideReason" TEXT,
    "allowBillingBypass" BOOLEAN NOT NULL DEFAULT false,
    "topUpCredits" INTEGER NOT NULL DEFAULT 0,
    "topUpExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "redactedAt" DATETIME,
    "redactionToken" TEXT,
    "gdprRequestType" TEXT,
    CONSTRAINT "Shop_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "SubscriptionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shop" ("accessToken", "activeLanguages", "autoTranslateEnabled", "createdAt", "domain", "gdprRequestType", "gracePeriodEndsAt", "id", "pendingPlanId", "planChangeRequestedAt", "redactedAt", "redactionToken", "updatedAt") SELECT "accessToken", "activeLanguages", "autoTranslateEnabled", "createdAt", "domain", "gdprRequestType", "gracePeriodEndsAt", "id", "pendingPlanId", "planChangeRequestedAt", "redactedAt", "redactionToken", "updatedAt" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlanOverrideAudit_shopId_createdAt_idx" ON "PlanOverrideAudit"("shopId", "createdAt");
