import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createAuthRouter } from "../src/routes/auth.routes.js";
import { AuthenticationError } from "../src/auth/errors.js";
import { detectUploadFileType } from "../src/routes/dataset.routes.js";
import { parseXmlRecords } from "../src/uploads/dataset-formats.js";
import { requireUploadConfig } from "../src/uploads/config.js";
import { sanitizeMetadata } from "../src/logging/sanitize.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { parseEnv, env } from "../src/config/env.js";
import { createApp } from "../src/app.js";

describe("Phase 12 security hardening", () => {
  it("redacts credentials, URLs, bearer tokens, and connection metadata", () => {
    expect(sanitizeMetadata({ password: "secret", host: "db.internal", url: "mysql://user:pass@db/data", authorization: "Bearer token", safe: "visible" })).toEqual({ password: "[REDACTED]", host: "[REDACTED]", url: "[REDACTED]", authorization: "[REDACTED]", safe: "visible" });
  });

  it("enforces bounded legacy upload configuration", () => {
    expect(requireUploadConfig({ MAX_UPLOAD_SIZE_MB: "0" }).MAX_UPLOAD_SIZE_MB).toBe(100);
    expect(() => requireUploadConfig({ MAX_UPLOAD_SIZE_MB: "101" })).toThrow();
  });

  it("requires an explicit non-local CORS origin in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production", API_PORT: "4000" })).toThrow("WEB_ORIGIN");
  });

  it("rejects traversal and unsafe XML entity inputs", () => {
    expect(() => detectUploadFileType("..\\secret.csv", "text/csv")).toThrow();
    expect(() => detectUploadFileType("data.csv", "application/x-msdownload")).toThrow();
    expect(() => parseXmlRecords("<!DOCTYPE data [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><data><row>&xxe;</row></data>")).toThrow();
  });

  it("rate-limits repeated login attempts", async () => {
    const authService = { login: async () => { throw new AuthenticationError("INVALID_CREDENTIALS"); }, getConfig: () => ({ NODE_ENV: "test", SUPER_ADMIN_EMAIL: "super@example.test", SUPER_ADMIN_PASSWORD_HASH: "hash", ACCESS_TOKEN_SECRET: "phase-twelve-test-secret-that-is-long-enough", ACCESS_TOKEN_EXPIRES_IN: "15m", REFRESH_TOKEN_EXPIRES_DAYS: 30 }) };
    const adminService = {};
    const app = express().use(express.json()).use("/auth", createAuthRouter(authService as never, adminService as never)).use(errorHandler);
    const responses = await Promise.all(Array.from({ length: 21 }, () => request(app).post("/auth/login").send({ email: "user@example.test", password: "wrong" })));
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
  });

  it("does not grant CORS access to an unrelated origin", async () => {
    const response = await request(createApp()).get("/api/health").set("Origin", "https://evil.example");
    expect(response.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
    expect(env.WEB_ORIGIN).not.toBe("*");
  });
});
