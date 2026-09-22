import { describe, expect, it } from "vitest";
import { DatabaseNotConfiguredError } from "../src/database/errors.js";
import { PostgresAdapter } from "../src/database/adapters/postgres.adapter.js";

describe("PostgreSQL adapter", () => {
  it("does not create a pool when the optional configuration is incomplete", async () => {
    const adapter = new PostgresAdapter({ port: 5432, ssl: true, configured: false });
    await expect(adapter.healthCheck()).resolves.toEqual({ engine: "POSTGRESQL", status: "not_configured" });
    await expect(adapter.createStorage({ ownerAdminId: "owner", datasetId: "dataset", storageIdentifier: "safe_table" })).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
  });

  it("reports configured without leaking connection values or opening a connection", async () => {
    const adapter = new PostgresAdapter({ host: "postgres.internal", port: 5432, database: "data", user: "reader", password: "secret", ssl: true, configured: true });
    await expect(adapter.healthCheck()).resolves.toEqual({ engine: "POSTGRESQL", status: "configured" });
  });
});
