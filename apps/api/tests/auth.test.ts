import argon2 from "argon2";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/service.js";
import { requireSuperAdmin, createAuthenticate } from "../src/auth/middleware.js";
import type { AuthConfig } from "../src/auth/config.js";
import { AuthSessionRepository } from "../src/repositories/auth-session.repository.js";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { getSystemDatabase } from "../src/infrastructure/database/client.js";
import type { AdminRepository } from "../src/repositories/admin.repository.js";
import type { ActivityLogger } from "../src/logging/types.js";

const adminId = "11111111-1111-4111-8111-111111111111";
const superAdminEmail = "super@nexus-6.test";
const adminEmail = "admin@nexus-6.test";
const password = "correct horse battery staple";

type TestState = {
  superAdminHash: string;
  adminHash: string;
  admin: Record<string, Record<string, unknown>>;
  adminSessions: Array<Record<string, unknown>>;
  superAdminSessions: Array<Record<string, unknown>>;
  sequence: number;
};

let state: TestState;
let config: AuthConfig;
let app: express.Express;
let sessionRepository: AuthSessionRepository;

function createTestDatabase() {
  return {
    admin: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return state.admin[where.email] ?? null;
        return Object.values(state.admin).find((admin) => admin.id === where.id) ?? null;
      }
    },
    adminSession: {
      findUnique: async ({ where }: { where: { refreshTokenHash?: string; id?: string } }) => {
        const session = state.adminSessions.find((entry) => (where.refreshTokenHash ? entry.refreshTokenHash === where.refreshTokenHash : entry.id === where.id));
        return session ? { ...session, admin: state.admin[session.email as string] } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const session = {
          id: `00000000-0000-4000-8000-${String(++state.sequence).padStart(12, "0")}`,
          revokedAt: null,
          createdAt: new Date(),
          ...data,
          email: adminEmail
        };
        state.adminSessions.push(session);
        return session;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const session = state.adminSessions.find((entry) => entry.id === where.id)!;
        Object.assign(session, data);
        return session;
      },
      updateMany: async ({ where, data }: { where: { id: string; revokedAt: null; expiresAt: { gt: Date } }; data: Record<string, unknown> }) => {
        const session = state.adminSessions.find((entry) =>
          entry.id === where.id && entry.revokedAt === null && (entry.expiresAt as Date) > where.expiresAt.gt
        );
        if (!session) return { count: 0 };
        Object.assign(session, data);
        return { count: 1 };
      }
    },
    superAdminSession: {
      findUnique: async ({ where }: { where: { refreshTokenHash?: string; id?: string } }) =>
        state.superAdminSessions.find((entry) => (where.refreshTokenHash ? entry.refreshTokenHash === where.refreshTokenHash : entry.id === where.id)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const session = {
          id: `00000000-0000-4000-8000-${String(++state.sequence).padStart(12, "0")}`,
          revokedAt: null,
          createdAt: new Date(),
          ...data
        };
        state.superAdminSessions.push(session);
        return session;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const session = state.superAdminSessions.find((entry) => entry.id === where.id)!;
        Object.assign(session, data);
        return session;
      },
      updateMany: async ({ where, data }: { where: { id: string; revokedAt: null; expiresAt: { gt: Date } }; data: Record<string, unknown> }) => {
        const session = state.superAdminSessions.find((entry) =>
          entry.id === where.id && entry.revokedAt === null && (entry.expiresAt as Date) > where.expiresAt.gt
        );
        if (!session) return { count: 0 };
        Object.assign(session, data);
        return { count: 1 };
      }
    }
  };
}

function createAuthService() {
  const database = createTestDatabase();
  return new AuthService({
    admins: {
      findByEmail: async (email: string) =>
        (state.admin[email] ?? null) as Awaited<ReturnType<AdminRepository["findByEmail"]>>
    },
    sessions: new AuthSessionRepository(() => database as unknown as ReturnType<typeof getSystemDatabase>),
    config: () => config,
    logger: {
      recordLogin: async () => undefined,
      recordAudit: async () => undefined,
      recordSecurity: async () => undefined
    } as unknown as ActivityLogger
  });
}

function cookieFrom(response: request.Response): string {
  const cookie = response.headers["set-cookie"]?.[0];
  if (!cookie) throw new Error("Expected refresh cookie");
  return cookie.split(";")[0]!;
}

beforeAll(async () => {
  const [superAdminHash, adminHash] = await Promise.all([
    argon2.hash(password),
    argon2.hash(password)
  ]);
  state = {
    superAdminHash,
    adminHash,
    admin: {
      [adminEmail]: {
        id: adminId,
        email: adminEmail,
        emailVerified: true,
        status: "ACTIVE",
        passwordHash: adminHash
      },
      "unverified@nexus-6.test": {
        id: "22222222-2222-4222-8222-222222222222",
        email: "unverified@nexus-6.test",
        emailVerified: false,
        status: "ACTIVE",
        passwordHash: adminHash
      },
      "disabled@nexus-6.test": {
        id: "33333333-3333-4333-8333-333333333333",
        email: "disabled@nexus-6.test",
        emailVerified: true,
        status: "DISABLED",
        passwordHash: adminHash
      }
    },
    adminSessions: [],
    superAdminSessions: [],
    sequence: 0
  };
  config = {
    NODE_ENV: "test",
    SUPER_ADMIN_EMAIL: superAdminEmail,
    SUPER_ADMIN_PASSWORD_HASH: superAdminHash,
    ACCESS_TOKEN_SECRET: "test-access-token-secret-that-is-at-least-32-bytes",
    ACCESS_TOKEN_EXPIRES_IN: "15m",
    REFRESH_TOKEN_EXPIRES_DAYS: 30
  };
  process.env.SUPER_ADMIN_EMAIL = config.SUPER_ADMIN_EMAIL;
  process.env.SUPER_ADMIN_PASSWORD_HASH = config.SUPER_ADMIN_PASSWORD_HASH;
  process.env.ACCESS_TOKEN_SECRET = config.ACCESS_TOKEN_SECRET;
  process.env.ACCESS_TOKEN_EXPIRES_IN = config.ACCESS_TOKEN_EXPIRES_IN;
  process.env.REFRESH_TOKEN_EXPIRES_DAYS = String(config.REFRESH_TOKEN_EXPIRES_DAYS);
  const authService = createAuthService();
  sessionRepository = authService.getSessionRepository();
  app = createApp(authService);
});

afterAll(() => {
  state.adminSessions.length = 0;
  state.superAdminSessions.length = 0;
  delete process.env.SUPER_ADMIN_EMAIL;
  delete process.env.SUPER_ADMIN_PASSWORD_HASH;
  delete process.env.ACCESS_TOKEN_SECRET;
  delete process.env.ACCESS_TOKEN_EXPIRES_IN;
  delete process.env.REFRESH_TOKEN_EXPIRES_DAYS;
});

describe("authentication endpoints", () => {
  it("logs in the SUPER_ADMIN without an Admin record", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: superAdminEmail, password });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ email: superAdminEmail, role: "SUPER_ADMIN" });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(state.superAdminSessions).toHaveLength(1);
    expect(state.adminSessions).toHaveLength(0);
    expect(cookieFrom(response)).not.toContain(response.body.accessToken);
  });

  it("rejects a wrong SUPER_ADMIN password generically", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: superAdminEmail, password: "wrong" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } });
  });

  it("logs in an active, verified ADMIN", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: adminEmail, password });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ email: adminEmail, role: "ADMIN" });
    expect(state.adminSessions).toHaveLength(1);
  });

  it("rejects a wrong ADMIN password generically", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: adminEmail, password: "wrong" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } });
  });

  it.each(["unverified@nexus-6.test", "disabled@nexus-6.test", "missing@nexus-6.test"])(
    "rejects unavailable ADMIN account %s generically",
    async (email) => {
      const response = await request(app).post("/api/auth/login").send({ email, password });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } });
    }
  );

  it("rejects malformed login input", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: "not-an-email", password: "" });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: "VALIDATION_ERROR", message: "Invalid request." } });
  });

  it("returns the authenticated principal from GET /me", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: adminEmail, password });
    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ email: adminEmail, role: "ADMIN" });
  });

  it("rejects GET /me without authentication", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("rejects an expired access token", async () => {
    const previousExpiry = config.ACCESS_TOKEN_EXPIRES_IN;
    config = { ...config, ACCESS_TOKEN_EXPIRES_IN: "1s" };
    const login = await request(app).post("/api/auth/login").send({ email: adminEmail, password });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    config = { ...config, ACCESS_TOKEN_EXPIRES_IN: previousExpiry };

    expect(response.status).toBe(401);
  });

  it("rotates refresh tokens and rejects the previous token", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: superAdminEmail, password });
    const oldCookie = cookieFrom(login);
    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", oldCookie);

    expect(refresh.status).toBe(200);
    const newCookie = cookieFrom(refresh);
    expect(newCookie).not.toBe(oldCookie);
    expect((await request(app).post("/api/auth/refresh").set("Cookie", oldCookie)).status).toBe(401);
  });

  it("revokes the refresh session on logout", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: adminEmail, password });
    const cookie = cookieFrom(login);
    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);

    expect(logout.status).toBe(204);
    expect((await request(app).post("/api/auth/refresh").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`)).status).toBe(401);
  });
});

describe("authorization middleware", () => {
  function protectedApp() {
    const protectedApplication = express();
    protectedApplication.get("/super", createAuthenticate(sessionRepository), requireSuperAdmin, (_request, response) => {
      response.status(200).json({ ok: true });
    });
    protectedApplication.use(errorHandler);
    return protectedApplication;
  }

  it("denies ADMIN access to SUPER_ADMIN-only middleware", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: adminEmail, password });
    const response = await request(protectedApp()).get("/super").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(response.status).toBe(403);
  });

  it("allows SUPER_ADMIN access to SUPER_ADMIN-only middleware", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: superAdminEmail, password });
    const response = await request(protectedApp()).get("/super").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(response.status).toBe(200);
  });
});
