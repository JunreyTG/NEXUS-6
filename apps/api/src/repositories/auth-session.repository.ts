import type { PrismaClient } from "../generated/prisma/client.js";
import { databaseOperation } from "../errors/database-error.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";

type AuthSessionDatabase = Pick<PrismaClient, "adminSession" | "superAdminSession">;

export type SessionMetadata = {
  refreshTokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
};

export class AuthSessionRepository {
  constructor(private readonly database: () => AuthSessionDatabase = getSystemDatabase) {}

  findAdminByRefreshTokenHash(refreshTokenHash: string) {
    return databaseOperation(() => this.database().adminSession.findUnique({
      where: { refreshTokenHash },
      include: { admin: true }
    }));
  }

  findAdminById(id: string) {
    return databaseOperation(() => this.database().adminSession.findUnique({
      where: { id },
      include: { admin: { select: { status: true, emailVerified: true, passwordHash: true } } }
    }));
  }

  createAdmin(adminId: string, metadata: SessionMetadata) {
    return databaseOperation(() => this.database().adminSession.create({
      data: { adminId, ...metadata }
    }));
  }

  revokeAdmin(id: string) {
    return databaseOperation(() => this.database().adminSession.update({
      where: { id },
      data: { revokedAt: new Date() }
    }));
  }

  consumeAdmin(id: string, now: Date) {
    return databaseOperation(() => this.database().adminSession.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now }
    }));
  }

  findSuperAdminByRefreshTokenHash(refreshTokenHash: string) {
    return databaseOperation(() => this.database().superAdminSession.findUnique({
      where: { refreshTokenHash }
    }));
  }

  findSuperAdminById(id: string) {
    return databaseOperation(() => this.database().superAdminSession.findUnique({ where: { id } }));
  }

  createSuperAdmin(metadata: SessionMetadata) {
    return databaseOperation(() => this.database().superAdminSession.create({
      data: metadata
    }));
  }

  revokeSuperAdmin(id: string) {
    return databaseOperation(() => this.database().superAdminSession.update({
      where: { id },
      data: { revokedAt: new Date() }
    }));
  }

  consumeSuperAdmin(id: string, now: Date) {
    return databaseOperation(() => this.database().superAdminSession.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now }
    }));
  }
}
