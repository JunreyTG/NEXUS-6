import argon2 from "argon2";
import { AdminRepository } from "../repositories/admin.repository.js";
import { AuthSessionRepository, type SessionMetadata } from "../repositories/auth-session.repository.js";
import { requireAuthConfig, type AuthConfig } from "./config.js";
import { AuthenticationError } from "./errors.js";
import { createRefreshToken, hashRefreshToken, refreshExpiry } from "./refresh-token.js";
import { issueAccessToken } from "./tokens.js";
import type { AuthenticatedPrincipal, SafeUser } from "./types.js";
import { LogService } from "../logging/log.service.js";
import type { ActivityLogger } from "../logging/types.js";

const INVALID_CREDENTIALS = "INVALID_CREDENTIALS";

export type LoginInput = {
  email: string;
  password: string;
};

export type SessionRequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

export type AuthenticationResult = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: SafeUser;
};

type AuthServiceDependencies = {
  admins: Pick<AdminRepository, "findByEmail">;
  sessions: AuthSessionRepository;
  config: () => AuthConfig;
  verifyPassword: (hash: string, password: string) => Promise<boolean>;
  createToken: () => string;
  now: () => Date;
  logger: ActivityLogger;
};

function defaultDependencies(): AuthServiceDependencies {
  return {
    admins: new AdminRepository(),
    sessions: new AuthSessionRepository(),
    config: requireAuthConfig,
    verifyPassword: (hash, password) => argon2.verify(hash, password).catch(() => false),
    createToken: createRefreshToken,
    now: () => new Date(),
    logger: new LogService()
  };
}

function invalidCredentials(): never {
  throw new AuthenticationError(INVALID_CREDENTIALS);
}

function safeUser(principal: AuthenticatedPrincipal): SafeUser {
  return { email: principal.email, role: principal.role };
}

async function safeLog(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Logging failure must never interrupt authentication.
  }
}

function sessionMetadata(token: string, expiresAt: Date, metadata: SessionRequestMetadata): SessionMetadata {
  return {
    refreshTokenHash: hashRefreshToken(token),
    expiresAt,
    ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
    ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {})
  };
}

export class AuthService {
  private readonly dependencies: AuthServiceDependencies;

  constructor(dependencies: Partial<AuthServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  getConfig(): AuthConfig {
    return this.dependencies.config();
  }

  async login(input: LoginInput, metadata: SessionRequestMetadata): Promise<AuthenticationResult> {
    const config = this.dependencies.config();
    const email = input.email.trim().toLowerCase();

    if (email === config.SUPER_ADMIN_EMAIL) {
      const valid = await this.dependencies.verifyPassword(config.SUPER_ADMIN_PASSWORD_HASH, input.password);
      if (!valid) {
        await safeLog(() => this.dependencies.logger.recordLogin({ actorType: "SUPER_ADMIN", actorEmail: email, ...metadata, action: "LOGIN", success: false, errorCode: INVALID_CREDENTIALS }));
        invalidCredentials();
      }
      const result = await this.createSession({ type: "SUPER_ADMIN", id: null, email, role: "SUPER_ADMIN" }, config, metadata);
      await safeLog(() => this.dependencies.logger.recordLogin({ actorType: "SUPER_ADMIN", actorEmail: email, ...metadata, action: "LOGIN", success: true }));
      return result;
    }

    const admin = await this.dependencies.admins.findByEmail(email);
    if (!admin || !admin.emailVerified || admin.status !== "ACTIVE" || !admin.passwordHash) {
      await safeLog(() => this.dependencies.logger.recordLogin({
        actorType: "ADMIN",
        ...(admin?.id ? { actorId: admin.id } : {}),
        actorEmail: email,
        ...metadata,
        action: "LOGIN",
        success: false,
        errorCode: INVALID_CREDENTIALS
      }));
      invalidCredentials();
    }
    if (!(await this.dependencies.verifyPassword(admin.passwordHash, input.password))) {
      await safeLog(() => this.dependencies.logger.recordLogin({ actorType: "ADMIN", actorId: admin.id, actorEmail: email, ...metadata, action: "LOGIN", success: false, errorCode: INVALID_CREDENTIALS }));
      invalidCredentials();
    }

    const result = await this.createSession({ type: "ADMIN", id: admin.id, email: admin.email, role: "ADMIN" }, config, metadata);
    await safeLog(() => this.dependencies.logger.recordLogin({ actorType: "ADMIN", actorId: admin.id, actorEmail: admin.email, ...metadata, action: "LOGIN", success: true }));
    return result;
  }

  async refresh(refreshToken: string | undefined, metadata: SessionRequestMetadata): Promise<AuthenticationResult> {
    const config = this.dependencies.config();
    if (!refreshToken) {
      await safeLog(() => this.dependencies.logger.recordSecurity({ actorType: "ANONYMOUS", ...metadata, action: "REFRESH_TOKEN_INVALID", success: false, errorCode: "AUTHENTICATION_REQUIRED" }));
      throw new AuthenticationError();
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const now = this.dependencies.now();
    const adminSession = await this.dependencies.sessions.findAdminByRefreshTokenHash(tokenHash);
    if (adminSession) {
      if (
        adminSession.revokedAt ||
        adminSession.expiresAt <= now ||
        !adminSession.admin.emailVerified ||
        adminSession.admin.status !== "ACTIVE" ||
        !adminSession.admin.passwordHash
      ) {
        await this.dependencies.sessions.revokeAdmin(adminSession.id);
        await safeLog(() => this.dependencies.logger.recordSecurity({ actorType: "ADMIN", actorId: adminSession.admin.id, actorEmail: adminSession.admin.email, ...metadata, action: adminSession.revokedAt ? "REFRESH_TOKEN_REUSE" : "REFRESH_TOKEN_REVOKED", success: false, errorCode: "REFRESH_SESSION_INVALID" }));
        throw new AuthenticationError();
      }
      const consumed = await this.dependencies.sessions.consumeAdmin(adminSession.id, now);
      if (consumed.count !== 1) {
        await safeLog(() => this.dependencies.logger.recordSecurity({ actorType: "ADMIN", actorId: adminSession.admin.id, actorEmail: adminSession.admin.email, ...metadata, action: "REFRESH_TOKEN_REUSE", success: false, errorCode: "REFRESH_TOKEN_REUSED" }));
        throw new AuthenticationError();
      }
      return this.createSession(
        { type: "ADMIN", id: adminSession.admin.id, email: adminSession.admin.email, role: "ADMIN" },
        config,
        metadata
      );
    }

    const superAdminSession = await this.dependencies.sessions.findSuperAdminByRefreshTokenHash(tokenHash);
    if (
      !superAdminSession ||
      superAdminSession.revokedAt ||
      superAdminSession.expiresAt <= now
    ) {
      await safeLog(() => this.dependencies.logger.recordSecurity({ actorType: "SUPER_ADMIN", actorEmail: config.SUPER_ADMIN_EMAIL, ...metadata, action: superAdminSession?.revokedAt ? "REFRESH_TOKEN_REUSE" : "REFRESH_TOKEN_REVOKED", success: false, errorCode: "REFRESH_SESSION_INVALID" }));
      throw new AuthenticationError();
    }

    const consumed = await this.dependencies.sessions.consumeSuperAdmin(superAdminSession.id, now);
    if (consumed.count !== 1) {
      await safeLog(() => this.dependencies.logger.recordSecurity({ actorType: "SUPER_ADMIN", actorEmail: config.SUPER_ADMIN_EMAIL, ...metadata, action: "REFRESH_TOKEN_REUSE", success: false, errorCode: "REFRESH_TOKEN_REUSED" }));
      throw new AuthenticationError();
    }
    return this.createSession(
      { type: "SUPER_ADMIN", id: null, email: config.SUPER_ADMIN_EMAIL, role: "SUPER_ADMIN" },
      config,
      metadata
    );
  }

  async logout(refreshToken: string | undefined, metadata: SessionRequestMetadata = {}): Promise<void> {
    if (!refreshToken) {
      await safeLog(() => this.dependencies.logger.recordAudit({ actorType: "ANONYMOUS", ...metadata, action: "LOGOUT", success: true }));
      return;
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const adminSession = await this.dependencies.sessions.findAdminByRefreshTokenHash(tokenHash);
    if (adminSession) {
      await this.dependencies.sessions.revokeAdmin(adminSession.id);
      await safeLog(() => this.dependencies.logger.recordAudit({ actorType: "ADMIN", actorId: adminSession.admin.id, actorEmail: adminSession.admin.email, ...metadata, action: "LOGOUT", success: true }));
      return;
    }
    const superAdminSession = await this.dependencies.sessions.findSuperAdminByRefreshTokenHash(tokenHash);
    if (superAdminSession) {
      const config = this.dependencies.config();
      await this.dependencies.sessions.revokeSuperAdmin(superAdminSession.id);
      await safeLog(() => this.dependencies.logger.recordAudit({ actorType: "SUPER_ADMIN", actorEmail: config.SUPER_ADMIN_EMAIL, ...metadata, action: "LOGOUT", success: true }));
      return;
    }
    await safeLog(() => this.dependencies.logger.recordSecurity({ actorType: "ANONYMOUS", ...metadata, action: "REFRESH_TOKEN_INVALID", success: false, errorCode: "REFRESH_TOKEN_INVALID" }));
  }

  private async createSession(
    principal: AuthenticatedPrincipal,
    config: AuthConfig,
    metadata: SessionRequestMetadata
  ): Promise<AuthenticationResult> {
    const refreshToken = this.dependencies.createToken();
    const refreshExpiresAt = refreshExpiry(config, this.dependencies.now());
    const session = principal.role === "ADMIN"
      ? await this.dependencies.sessions.createAdmin(principal.id!, sessionMetadata(refreshToken, refreshExpiresAt, metadata))
      : await this.dependencies.sessions.createSuperAdmin(sessionMetadata(refreshToken, refreshExpiresAt, metadata));
    const accessToken = await issueAccessToken(principal, session.id, config);
    return { accessToken, refreshToken, refreshExpiresAt, user: safeUser(principal) };
  }
}
