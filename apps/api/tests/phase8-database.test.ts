import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { issueAccessToken } from "../src/auth/tokens.js";
import type { AuthConfig } from "../src/auth/config.js";
import { DatabaseNotConfiguredError, UnsupportedDatabaseEngineError } from "../src/database/errors.js";
import { ENGINE_CAPABILITIES } from "../src/database/capabilities.js";
import { DatabaseRouter } from "../src/database/router.js";
import { generateStorageIdentifier } from "../src/database/storage-naming.js";
import { DATABASE_ENGINES } from "../src/database/types.js";
import { MongoDbAdapter } from "../src/database/adapters/mongo-db.adapter.js";
import { MySqlAdapter } from "../src/database/adapters/mysql.adapter.js";
import { PostgresAdapter } from "../src/database/adapters/postgres.adapter.js";
import { CouchbaseAdapter } from "../src/database/adapters/couchbase.adapter.js";
import { Neo4jAdapter } from "../src/database/adapters/neo4j.adapter.js";
import { SqlServerAdapter } from "../src/database/adapters/sql-server.adapter.js";
import { DatasetStorageService } from "../src/services/dataset-storage.service.js";
import type { DatasetRepository } from "../src/repositories/dataset.repository.js";
import { createApp } from "../src/app.js";
import { getDatasetDatabaseConfig, getDatasetDatabaseStatuses } from "../src/config/dataset-databases.js";

const config: AuthConfig = {
  NODE_ENV: "test",
  SUPER_ADMIN_EMAIL: "super@example.test",
  SUPER_ADMIN_PASSWORD_HASH: "test-hash",
  ACCESS_TOKEN_SECRET: "phase-eight-access-token-secret-that-is-32-bytes",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_DAYS: 30
};

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Phase 8 database abstraction", () => {
  it("routes each supported engine to the correct adapter", () => {
    const router = new DatabaseRouter();
    expect(router.getAdapter("MONGODB")).toBeInstanceOf(MongoDbAdapter);
    expect(router.getAdapter("MYSQL")).toBeInstanceOf(MySqlAdapter);
    expect(router.getAdapter("POSTGRESQL")).toBeInstanceOf(PostgresAdapter);
    expect(router.getAdapter("COUCHBASE")).toBeInstanceOf(CouchbaseAdapter);
    expect(router.getAdapter("NEO4J")).toBeInstanceOf(Neo4jAdapter);
    expect(router.getAdapter("SQLSERVER")).toBeInstanceOf(SqlServerAdapter);
  });

  it("rejects unsupported engines and does not fake adapter operations", async () => {
    const router = new DatabaseRouter();
    expect(() => router.getAdapter("ORACLE")).toThrowError(UnsupportedDatabaseEngineError);
    for (const engine of DATABASE_ENGINES) await expect(router.getAdapter(engine).healthCheck()).resolves.toEqual({ engine, status: engine === "MYSQL" && getDatasetDatabaseConfig().MYSQL.configured ? "configured" : "not_configured" });
    await expect(router.getAdapter("MONGODB").createStorage({ ownerAdminId: "admin", datasetId: "dataset", storageIdentifier: "safe" })).rejects.toMatchObject({ code: "DATABASE_NOT_CONFIGURED" });
    await expect(router.getAdapter("MONGODB").createStorage({ ownerAdminId: "admin", datasetId: "dataset", storageIdentifier: "safe" })).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
  });

  it("exposes reusable capabilities and safe deterministic storage identifiers", () => {
    expect(ENGINE_CAPABILITIES.POSTGRESQL.dataModels).toEqual(["RELATIONAL"]);
    expect(ENGINE_CAPABILITIES.COUCHBASE.dataModels).toEqual(["DOCUMENT", "KEY_VALUE"]);
    const first = generateStorageIdentifier("Admin/one; DROP TABLE", "Dataset ../one");
    expect(first).toBe(generateStorageIdentifier("Admin/one; DROP TABLE", "Dataset ../one"));
    expect(first).toMatch(/^admin_[a-z0-9_]+_dataset_[a-z0-9_]+$/);
    expect(first).not.toMatch(/[;/'" ]/);
    expect(first.length).toBeLessThanOrEqual(128);
    expect(generateStorageIdentifier({ ownerAdminId: "a".repeat(300), datasetId: "b".repeat(300) }).length).toBeLessThanOrEqual(128);
  });

  it("does not create DatasetLocation after an unconfigured storage failure", async () => {
    const locations: unknown[] = [];
    const repository = {
      findById: async () => ({ id: "dataset-id", ownerAdminId: "admin-id", selectedEngine: "POSTGRESQL", status: "ANALYZED", classification: "RELATIONAL" }),
      getLocation: async () => null,
      createLocation: async (datasetId: string, descriptor: unknown) => { locations.push({ datasetId, descriptor }); }
    } as unknown as DatasetRepository;
    const service = new DatasetStorageService({ datasets: repository });
    await expect(service.createStorage("dataset-id")).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
    expect(locations).toHaveLength(0);
  });
});

describe("database status endpoint", () => {
  it("allows only SUPER_ADMIN and returns sanitized status metadata", async () => {
    Object.assign(process.env, {
      NODE_ENV: config.NODE_ENV,
      SUPER_ADMIN_EMAIL: config.SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD_HASH: config.SUPER_ADMIN_PASSWORD_HASH,
      ACCESS_TOKEN_SECRET: config.ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_DAYS: String(config.REFRESH_TOKEN_EXPIRES_DAYS)
    });
    const superToken = await issueAccessToken({ type: "SUPER_ADMIN", id: null, email: config.SUPER_ADMIN_EMAIL, role: "SUPER_ADMIN" }, "super-session", config);
    const adminToken = await issueAccessToken({ type: "ADMIN", id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test", role: "ADMIN" }, "admin-session", config);
    const app = createApp();
    const success = await request(app).get("/api/databases/status").set("Authorization", `Bearer ${superToken}`);
    expect(success.status).toBe(200);
    expect(success.body).toHaveLength(6);
    expect(success.body).toEqual(expect.arrayContaining([expect.objectContaining({ engine: "MONGODB", status: getDatasetDatabaseStatuses().MONGODB }), expect.objectContaining({ engine: "SQLSERVER", status: getDatasetDatabaseStatuses().SQLSERVER })]));
    expect(JSON.stringify(success.body)).not.toMatch(/password|connection string|hostname|\bport\b/i);
    expect((await request(app).get("/api/databases/status").set("Authorization", `Bearer ${adminToken}`)).status).toBe(403);
  });
});
