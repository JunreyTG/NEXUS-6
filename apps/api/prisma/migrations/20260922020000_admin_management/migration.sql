-- CreateTable
CREATE TABLE "AdminPasswordSetupToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adminId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "usedAt" TIMESTAMP(3) WITH TIME ZONE,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPasswordSetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminPasswordSetupToken_tokenHash_key" ON "AdminPasswordSetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminPasswordSetupToken_adminId_idx" ON "AdminPasswordSetupToken"("adminId");

-- CreateIndex
CREATE INDEX "AdminPasswordSetupToken_expiresAt_idx" ON "AdminPasswordSetupToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AdminPasswordSetupToken" ADD CONSTRAINT "AdminPasswordSetupToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
