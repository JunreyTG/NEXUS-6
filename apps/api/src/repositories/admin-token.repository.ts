import type { PrismaClient } from "../generated/prisma/client.js";
import { databaseOperation } from "../errors/database-error.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";

type AdminTokenDatabase = Pick<PrismaClient, "emailVerificationToken" | "adminPasswordSetupToken">;

export class AdminTokenRepository {
  constructor(private readonly database: () => AdminTokenDatabase = getSystemDatabase) {}

  createVerification(adminId: string, tokenHash: string, expiresAt: Date) {
    return databaseOperation(() => this.database().emailVerificationToken.create({
      data: { adminId, tokenHash, expiresAt }
    }));
  }

  findVerification(tokenHash: string) {
    return databaseOperation(() => this.database().emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { admin: true }
    }));
  }

  consumeVerification(id: string, now: Date) {
    return databaseOperation(() => this.database().emailVerificationToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    }));
  }

  invalidateVerifications(adminId: string, now: Date) {
    return databaseOperation(() => this.database().emailVerificationToken.updateMany({
      where: { adminId, usedAt: null },
      data: { usedAt: now }
    }));
  }

  createSetup(adminId: string, tokenHash: string, expiresAt: Date) {
    return databaseOperation(() => this.database().adminPasswordSetupToken.create({
      data: { adminId, tokenHash, expiresAt }
    }));
  }

  findSetup(tokenHash: string) {
    return databaseOperation(() => this.database().adminPasswordSetupToken.findUnique({
      where: { tokenHash },
      include: { admin: true }
    }));
  }

  consumeSetup(id: string, now: Date) {
    return databaseOperation(() => this.database().adminPasswordSetupToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    }));
  }

  invalidateSetups(adminId: string, now: Date) {
    return databaseOperation(() => this.database().adminPasswordSetupToken.updateMany({
      where: { adminId, usedAt: null },
      data: { usedAt: now }
    }));
  }
}
