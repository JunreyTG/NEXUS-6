ALTER TABLE "Dataset" ADD COLUMN "fileSizeBytes" BIGINT;
ALTER TABLE "Dataset" ADD COLUMN "detectedFields" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Dataset" ADD COLUMN "temporaryFileKey" TEXT;
