import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { issueAccessToken } from "../src/auth/tokens.js";
import type { AuthConfig } from "../src/auth/config.js";
import { DatasetStorageService } from "../src/services/dataset-storage.service.js";
import type { DatasetRepository } from "../src/repositories/dataset.repository.js";
import { DatabaseNotConfiguredError, DatasetNotAnalyzedError, IncompatibleDatabaseEngineError } from "../src/database/errors.js";
import { createApp } from "../src/app.js";
import { DatabaseRouter } from "../src/database/router.js";
import { MySqlAdapter } from "../src/database/adapters/mysql.adapter.js";
import { PostgresAdapter } from "../src/database/adapters/postgres.adapter.js";
import { SqlServerAdapter } from "../src/database/adapters/sql-server.adapter.js";
import { getDatasetDatabaseConfig } from "../src/config/dataset-databases.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";
const datasetId = "33333333-3333-4333-8333-333333333333";
const config: AuthConfig = {
  NODE_ENV: "test",
  SUPER_ADMIN_EMAIL: "super@example.test",
  SUPER_ADMIN_PASSWORD_HASH: "test-hash",
  ACCESS_TOKEN_SECRET: "phase-nine-access-token-secret-that-is-32-bytes",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_DAYS: 30
};

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function dataset(overrides: Record<string, unknown> = {}) {
  return {
    id: datasetId,
    ownerAdminId: ownerId,
    selectedEngine: null,
    classification: "RELATIONAL",
    status: "ANALYZED",
    ...overrides
  };
}

function createStorageFixture(overrides: Record<string, unknown> = {}) {
  const locations: unknown[] = [];
  const repository = {
    findById: async () => dataset(overrides),
    getLocation: async () => null,
    createLocation: async (id: string, descriptor: unknown) => { locations.push({ id, descriptor }); return { id: "location-id", datasetId: id, ...(descriptor as object) }; },
    markStorageReady: async () => undefined
  } as unknown as DatasetRepository;
  const unconfigured = getDatasetDatabaseConfig({});
  const router = new DatabaseRouter({
    MYSQL: new MySqlAdapter(unconfigured.MYSQL),
    POSTGRESQL: new PostgresAdapter(unconfigured.POSTGRESQL),
    SQLSERVER: new SqlServerAdapter(unconfigured.SQLSERVER)
  });
  return { service: new DatasetStorageService({ datasets: repository, router }), locations };
}

describe("dataset storage workflow", () => {
  it("allows a compatible engine override but fails safely when unconfigured", async () => {
    const fixture = createStorageFixture();
    await expect(fixture.service.requestStorage(datasetId, "MYSQL", { role: "ADMIN", actorType: "ADMIN", actorId: ownerId })).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
    expect(fixture.locations).toHaveLength(0);
  });

  it("rejects incompatible engines and unanalyzed datasets", async () => {
    const incompatible = createStorageFixture({ classification: "GRAPH" });
    await expect(incompatible.service.requestStorage(datasetId, "MYSQL", { role: "ADMIN", actorType: "ADMIN", actorId: ownerId })).rejects.toBeInstanceOf(IncompatibleDatabaseEngineError);
    const unanalyzed = createStorageFixture({ status: "UPLOADED" });
    await expect(unanalyzed.service.requestStorage(datasetId, "POSTGRESQL", { role: "ADMIN", actorType: "ADMIN", actorId: ownerId })).rejects.toBeInstanceOf(DatasetNotAnalyzedError);
  });

  it("enforces ownership while allowing Super Admin override", async () => {
    const fixture = createStorageFixture({ ownerAdminId: otherOwnerId });
    await expect(fixture.service.requestStorage(datasetId, "POSTGRESQL", { role: "ADMIN", actorType: "ADMIN", actorId: ownerId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fixture.service.requestStorage(datasetId, "POSTGRESQL", { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null })).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
    expect(fixture.locations).toHaveLength(0);
  });
});

describe("dataset storage endpoints", () => {
  it("returns a safe unconfigured error and storage status without creating a location", async () => {
    Object.assign(process.env, {
      NODE_ENV: config.NODE_ENV,
      SUPER_ADMIN_EMAIL: config.SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD_HASH: config.SUPER_ADMIN_PASSWORD_HASH,
      ACCESS_TOKEN_SECRET: config.ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_DAYS: String(config.REFRESH_TOKEN_EXPIRES_DAYS)
    });
    const fixture = createStorageFixture({ selectedEngine: "POSTGRESQL" });
    const adminToken = await issueAccessToken({ type: "ADMIN", id: ownerId, email: "admin@example.test", role: "ADMIN" }, "session", config);
    const app = createApp(undefined, undefined, undefined, undefined, undefined, fixture.service);
    const response = await request(app).post(`/api/datasets/${datasetId}/storage`).set("Authorization", `Bearer ${adminToken}`).send({ engine: "POSTGRESQL" });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: { code: "DATABASE_NOT_CONFIGURED", message: "Selected database engine is not configured." } });
    expect(response.text).not.toMatch(/host|password|connection|string|stack/i);
    expect(fixture.locations).toHaveLength(0);
    const status = await request(app).get(`/api/datasets/${datasetId}/storage`).set("Authorization", `Bearer ${adminToken}`);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ configured: false, selectedEngine: "POSTGRESQL", locationCreated: false, location: null });
  });

  it("validates the selected engine at the API boundary", async () => {
    Object.assign(process.env, {
      NODE_ENV: config.NODE_ENV,
      SUPER_ADMIN_EMAIL: config.SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD_HASH: config.SUPER_ADMIN_PASSWORD_HASH,
      ACCESS_TOKEN_SECRET: config.ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_DAYS: String(config.REFRESH_TOKEN_EXPIRES_DAYS)
    });
    const fixture = createStorageFixture();
    const adminToken = await issueAccessToken({ type: "ADMIN", id: ownerId, email: "admin@example.test", role: "ADMIN" }, "session", config);
    const response = await request(createApp(undefined, undefined, undefined, undefined, undefined, fixture.service)).post(`/api/datasets/${datasetId}/storage`).set("Authorization", `Bearer ${adminToken}`).send({ engine: "ORACLE", storageIdentifier: "injected" });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: "VALIDATION_ERROR", message: "Invalid request." } });
    expect(fixture.locations).toHaveLength(0);
  });
});
