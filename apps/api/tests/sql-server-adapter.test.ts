import { describe, expect, it } from "vitest";
import { DatabaseNotConfiguredError } from "../src/database/errors.js";
import { SqlServerAdapter } from "../src/database/adapters/sql-server.adapter.js";

describe("SQL Server adapter", () => {
  it("does not open a connection when the optional configuration is incomplete", async () => {
    const adapter = new SqlServerAdapter({ port: 1433, encrypt: true, trustServerCertificate: false, configured: false });
    await expect(adapter.healthCheck()).resolves.toEqual({ engine: "SQLSERVER", status: "not_configured" });
    await expect(adapter.createStorage({ ownerAdminId: "owner", datasetId: "dataset", storageIdentifier: "safe_table" })).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
  });

  it("reports configured without leaking connection values or opening a connection", async () => {
    const adapter = new SqlServerAdapter({ host: "sqlserver.internal", port: 1433, database: "data", user: "reader", password: "secret", encrypt: true, trustServerCertificate: false, configured: true });
    await expect(adapter.healthCheck()).resolves.toEqual({ engine: "SQLSERVER", status: "configured" });
  });
});
