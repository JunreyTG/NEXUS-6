import request from "supertest";
import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/service.js";
import type { AuthConfig } from "../src/auth/config.js";
import type { AuthSessionRepository } from "../src/repositories/auth-session.repository.js";
import { createApp } from "../src/app.js";
import { issueAccessToken } from "../src/auth/tokens.js";
import { LogService } from "../src/logging/log.service.js";
import type { ActivityLogger, LogRecordInput, PaginatedLogs } from "../src/logging/types.js";
import type { LogRepository } from "../src/repositories/log.repository.js";

const config: AuthConfig = {
  NODE_ENV: "test",
  SUPER_ADMIN_EMAIL: "super@example.test",
  SUPER_ADMIN_PASSWORD_HASH: "test-hash",
  ACCESS_TOKEN_SECRET: "log-test-access-token-secret-that-is-at-least-32-bytes",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_DAYS: 30
};

function createLogger() {
  const events = { login: [] as LogRecordInput[], audit: [] as LogRecordInput[], security: [] as LogRecordInput[] };
  const logger: ActivityLogger = {
    recordLogin: async (input) => { events.login.push(input); },
    recordAudit: async (input) => { events.audit.push(input); },
    recordSecurity: async (input) => { events.security.push(input); },
    recordDatasetActivity: async () => undefined,
    listLogin: async () => emptyPage(),
    listAudit: async () => emptyPage(),
    listSecurity: async () => emptyPage(),
    listDatasetActivity: async () => emptyPage(),
    listDatabaseActivity: async () => emptyPage()
  };
  return { logger, events };
}

function emptyPage(): PaginatedLogs {
  return { items: [], page: 1, pageSize: 25, total: 0, pageCount: 0 };
}

function createAuthService(logger: ActivityLogger): AuthService {
  const sessions = {
    createAdmin: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    createSuperAdmin: async () => ({ id: "22222222-2222-4222-8222-222222222222" })
  } as unknown as AuthSessionRepository;
  return new AuthService({
    admins: {
      findByEmail: async (email) => email === "admin@example.test" ? {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Test Admin",
        email,
        emailVerified: true,
        status: "ACTIVE",
        passwordHash: "expected-password",
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } : null
    },
    sessions,
    config: () => config,
    verifyPassword: async (hash, password) => hash === "expected-password" && password === "correct-password",
    createToken: () => "refresh-token",
    logger
  });
}

describe("activity logging", () => {
  it("records successful and failed login events without credentials", async () => {
    const { logger, events } = createLogger();
    const service = createAuthService(logger);

    await service.login({ email: "admin@example.test", password: "correct-password" }, { ipAddress: "127.0.0.1", userAgent: "test-agent" });
    await expect(service.login({ email: "admin@example.test", password: "wrong-password" }, {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(events.login).toHaveLength(2);
    expect(events.login[0]).toMatchObject({ action: "LOGIN", success: true, actorEmail: "admin@example.test", ipAddress: "127.0.0.1" });
    expect(events.login[1]).toMatchObject({ action: "LOGIN", success: false, errorCode: "INVALID_CREDENTIALS" });
    expect(JSON.stringify(events)).not.toContain("correct-password");
    expect(JSON.stringify(events)).not.toContain("wrong-password");
  });

  it("redacts secret-shaped metadata before persistence", async () => {
    let captured: LogRecordInput | undefined;
    const repository = {
      append: async (_model: string, input: LogRecordInput) => { captured = input; },
      list: async () => emptyPage()
    } as unknown as LogRepository;
    const service = new LogService(repository);

    await service.recordAudit({ actorType: "ADMIN", action: "TEST", success: true, metadata: { password: "secret", token: "token-value", nested: { apiKey: "key-value", safe: "visible" } } });

    expect(captured?.metadata).toEqual({ password: "[REDACTED]", token: "[REDACTED]", nested: { apiKey: "[REDACTED]", safe: "visible" } });
  });

  it("allows both roles to view filtered, paginated logs and exposes no mutation routes", async () => {
    let receivedQuery: Record<string, unknown> | undefined;
    const page = { items: [], page: 2, pageSize: 10, total: 21, pageCount: 3 };
    const logService = {
      listLogin: async () => page,
      listAudit: async (query: Record<string, unknown>) => { receivedQuery = query; return page; },
      listSecurity: async () => page,
      listDatasetActivity: async () => page,
      listDatabaseActivity: async () => page
    } as unknown as LogService;
    const previous = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: config.NODE_ENV,
      SUPER_ADMIN_EMAIL: config.SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD_HASH: config.SUPER_ADMIN_PASSWORD_HASH,
      ACCESS_TOKEN_SECRET: config.ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_DAYS: String(config.REFRESH_TOKEN_EXPIRES_DAYS)
    });
    try {
      const app = createApp(undefined, undefined, logService);
      const adminToken = await issueAccessToken({ type: "ADMIN", id: "33333333-3333-4333-8333-333333333333", email: "admin@example.test", role: "ADMIN" }, "admin-session", config);
      const superToken = await issueAccessToken({ type: "SUPER_ADMIN", id: null, email: config.SUPER_ADMIN_EMAIL, role: "SUPER_ADMIN" }, "super-session", config);
      const query = "page=2&pageSize=10&actor=admin%40example.test&action=LOGIN&success=false&start=2026-09-01T00%3A00%3A00.000Z&end=2026-09-30T00%3A00%3A00.000Z";

      expect((await request(app).get(`/api/logs/audit?${query}`)).status).toBe(401);
      expect((await request(app).get(`/api/logs/audit?${query}`).set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
      expect((await request(app).get("/api/logs/security").set("Authorization", `Bearer ${superToken}`)).status).toBe(200);
      expect(receivedQuery).toMatchObject({ page: 2, pageSize: 10, actor: "admin@example.test", action: "LOGIN", success: false });
      expect((await request(app).post("/api/logs/audit").set("Authorization", `Bearer ${adminToken}`).send({ action: "EDIT" })).status).toBe(404);
      expect((await request(app).delete("/api/logs/audit").set("Authorization", `Bearer ${adminToken}`)).status).toBe(404);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });

  it("routes activity categories to correct log streams with enriched metadata", async () => {
    const captured: Array<{ model: string; input: LogRecordInput }> = [];
    const repository = {
      append: async (model: string, input: LogRecordInput) => {
        captured.push({ model, input });
      },
      list: async () => emptyPage()
    } as unknown as LogRepository;

    const service = new LogService(repository);

    // Authentication -> LoginLog
    await service.logActivity({
      actorType: "ADMIN",
      actorEmail: "admin@example.test",
      category: "AUTHENTICATION",
      action: "LOGIN",
      success: true,
      description: "Successful login"
    });

    // Administration -> AuditLog
    await service.log({
      actorType: "SUPER_ADMIN",
      actorEmail: "super@example.test",
      category: "ADMINISTRATION",
      action: "ADMIN_CREATED",
      resourceType: "ADMIN",
      resourceId: "33333333-3333-4333-8333-333333333333",
      status: "SUCCESS"
    });

    // Security -> SecurityEvent
    await service.logActivity({
      actorType: "ANONYMOUS",
      category: "SECURITY",
      action: "RATE_LIMIT_EXCEEDED",
      success: false,
      errorCode: "RATE_LIMIT_EXCEEDED"
    });

    // Dataset -> DatasetActivityLog
    await service.logActivity({
      actorType: "ADMIN",
      category: "DATASET",
      action: "DATASET_CREATED",
      resourceType: "DATASET",
      datasetId: "44444444-4444-4444-8444-444444444444",
      success: true
    });

    // Database -> DatabaseActivityLog
    await service.logActivity({
      actorType: "ADMIN",
      category: "DATABASE",
      action: "STORAGE_REQUESTED",
      databaseEngine: "PostgreSQL",
      success: true
    });

    // Record -> DatasetActivityLog
    await service.logActivity({
      actorType: "ADMIN",
      category: "RECORD",
      action: "RECORD_CREATED",
      resourceType: "DATASET",
      datasetId: "44444444-4444-4444-8444-444444444444",
      success: true
    });

    // Report -> DatasetActivityLog
    await service.logActivity({
      actorType: "ADMIN",
      category: "REPORT",
      action: "REPORT_CREATED",
      resourceType: "REPORT",
      resourceId: "55555555-5555-4555-8555-555555555555",
      success: true
    });

    expect(captured).toHaveLength(7);
    expect(captured[0]?.model).toBe("loginLog");
    expect(captured[1]?.model).toBe("auditLog");
    expect(captured[2]?.model).toBe("securityEvent");
    expect(captured[3]?.model).toBe("datasetActivityLog");
    expect(captured[4]?.model).toBe("databaseActivityLog");
    expect(captured[5]?.model).toBe("datasetActivityLog");
    expect(captured[6]?.model).toBe("datasetActivityLog");
  });

  it("redacts sensitive fields including passwords, tokens, connection strings, and hashes", async () => {
    let captured: LogRecordInput | undefined;
    const repository = {
      append: async (_model: string, input: LogRecordInput) => { captured = input; },
      list: async () => emptyPage()
    } as unknown as LogRepository;

    const service = new LogService(repository);

    await service.logActivity({
      actorType: "ADMIN",
      category: "ADMINISTRATION",
      action: "CONFIG_CHANGE",
      success: true,
      metadata: {
        password: "secret-password",
        confirmPassword: "secret-password",
        refreshToken: "refresh-token-123",
        accessToken: "access-token-456",
        connectionString: "postgres://user:pass@localhost:5432/db",
        apiKey: "api-secret-key",
        databaseEngine: "PostgreSQL",
        datasetId: "uuid-visible",
        safeNote: "All operations normal"
      }
    });

    const meta = captured?.metadata as Record<string, unknown>;
    expect(meta.password).toBe("[REDACTED]");
    expect(meta.confirmPassword).toBe("[REDACTED]");
    expect(meta.refreshToken).toBe("[REDACTED]");
    expect(meta.accessToken).toBe("[REDACTED]");
    expect(meta.connectionString).toBe("[REDACTED]");
    expect(meta.apiKey).toBe("[REDACTED]");
    expect(meta.databaseEngine).toBe("PostgreSQL");
    expect(meta.datasetId).toBe("uuid-visible");
    expect(meta.safeNote).toBe("All operations normal");
  });

  it("serves unified activity logs, statistics, and stream aliases via API", async () => {
    const page = { items: [{ id: "1", action: "TEST" }], page: 1, pageSize: 25, total: 1, pageCount: 1 };
    const stats = {
      total: 10,
      success: 8,
      failure: 2,
      byCategory: { AUTHENTICATION: 5, DATASET: 5 },
      byStream: { login: 5, audit: 0, security: 0, datasetActivity: 5, databaseActivity: 0 }
    };
    const logService = {
      listAll: async () => page,
      listLogin: async () => page,
      listAudit: async () => page,
      listSecurity: async () => page,
      listDatasetActivity: async () => page,
      listDatabaseActivity: async () => page,
      getStatistics: async () => stats,
      getById: async (id: string) => (id === "11111111-1111-4111-8111-111111111111" ? { id, action: "FOUND" } : null)
    } as unknown as LogService;

    const previous = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: config.NODE_ENV,
      SUPER_ADMIN_EMAIL: config.SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD_HASH: config.SUPER_ADMIN_PASSWORD_HASH,
      ACCESS_TOKEN_SECRET: config.ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_DAYS: String(config.REFRESH_TOKEN_EXPIRES_DAYS)
    });

    try {
      const app = createApp(undefined, undefined, logService);
      const superToken = await issueAccessToken({ type: "SUPER_ADMIN", id: null, email: config.SUPER_ADMIN_EMAIL, role: "SUPER_ADMIN" }, "super-session", config);

      // GET /api/logs
      const rootRes = await request(app).get("/api/logs").set("Authorization", `Bearer ${superToken}`);
      expect(rootRes.status).toBe(200);
      expect(rootRes.body.total).toBe(1);

      // GET /api/logs/statistics
      const statsRes = await request(app).get("/api/logs/statistics").set("Authorization", `Bearer ${superToken}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.total).toBe(10);
      expect(statsRes.body.byStream.login).toBe(5);

      // GET /api/logs/activity
      const activityRes = await request(app).get("/api/logs/activity").set("Authorization", `Bearer ${superToken}`);
      expect(activityRes.status).toBe(200);

      // GET /api/logs/authentication
      const authRes = await request(app).get("/api/logs/authentication").set("Authorization", `Bearer ${superToken}`);
      expect(authRes.status).toBe(200);

      // GET /api/logs/datasets
      const datasetRes = await request(app).get("/api/logs/datasets").set("Authorization", `Bearer ${superToken}`);
      expect(datasetRes.status).toBe(200);

      // GET /api/logs/database
      const dbRes = await request(app).get("/api/logs/database").set("Authorization", `Bearer ${superToken}`);
      expect(dbRes.status).toBe(200);

      // GET /api/logs/:id found
      const foundRes = await request(app).get("/api/logs/11111111-1111-4111-8111-111111111111").set("Authorization", `Bearer ${superToken}`);
      expect(foundRes.status).toBe(200);
      expect(foundRes.body.action).toBe("FOUND");

      // GET /api/logs/:id not found
      const notFoundRes = await request(app).get("/api/logs/22222222-2222-4222-8222-222222222222").set("Authorization", `Bearer ${superToken}`);
      expect(notFoundRes.status).toBe(404);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });
});

