-- AlterTable
ALTER TABLE "Language" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Language" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "Language" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "PlanOverrideAudit" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "PlanOverrideAudit" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "PlanOverrideAudit" ADD COLUMN "deletionType" TEXT;

-- AlterTable
ALTER TABLE "ShopSubscription" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ShopSubscription" ADD COLUMN "deletionToken" TEXT;
ALTER TABLE "ShopSubscription" ADD COLUMN "deletionType" TEXT;

-- CreateIndex
CREATE INDEX "Language_shopId_deletedAt_idx" ON "Language"("shopId", "deletedAt");

-- CreateIndex
CREATE INDEX "PlanOverrideAudit_shopId_deletedAt_idx" ON "PlanOverrideAudit"("shopId", "deletedAt");

-- CreateIndex
CREATE INDEX "ShopSubscription_shopId_deletedAt_idx" ON "ShopSubscription"("shopId", "deletedAt");
