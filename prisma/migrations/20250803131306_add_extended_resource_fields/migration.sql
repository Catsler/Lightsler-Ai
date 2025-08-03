-- AlterTable
ALTER TABLE "Resource" ADD COLUMN "contentFields" JSONB;
ALTER TABLE "Resource" ADD COLUMN "label" TEXT;
ALTER TABLE "Resource" ADD COLUMN "summary" TEXT;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN "labelTrans" TEXT;
ALTER TABLE "Translation" ADD COLUMN "summaryTrans" TEXT;
ALTER TABLE "Translation" ADD COLUMN "translationFields" JSONB;
