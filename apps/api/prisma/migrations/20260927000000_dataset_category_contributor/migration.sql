-- AlterTable
ALTER TABLE "Dataset" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Education';
ALTER TABLE "Dataset" ADD COLUMN "contributorName" TEXT;
ALTER TABLE "Dataset" ADD COLUMN "contributorEmail" TEXT;
ALTER TABLE "Dataset" ALTER COLUMN "ownerAdminId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Dataset_category_idx" ON "Dataset"("category");
