import type { PrismaClient } from "../generated/prisma/client.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";
import { databaseOperation, databaseWriteOperation } from "../errors/database-error.js";

export class AdminRepository {
  constructor(private readonly database: () => Pick<PrismaClient, "admin"> = getSystemDatabase) {}

  findById(id: string) {
    return databaseOperation(() => this.database().admin.findUnique({ where: { id } }));
  }

  findByEmail(email: string) {
    return databaseOperation(() => this.database().admin.findUnique({ where: { email } }));
  }

  createPending(data: { name: string; email: string }) {
    return databaseWriteOperation(() => this.database().admin.create({
      data: {
        ...data,
        passwordHash: null,
        emailVerified: false,
        status: "PENDING"
      }
    }));
  }

  list() {
    return databaseOperation(() => this.database().admin.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    }));
  }

  updateProfile(id: string, data: { name?: string; email?: string; resetAccess?: boolean }) {
    const update = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.resetAccess ? { passwordHash: null, emailVerified: false, status: "PENDING" as const } : {})
    };
    return databaseWriteOperation(() => this.database().admin.update({ where: { id }, data: update }));
  }

  updateStatus(id: string, status: "PENDING" | "ACTIVE" | "DISABLED") {
    return databaseWriteOperation(() => this.database().admin.update({ where: { id }, data: { status } }));
  }

  markEmailVerified(id: string) {
    return databaseWriteOperation(() => this.database().admin.update({
      where: { id },
      data: { emailVerified: true }
    }));
  }

  setPassword(id: string, passwordHash: string) {
    return databaseWriteOperation(() => this.database().admin.update({
      where: { id },
      data: { passwordHash, status: "ACTIVE" }
    }));
  }

  delete(id: string) {
    return databaseWriteOperation(async () => {
      const db = this.database() as any;
      if (typeof db.$transaction === "function") {
        return db.$transaction(async (tx: any) => {
          if (tx.adminSession) await tx.adminSession.deleteMany({ where: { adminId: id } });
          if (tx.emailVerificationToken) await tx.emailVerificationToken.deleteMany({ where: { adminId: id } });
          if (tx.passwordResetToken) await tx.passwordResetToken.deleteMany({ where: { adminId: id } });
          if (tx.adminPasswordSetupToken) await tx.adminPasswordSetupToken.deleteMany({ where: { adminId: id } });
          if (tx.report) await tx.report.deleteMany({ where: { ownerAdminId: id } });
          if (tx.dataset) await tx.dataset.updateMany({ where: { ownerAdminId: id }, data: { ownerAdminId: null } });
          return tx.admin.delete({ where: { id } });
        });
      }
      return db.admin.delete({ where: { id } });
    });
  }
}
