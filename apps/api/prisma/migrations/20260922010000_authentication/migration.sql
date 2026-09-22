-- CreateTable
CREATE TABLE "SuperAdminSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "SuperAdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdminSession_refreshTokenHash_key" ON "SuperAdminSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "SuperAdminSession_revokedAt_idx" ON "SuperAdminSession"("revokedAt");

-- CreateIndex
CREATE INDEX "SuperAdminSession_expiresAt_idx" ON "SuperAdminSession"("expiresAt");
