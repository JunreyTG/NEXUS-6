import argon2 from "argon2";
import { ConflictError, InvalidTokenError, NotFoundError } from "../errors/app-error.js";
import { AdminRepository } from "../repositories/admin.repository.js";
import { AdminTokenRepository } from "../repositories/admin-token.repository.js";
import { createRefreshToken, hashRefreshToken } from "../auth/refresh-token.js";
import { createEmailProvider } from "../email/provider.js";
import { requireEmailConfig, type EmailConfig } from "../email/config.js";
import type { EmailProvider } from "../email/provider.js";
import { LogService } from "../logging/log.service.js";
import type { ActivityLogger, LogActor } from "../logging/types.js";

export type AdminProfileInput = {
  name: string;
  email: string;
};

export type AdminPatchInput = {
  name?: string;
  email?: string;
};

export type AdminStatus = "PENDING" | "ACTIVE" | "DISABLED";

type AdminManagementDependencies = {
  admins: AdminRepository;
  tokens: AdminTokenRepository;
  emailConfig: () => EmailConfig;
  emailProvider: () => EmailProvider;
  createToken: () => string;
  now: () => Date;
  hashPassword: (password: string) => Promise<string>;
  logger: ActivityLogger;
};

function defaultDependencies(): AdminManagementDependencies {
  return {
    admins: new AdminRepository(),
    tokens: new AdminTokenRepository(),
    emailConfig: requireEmailConfig,
    emailProvider: () => createEmailProvider(requireEmailConfig()),
    createToken: createRefreshToken,
    now: () => new Date(),
    hashPassword: (password) => argon2.hash(password, { type: argon2.argon2id }),
    logger: new LogService()
  };
}

function safeAdmin(admin: Record<string, unknown>) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    emailVerified: admin.emailVerified,
    status: admin.status,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt
  };
}

export class AdminManagementService {
  private readonly dependencies: AdminManagementDependencies;

  constructor(dependencies: Partial<AdminManagementDependencies> = {}) {
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  async createAdmin(input: AdminProfileInput, actor: LogActor = { actorType: "SYSTEM" }) {
    const email = normalizeEmail(input.email);
    if (await this.dependencies.admins.findByEmail(email)) throw new ConflictError("EMAIL_ALREADY_EXISTS");
    const admin = await this.dependencies.admins.createPending({ name: input.name.trim(), email });
    await this.sendVerification(admin.id, admin.email, admin.name);
    await this.audit({ ...actor, action: "ADMIN_CREATED", resourceType: "ADMIN", resourceId: admin.id, success: true });
    return safeAdmin(admin as unknown as Record<string, unknown>);
  }

  async listAdmins() {
    return (await this.dependencies.admins.list()).map((admin) => safeAdmin(admin as unknown as Record<string, unknown>));
  }

  async getAdmin(id: string) {
    const admin = await this.dependencies.admins.findById(id);
    if (!admin) throw new NotFoundError("ADMIN_NOT_FOUND");
    return safeAdmin(admin as unknown as Record<string, unknown>);
  }

  async updateAdmin(id: string, input: AdminPatchInput, actor: LogActor = { actorType: "SYSTEM" }) {
    const existing = await this.dependencies.admins.findById(id);
    if (!existing) throw new NotFoundError("ADMIN_NOT_FOUND");

    const email = input.email === undefined ? undefined : normalizeEmail(input.email);
    const emailChanged = email !== undefined && email !== existing.email;
    if (emailChanged) {
      const duplicate = await this.dependencies.admins.findByEmail(email);
      if (duplicate && duplicate.id !== id) throw new ConflictError("EMAIL_ALREADY_EXISTS");
    }

    const updated = await this.dependencies.admins.updateProfile(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(emailChanged ? { resetAccess: true } : {})
    });

    if (emailChanged) {
      const now = this.dependencies.now();
      await this.dependencies.tokens.invalidateVerifications(id, now);
      await this.dependencies.tokens.invalidateSetups(id, now);
      await this.sendVerification(updated.id, updated.email, updated.name);
    }
    await this.audit({ ...actor, action: "ADMIN_UPDATED", resourceType: "ADMIN", resourceId: id, success: true, metadata: { emailChanged } });
    return safeAdmin(updated as unknown as Record<string, unknown>);
  }

  async updateStatus(id: string, status: AdminStatus, actor: LogActor = { actorType: "SYSTEM" }) {
    const existing = await this.dependencies.admins.findById(id);
    if (!existing) throw new NotFoundError("ADMIN_NOT_FOUND");
    const updated = await this.dependencies.admins.updateStatus(id, status);
    await this.audit({ ...actor, action: "ADMIN_STATUS_CHANGED", resourceType: "ADMIN", resourceId: id, success: true, metadata: { previousStatus: existing.status, status } });
    return safeAdmin(updated as unknown as Record<string, unknown>);
  }

  async resendVerification(id: string, actor: LogActor = { actorType: "SYSTEM" }) {
    const admin = await this.dependencies.admins.findById(id);
    if (!admin) throw new NotFoundError("ADMIN_NOT_FOUND");
    if (admin.emailVerified) throw new ConflictError("EMAIL_ALREADY_VERIFIED");
    await this.dependencies.tokens.invalidateVerifications(id, this.dependencies.now());
    await this.sendVerification(admin.id, admin.email, admin.name);
    await this.audit({ ...actor, action: "VERIFICATION_RESENT", resourceType: "ADMIN", resourceId: id, success: true });
    return { status: "verification_sent" as const };
  }

  async verifyEmail(token: string) {
    const record = await this.dependencies.tokens.findVerification(hashRefreshToken(token));
    const now = this.dependencies.now();
    if (!record || record.usedAt || record.expiresAt <= now) throw new InvalidTokenError("VERIFICATION_TOKEN_INVALID");
    const consumed = await this.dependencies.tokens.consumeVerification(record.id, now);
    if (consumed.count !== 1) throw new InvalidTokenError("VERIFICATION_TOKEN_INVALID");

    const admin = await this.dependencies.admins.markEmailVerified(record.adminId);
    const setupToken = this.dependencies.createToken();
    const config = this.dependencies.emailConfig();
    const expiresAt = new Date(now.getTime() + config.PASSWORD_SETUP_TOKEN_EXPIRES_MINUTES * 60 * 1000);
    await this.dependencies.tokens.createSetup(record.adminId, hashRefreshToken(setupToken), expiresAt);
    await this.audit({ actorType: "ADMIN", actorId: record.adminId, actorEmail: admin.email, action: "EMAIL_VERIFIED", resourceType: "ADMIN", resourceId: record.adminId, success: true });
    return { email: admin.email, setupToken };
  }

  async setPassword(token: string, password: string) {
    const record = await this.dependencies.tokens.findSetup(hashRefreshToken(token));
    const now = this.dependencies.now();
    if (!record || record.usedAt || record.expiresAt <= now || !record.admin.emailVerified || record.admin.status === "DISABLED") {
      throw new InvalidTokenError("PASSWORD_SETUP_TOKEN_INVALID");
    }
    const consumed = await this.dependencies.tokens.consumeSetup(record.id, now);
    if (consumed.count !== 1) throw new InvalidTokenError("PASSWORD_SETUP_TOKEN_INVALID");
    const passwordHash = await this.dependencies.hashPassword(password);
    const admin = await this.dependencies.admins.setPassword(record.adminId, passwordHash);
    await this.dependencies.tokens.invalidateSetups(record.adminId, now);
    await this.dependencies.tokens.invalidateVerifications(record.adminId, now);
    await this.audit({ actorType: "ADMIN", actorId: record.adminId, actorEmail: admin.email, action: "PASSWORD_SETUP", resourceType: "ADMIN", resourceId: record.adminId, success: true });
    return safeAdmin(admin as unknown as Record<string, unknown>);
  }

  private async audit(input: Parameters<ActivityLogger["recordAudit"]>[0]): Promise<void> {
    try {
      await this.dependencies.logger.recordAudit(input);
    } catch {
      // Audit failures must not expose secrets or break the primary operation.
    }
  }

  private async sendVerification(id: string, email: string, name: string): Promise<void> {
    const config = this.dependencies.emailConfig();
    const token = this.dependencies.createToken();
    const expiresAt = new Date(this.dependencies.now().getTime() + config.VERIFICATION_TOKEN_EXPIRES_HOURS * 60 * 60 * 1000);
    await this.dependencies.tokens.createVerification(id, hashRefreshToken(token), expiresAt);
    const verificationUrl = `${config.webOrigin}/verify-email?token=${encodeURIComponent(token)}`;
    await this.dependencies.emailProvider().sendVerificationEmail({ to: email, name, verificationUrl });
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
