-- AlterTable
ALTER TABLE "Resource" ADD COLUMN "productType" TEXT;
ALTER TABLE "Resource" ADD COLUMN "tags" TEXT;
ALTER TABLE "Resource" ADD COLUMN "vendor" TEXT;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN "productTypeTrans" TEXT;
ALTER TABLE "Translation" ADD COLUMN "tagsTrans" TEXT;
ALTER TABLE "Translation" ADD COLUMN "vendorTrans" TEXT;
