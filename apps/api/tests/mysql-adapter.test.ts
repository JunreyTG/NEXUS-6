import { describe, expect, it } from "vitest";
import { DatabaseNotConfiguredError } from "../src/database/errors.js";
import { MySqlAdapter } from "../src/database/adapters/mysql.adapter.js";

describe("MySQL adapter", () => {
  it("does not create a pool when the optional configuration is incomplete", async () => {
    const adapter = new MySqlAdapter({ port: 3306, configured: false });
    await expect(adapter.healthCheck()).resolves.toEqual({ engine: "MYSQL", status: "not_configured" });
    await expect(adapter.createStorage({ ownerAdminId: "owner", datasetId: "dataset", storageIdentifier: "safe_table" })).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
  });

  it("reports configured without leaking connection values or opening a connection", async () => {
    const adapter = new MySqlAdapter({ host: "mysql.internal", port: 3306, database: "data", user: "reader", password: "secret", configured: true });
    await expect(adapter.healthCheck()).resolves.toEqual({ engine: "MYSQL", status: "configured" });
  });
});
