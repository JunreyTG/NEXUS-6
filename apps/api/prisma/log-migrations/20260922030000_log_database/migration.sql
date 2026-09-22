-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LogActorType" AS ENUM ('ADMIN', 'SUPER_ADMIN', 'SYSTEM', 'ANONYMOUS');

-- CreateTable
CREATE TABLE "LoginLog" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "LogActorType" NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "LogActorType" NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" UUID,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "LogActorType" NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" UUID,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetActivityLog" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "LogActorType" NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" UUID,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    CONSTRAINT "DatasetActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseActivityLog" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "LogActorType" NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" UUID,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    CONSTRAINT "DatabaseActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginLog_timestamp_idx" ON "LoginLog"("timestamp");
CREATE INDEX "LoginLog_actorEmail_timestamp_idx" ON "LoginLog"("actorEmail", "timestamp");
CREATE INDEX "LoginLog_action_timestamp_idx" ON "LoginLog"("action", "timestamp");
CREATE INDEX "LoginLog_success_timestamp_idx" ON "LoginLog"("success", "timestamp");

CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX "AuditLog_actorEmail_timestamp_idx" ON "AuditLog"("actorEmail", "timestamp");
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");
CREATE INDEX "AuditLog_resourceType_resourceId_timestamp_idx" ON "AuditLog"("resourceType", "resourceId", "timestamp");
CREATE INDEX "AuditLog_success_timestamp_idx" ON "AuditLog"("success", "timestamp");

CREATE INDEX "SecurityEvent_timestamp_idx" ON "SecurityEvent"("timestamp");
CREATE INDEX "SecurityEvent_actorEmail_timestamp_idx" ON "SecurityEvent"("actorEmail", "timestamp");
CREATE INDEX "SecurityEvent_action_timestamp_idx" ON "SecurityEvent"("action", "timestamp");
CREATE INDEX "SecurityEvent_success_timestamp_idx" ON "SecurityEvent"("success", "timestamp");

CREATE INDEX "DatasetActivityLog_timestamp_idx" ON "DatasetActivityLog"("timestamp");
CREATE INDEX "DatasetActivityLog_actorEmail_timestamp_idx" ON "DatasetActivityLog"("actorEmail", "timestamp");
CREATE INDEX "DatasetActivityLog_action_timestamp_idx" ON "DatasetActivityLog"("action", "timestamp");
CREATE INDEX "DatasetActivityLog_resourceType_resourceId_timestamp_idx" ON "DatasetActivityLog"("resourceType", "resourceId", "timestamp");
CREATE INDEX "DatasetActivityLog_success_timestamp_idx" ON "DatasetActivityLog"("success", "timestamp");

CREATE INDEX "DatabaseActivityLog_timestamp_idx" ON "DatabaseActivityLog"("timestamp");
CREATE INDEX "DatabaseActivityLog_actorEmail_timestamp_idx" ON "DatabaseActivityLog"("actorEmail", "timestamp");
CREATE INDEX "DatabaseActivityLog_action_timestamp_idx" ON "DatabaseActivityLog"("action", "timestamp");
CREATE INDEX "DatabaseActivityLog_resourceType_resourceId_timestamp_idx" ON "DatabaseActivityLog"("resourceType", "resourceId", "timestamp");
CREATE INDEX "DatabaseActivityLog_success_timestamp_idx" ON "DatabaseActivityLog"("success", "timestamp");
