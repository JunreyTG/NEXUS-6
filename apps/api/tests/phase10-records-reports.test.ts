import { describe, expect, it } from "vitest";
import { DatabaseNotConfiguredError } from "../src/database/errors.js";
import { DatasetRecordService } from "../src/services/dataset-record.service.js";
import { ReportService } from "../src/services/report.service.js";
import type { DatasetRepository } from "../src/repositories/dataset.repository.js";
import type { ReportRepository } from "../src/repositories/report.repository.js";
import type { ActivityLogger, LogRecordInput, PaginatedLogs } from "../src/logging/types.js";
import { recordsQuerySchema } from "../src/routes/dataset.routes.js";
import { reportCreateSchema } from "../src/reports/schema.js";
import { DatabaseRouter } from "../src/database/router.js";
import { PostgresAdapter } from "../src/database/adapters/postgres.adapter.js";
import { getDatasetDatabaseConfig } from "../src/config/dataset-databases.js";

function unconfiguredPostgresRouter(): DatabaseRouter {
  return new DatabaseRouter({ POSTGRESQL: new PostgresAdapter(getDatasetDatabaseConfig({}).POSTGRESQL) });
}

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";
const datasetId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";

const admin = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };
const otherAdmin = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: otherOwnerId, actorEmail: "other@example.test" };
const superAdmin = { role: "SUPER_ADMIN" as const, actorType: "SUPER_ADMIN" as const, actorId: null, actorEmail: "super@example.test" };

function emptyLogs(): PaginatedLogs { return { items: [], page: 1, pageSize: 25, total: 0, pageCount: 0 }; }
function logger(events: LogRecordInput[]): ActivityLogger {
  return {
    recordLogin: async () => undefined,
    recordAudit: async () => undefined,
    recordSecurity: async () => undefined,
    recordDatasetActivity: async (input) => { events.push(input); },
    listLogin: async () => emptyLogs(),
    listAudit: async () => emptyLogs(),
    listSecurity: async () => emptyLogs(),
    listDatasetActivity: async () => emptyLogs(),
    listDatabaseActivity: async () => emptyLogs()
  };
}

function dataset(overrides: Record<string, unknown> = {}) {
  return { id: datasetId, ownerAdminId: ownerId, selectedEngine: "POSTGRESQL", status: "READY", classification: "RELATIONAL", detectedFields: ["name", "amount"], ...overrides };
}

function recordRepository(overrides: Record<string, unknown> = {}) {
  return {
    findById: async () => dataset(overrides),
    getLocation: async () => ({ storageIdentifier: "admin_owner_dataset_data", engine: "POSTGRESQL" })
  } as unknown as DatasetRepository;
}

const reportRow = {
  id: reportId,
  datasetId,
  ownerAdminId: ownerId,
  title: "Totals",
  description: null,
  configuration: { selectedFields: ["name"], filters: [], grouping: [], aggregates: [{ operation: "COUNT", alias: "count" }] },
  visibility: "PRIVATE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("Phase 10 record management", () => {
  it("enforces ownership and routes owned records through the unconfigured adapter", async () => {
    const service = new DatasetRecordService({ datasets: recordRepository(), router: unconfiguredPostgresRouter() });
    await expect(service.list(datasetId, { page: 1, pageSize: 25 }, otherAdmin)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.list(datasetId, { page: 2, pageSize: 50 }, admin)).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
    await expect(service.list(datasetId, { page: 1, pageSize: 25 }, superAdmin)).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
  });

  it("rejects raw query fields and validates pagination", () => {
    expect(() => reportCreateSchema.parse({ datasetId, title: "Unsafe", visibility: "PRIVATE", query: "DROP TABLE records", configuration: { selectedFields: [], filters: [], grouping: [], aggregates: [] } })).toThrow();
    expect(() => recordsQuerySchema.parse({ page: "0", pageSize: "25" })).toThrow();
    expect(recordsQuerySchema.parse({ page: "2", pageSize: "50" })).toMatchObject({ page: 2, pageSize: 50 });
  });

  it("rejects protected record metadata and does not log record contents", async () => {
    const events: LogRecordInput[] = [];
    const service = new DatasetRecordService({ datasets: recordRepository(), logger: logger(events) });
    await expect(service.create(datasetId, { ownerAdminId: ownerId, name: "private" }, admin)).rejects.toMatchObject({ code: "RECORD_FIELD_NOT_ALLOWED" });
    expect(events).toHaveLength(0);
  });
});

describe("Phase 10 reports", () => {
  it("creates, updates, publishes, and enforces report ownership", async () => {
    const events: LogRecordInput[] = [];
    const reportRepository = {
      create: async (input: Record<string, unknown>) => ({ ...reportRow, ...input, id: reportId }),
      update: async (_id: string, input: Record<string, unknown>) => ({ ...reportRow, ...input }),
      findById: async () => reportRow,
      findOwnedById: async (_id: string, owner: string) => owner === ownerId ? reportRow : null,
      delete: async () => undefined,
      listAll: async () => [reportRow],
      listByOwner: async () => [reportRow]
    } as unknown as ReportRepository;
    const datasets = {
      findById: async () => dataset(),
      getAnalysis: async () => null,
      getLocation: async () => ({ storageIdentifier: "safe", engine: "POSTGRESQL" })
    } as unknown as DatasetRepository;
    const service = new ReportService({ reports: reportRepository, datasets, logger: logger(events) });
    const input = { datasetId, title: "Totals", description: "Report", visibility: "PRIVATE" as const, configuration: { selectedFields: ["name"], filters: [], grouping: [], aggregates: [{ operation: "COUNT" as const, alias: "count" }] } };
    await expect(service.create(input, admin)).resolves.toMatchObject({ id: reportId, datasetId });
    await expect(service.update(reportId, { title: "Updated" }, admin)).resolves.toMatchObject({ title: "Updated" });
    await expect(service.publish(reportId, admin)).resolves.toMatchObject({ visibility: "PUBLIC" });
    await expect(service.get(reportId, otherAdmin)).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
    await expect(service.get(reportId, superAdmin)).resolves.toMatchObject({ id: reportId });
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["REPORT_CREATE", "REPORT_UPDATE", "REPORT_PUBLISH"]));
  });

  it("does not produce fake preview data when the adapter is unconfigured", async () => {
    const reportRepository = { findById: async () => reportRow, findOwnedById: async () => reportRow } as unknown as ReportRepository;
    const datasets = { findById: async () => dataset(), getLocation: async () => ({ storageIdentifier: "safe", engine: "POSTGRESQL" }), getAnalysis: async () => null } as unknown as DatasetRepository;
    const service = new ReportService({ reports: reportRepository, datasets, router: unconfiguredPostgresRouter() });
    await expect(service.preview(reportId, admin)).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
  });
});
