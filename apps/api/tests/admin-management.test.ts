import argon2 from "argon2";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { EmailConfig } from "../src/email/config.js";
import type { EmailProvider } from "../src/email/provider.js";
import { AdminManagementService } from "../src/services/admin-management.service.js";
import type { AdminRepository } from "../src/repositories/admin.repository.js";
import type { AdminTokenRepository } from "../src/repositories/admin-token.repository.js";
import { createApp } from "../src/app.js";
import { issueAccessToken } from "../src/auth/tokens.js";
import type { AuthConfig } from "../src/auth/config.js";
import type { ActivityLogger, LogRecordInput, PaginatedLogs } from "../src/logging/types.js";

type TestAdmin = {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  emailVerified: boolean;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const now = new Date("2026-09-22T12:00:00.000Z");

function createFixture() {
  const admins = new Map<string, TestAdmin>();
  const verifications = new Map<string, { id: string; adminId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>();
  const setups = new Map<string, { id: string; adminId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>();
  const emails: string[] = [];
  const auditEvents: LogRecordInput[] = [];
  let sequence = 0;
  const config: EmailConfig = {
    EMAIL_PROVIDER: "console",
    EMAIL_FROM: "NEXUS-6 <noreply@example.test>",
    VERIFICATION_TOKEN_EXPIRES_HOURS: 24,
    PASSWORD_SETUP_TOKEN_EXPIRES_MINUTES: 30,
    webOrigin: "http://localhost:8080",
    nodeEnv: "test"
  };

  const adminRepository = {
    findById: async (id: string) => admins.get(id) ?? null,
    findByEmail: async (email: string) => [...admins.values()].find((admin) => admin.email === email) ?? null,
    createPending: async ({ name, email }: { name: string; email: string }) => {
      const admin: TestAdmin = {
        id: `admin-${++sequence}`,
        name,
        email,
        passwordHash: null,
        emailVerified: false,
        status: "PENDING",
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now
      };
      admins.set(admin.id, admin);
      return admin;
    },
    list: async () => [...admins.values()],
    updateProfile: async (id: string, data: { name?: string; email?: string; resetAccess?: boolean }) => {
      const admin = admins.get(id)!;
      if (data.name !== undefined) admin.name = data.name;
      if (data.email !== undefined) admin.email = data.email;
      if (data.resetAccess) {
        admin.passwordHash = null;
        admin.emailVerified = false;
        admin.status = "PENDING";
      }
      return admin;
    },
    updateStatus: async (id: string, status: TestAdmin["status"]) => {
      const admin = admins.get(id)!;
      admin.status = status;
      return admin;
    },
    markEmailVerified: async (id: string) => {
      const admin = admins.get(id)!;
      admin.emailVerified = true;
      return admin;
    },
    setPassword: async (id: string, passwordHash: string) => {
      const admin = admins.get(id)!;
      admin.passwordHash = passwordHash;
      admin.status = "ACTIVE";
      return admin;
    }
  } as unknown as AdminRepository;

  const tokenRepository = {
    createVerification: async (adminId: string, tokenHash: string, expiresAt: Date) => {
      const record = { id: `verification-${++sequence}`, adminId, tokenHash, expiresAt, usedAt: null };
      verifications.set(tokenHash, record);
      return record;
    },
    findVerification: async (tokenHash: string) => {
      const record = verifications.get(tokenHash);
      return record ? { ...record, admin: admins.get(record.adminId) } : null;
    },
    consumeVerification: async (id: string, consumedAt: Date) => {
      const record = [...verifications.values()].find((entry) => entry.id === id);
      if (!record || record.usedAt || record.expiresAt <= consumedAt) return { count: 0 };
      record.usedAt = consumedAt;
      return { count: 1 };
    },
    invalidateVerifications: async (adminId: string, usedAt: Date) => {
      for (const record of verifications.values()) if (record.adminId === adminId && !record.usedAt) record.usedAt = usedAt;
      return { count: 1 };
    },
    createSetup: async (adminId: string, tokenHash: string, expiresAt: Date) => {
      const record = { id: `setup-${++sequence}`, adminId, tokenHash, expiresAt, usedAt: null };
      setups.set(tokenHash, record);
      return record;
    },
    findSetup: async (tokenHash: string) => {
      const record = setups.get(tokenHash);
      return record ? { ...record, admin: admins.get(record.adminId) } : null;
    },
    consumeSetup: async (id: string, consumedAt: Date) => {
      const record = [...setups.values()].find((entry) => entry.id === id);
      if (!record || record.usedAt || record.expiresAt <= consumedAt) return { count: 0 };
      record.usedAt = consumedAt;
      return { count: 1 };
    },
    invalidateSetups: async (adminId: string, usedAt: Date) => {
      for (const record of setups.values()) if (record.adminId === adminId && !record.usedAt) record.usedAt = usedAt;
      return { count: 1 };
    }
  } as unknown as AdminTokenRepository;

  const emailProvider: EmailProvider = {
    sendVerificationEmail: async ({ verificationUrl }) => { emails.push(verificationUrl); },
    sendPasswordResetEmail: async () => undefined
  };
  const logger: ActivityLogger = {
    recordLogin: async () => undefined,
    recordAudit: async (input) => { auditEvents.push(input); },
    recordSecurity: async () => undefined,
    recordDatasetActivity: async () => undefined,
    listLogin: async () => emptyPage(),
    listAudit: async () => emptyPage(),
    listSecurity: async () => emptyPage(),
    listDatasetActivity: async () => emptyPage(),
    listDatabaseActivity: async () => emptyPage()
  };

  const service = new AdminManagementService({
    admins: adminRepository,
    tokens: tokenRepository,
    emailConfig: () => config,
    emailProvider: () => emailProvider,
    logger,
    createToken: () => `token-${++sequence}`,
    now: () => now,
    hashPassword: (password) => argon2.hash(password, { type: argon2.argon2id })
  });

  return { service, admins, verifications, setups, emails, auditEvents };
}

function emptyPage(): PaginatedLogs {
  return { items: [], page: 1, pageSize: 25, total: 0, pageCount: 0 };
}

describe("admin management", () => {
  it("creates a pending admin and sends verification email", async () => {
    const fixture = createFixture();
    const result = await fixture.service.createAdmin({ name: "New Admin", email: "NEW@EXAMPLE.TEST" });

    expect(result).toMatchObject({ name: "New Admin", email: "new@example.test", status: "PENDING", emailVerified: false });
    expect(fixture.emails).toHaveLength(1);
    expect(fixture.verifications.size).toBe(1);
    expect(fixture.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ action: "ADMIN_CREATED", success: true })]));
    expect([...fixture.verifications.keys()][0]).not.toContain("token-");
  });

  it("rejects duplicate emails safely", async () => {
    const fixture = createFixture();
    await fixture.service.createAdmin({ name: "First", email: "admin@example.test" });

    await expect(fixture.service.createAdmin({ name: "Second", email: "ADMIN@example.test" }))
      .rejects.toMatchObject({ code: "EMAIL_ALREADY_EXISTS", statusCode: 409 });
  });

  it("updates name and resets access when email changes", async () => {
    const fixture = createFixture();
    const created = await fixture.service.createAdmin({ name: "Original", email: "admin@example.test" });
    const updated = await fixture.service.updateAdmin(created.id as string, { name: "Updated", email: "new@example.test" });

    expect(updated).toMatchObject({ name: "Updated", email: "new@example.test", status: "PENDING", emailVerified: false });
    expect(fixture.emails).toHaveLength(2);
  });

  it("verifies an email and allows one password setup", async () => {
    const fixture = createFixture();
    await fixture.service.createAdmin({ name: "Admin", email: "admin@example.test" });
    const verificationUrl = fixture.emails[0]!;
    const token = new URL(verificationUrl).searchParams.get("token")!;
    const verified = await fixture.service.verifyEmail(token);
    const setup = await fixture.service.setPassword(verified.setupToken, "a sufficiently strong password");

    expect(verified.email).toBe("admin@example.test");
    expect(setup.status).toBe("ACTIVE");
    expect(fixture.admins.get(setup.id as string)?.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(fixture.service.setPassword(verified.setupToken, "another sufficiently strong password"))
      .rejects.toMatchObject({ code: "PASSWORD_SETUP_TOKEN_INVALID" });
  });

  it("rejects expired verification tokens", async () => {
    const fixture = createFixture();
    await fixture.service.createAdmin({ name: "Admin", email: "admin@example.test" });
    const token = new URL(fixture.emails[0]!).searchParams.get("token")!;
    const record = [...fixture.verifications.values()][0]!;
    record.expiresAt = new Date(now.getTime() - 1);

    await expect(fixture.service.verifyEmail(token)).rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
  });

  it("resends verification and supports disabling an admin", async () => {
    const fixture = createFixture();
    const created = await fixture.service.createAdmin({ name: "Admin", email: "admin@example.test" });
    await fixture.service.resendVerification(created.id as string);
    const disabled = await fixture.service.updateStatus(created.id as string, "DISABLED");

    expect(fixture.emails).toHaveLength(2);
    expect(disabled.status).toBe("DISABLED");
    expect(fixture.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ action: "ADMIN_STATUS_CHANGED", success: true })]));
  });

  it("rejects weak password setup input at the API boundary", async () => {
    const fixture = createFixture();
    const response = await request(createApp(undefined, fixture.service))
      .post("/api/auth/set-password")
      .send({ token: "token", password: "short", passwordConfirmation: "short" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: "VALIDATION_ERROR", message: "Invalid request." } });
  });

  it("allows only a Super Admin to use Admin management routes", async () => {
    const fixture = createFixture();
    const config: AuthConfig = {
      NODE_ENV: "test",
      SUPER_ADMIN_EMAIL: "super@example.test",
      SUPER_ADMIN_PASSWORD_HASH: "test-hash",
      ACCESS_TOKEN_SECRET: "test-access-token-secret-that-is-at-least-32-bytes",
      ACCESS_TOKEN_EXPIRES_IN: "15m",
      REFRESH_TOKEN_EXPIRES_DAYS: 30
    };
    const previous = { ...process.env };
    Object.assign(process.env, config);
    try {
      const app = createApp(undefined, fixture.service);
      const adminToken = await issueAccessToken({ type: "ADMIN", id: "admin-id", email: "admin@example.test", role: "ADMIN" }, "session", config);
      const superToken = await issueAccessToken({ type: "SUPER_ADMIN", id: null, email: config.SUPER_ADMIN_EMAIL, role: "SUPER_ADMIN" }, "session", config);

      expect((await request(app).get("/api/admins")).status).toBe(401);
      expect((await request(app).get("/api/admins").set("Authorization", `Bearer ${adminToken}`)).status).toBe(403);
      expect((await request(app).post("/api/admins").set("Authorization", `Bearer ${superToken}`).send({ name: "Admin", email: "admin@example.test" })).status).toBe(201);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });
});
