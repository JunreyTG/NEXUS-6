import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnv, requireSystemDatabaseUrl } from "../src/config/env.js";
import { AppError } from "../src/errors/app-error.js";
import { DatabaseError, databaseOperation } from "../src/errors/database-error.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { checkDatabaseHealth } from "../src/services/database-health.service.js";
import { getSystemDatabase } from "../src/infrastructure/database/client.js";

vi.mock("../src/infrastructure/database/client.js", () => ({ getSystemDatabase: vi.fn() }));

afterEach(() => vi.resetAllMocks());

const secret = "postgresql://user:private-password@private-host/db?token=private-token";

describe("environment validation", () => {
  it("allows the API to start without database configuration", () => {
    expect(parseEnv({})).toEqual({ NODE_ENV: "development", API_PORT: 4000, WEB_ORIGIN: "http://localhost:8080" });
  });
  it.each([undefined, "", " ", "invalid", "https://example.com/db", "postgresql:///db"])("rejects invalid runtime URLs without echoing input", (value) => {
    const source = value === undefined ? {} : { SYSTEM_DATABASE_URL: value };
    expect(() => requireSystemDatabaseUrl(source)).toThrow("SYSTEM_DATABASE_URL must be configured with a valid PostgreSQL URL.");
  });
  it("keeps direct and runtime URLs separate", () => {
    const source = { SYSTEM_DATABASE_URL: secret, SYSTEM_DATABASE_DIRECT_URL: "postgresql://direct.example/system" };
    expect(requireSystemDatabaseUrl(source)).toBe(secret);
    expect(requireSystemDatabaseUrl(source, "SYSTEM_DATABASE_DIRECT_URL")).toBe(source.SYSTEM_DATABASE_DIRECT_URL);
    expect(() => requireSystemDatabaseUrl({ SYSTEM_DATABASE_URL: secret }, "SYSTEM_DATABASE_DIRECT_URL")).toThrow("SYSTEM_DATABASE_DIRECT_URL");
  });
  it("does not disclose invalid environment values", () => {
    expect(() => parseEnv({ NODE_ENV: secret })).toThrow("Invalid application environment configuration.");
  });
});

describe("database health service", () => {
  it("returns success after the probe resolves", async () => {
    const probe = vi.fn().mockResolvedValue([{ value: 1 }]);
    await expect(checkDatabaseHealth(probe)).resolves.toEqual({ status: "ok", database: "system" });
    expect(probe).toHaveBeenCalledOnce();
  });
  it("only executes SELECT 1", async () => {
    const query = vi.fn().mockResolvedValue([{ value: 1 }]);
    vi.mocked(getSystemDatabase).mockReturnValue({ $queryRaw: query } as unknown as ReturnType<typeof getSystemDatabase>);
    await checkDatabaseHealth();
    expect(query.mock.calls[0]?.[0]).toEqual(["SELECT 1"]);
  });
  it("discards credentials, cause, and stack from the driver error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await checkDatabaseHealth(() => Promise.reject(new Error(secret)));
      expect.fail("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseError);
      expect(String(error)).not.toContain(secret);
      expect((error as Error).cause).toBeUndefined();
    }
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("database endpoint and safe failures", () => {
  it("returns the exact success contract", async () => {
    vi.mocked(getSystemDatabase).mockReturnValue({ $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof getSystemDatabase>);
    const response = await request(createApp()).get("/api/health/database");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "system" });
  });
  it("returns safe 503 while general health remains available", async () => {
    vi.mocked(getSystemDatabase).mockImplementation(() => { throw new Error(secret); });
    const app = createApp();
    const response = await request(app).get("/api/health/database");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "error", database: "system" });
    expect(response.text).not.toMatch(/private-|postgresql|stack|password/);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });
  it("sanitizes repository failures through the central handler", async () => {
    const app = express();
    app.get("/", (_req, _res, next) => {
      void databaseOperation(() => Promise.reject(new Error(secret))).catch(next);
    });
    app.use(errorHandler);
    const response = await request(app).get("/");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: { code: "SYSTEM_DATABASE_UNAVAILABLE", message: "System database unavailable." } });
  });
  it("does not expose internal AppError messages", async () => {
    const app = express();
    app.get("/", (_req, _res, next) => next(new AppError(secret)));
    app.use(errorHandler);
    const response = await request(app).get("/");
    expect(response.status).toBe(500);
    expect(response.text).not.toContain(secret);
  });
});
