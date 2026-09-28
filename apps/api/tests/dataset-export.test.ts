import ExcelJS from "exceljs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { DatabaseAdapter } from "../src/database/adapter.js";
import { DatabaseRouter } from "../src/database/router.js";
import type { DatabaseEngine, DatabaseRecord, RecordListRequest, RecordPage } from "../src/database/types.js";
import type { ActivityLogger, LogRecordInput, PaginatedLogs } from "../src/logging/types.js";
import type { DatasetRepository } from "../src/repositories/dataset.repository.js";
import { DatasetExportService } from "../src/services/dataset-export.service.js";
import { createApp } from "../src/app.js";
import { issueAccessToken } from "../src/auth/tokens.js";
import type { AuthConfig } from "../src/auth/config.js";
import { UnconfiguredDatabaseAdapter } from "../src/database/unconfigured.adapter.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";
const datasetId = "33333333-3333-4333-8333-333333333333";
const publicDatasetId = "55555555-5555-4555-8555-555555555555";
const emptyDatasetId = "66666666-6666-4666-8666-666666666666";

const authConfig: AuthConfig = {
  NODE_ENV: "test",
  SUPER_ADMIN_EMAIL: "super@example.test",
  SUPER_ADMIN_PASSWORD_HASH: "test-hash",
  ACCESS_TOKEN_SECRET: "export-test-access-token-secret-32-chars!!",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_DAYS: 30
};

function emptyPage(): PaginatedLogs {
  return { items: [], page: 1, pageSize: 25, total: 0, pageCount: 0 };
}

function createLogger(events: LogRecordInput[]): ActivityLogger {
  return {
    recordLogin: async () => undefined,
    recordAudit: async () => undefined,
    recordSecurity: async () => undefined,
    recordDatasetActivity: async (input) => { events.push(input); },
    listLogin: async () => emptyPage(),
    listAudit: async () => emptyPage(),
    listSecurity: async () => emptyPage(),
    listDatasetActivity: async () => emptyPage(),
    listDatabaseActivity: async () => emptyPage()
  };
}

function mockDataset(overrides: Record<string, unknown> = {}) {
  return {
    id: datasetId,
    ownerAdminId: ownerId,
    name: "Student Enrollment",
    description: "University enrollment data",
    originalFilename: "students.csv",
    fileType: "CSV",
    selectedEngine: "POSTGRESQL",
    status: "READY",
    visibility: "PRIVATE",
    detectedFields: ["student_id", "full_name", "department", "gpa"],
    recordCount: BigInt(3),
    fileSizeBytes: BigInt(500),
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    ...overrides
  };
}

class MockEngineAdapter extends UnconfiguredDatabaseAdapter {
  constructor(
    public override readonly engine: DatabaseEngine,
    private readonly records: DatabaseRecord[]
  ) {
    super();
  }

  override readonly isImplemented = true;

  override listRecords(request: RecordListRequest): Promise<RecordPage> {
    const start = (request.page - 1) * request.pageSize;
    const items = this.records.slice(start, start + request.pageSize);
    return Promise.resolve({
      items,
      page: request.page,
      pageSize: request.pageSize,
      total: this.records.length
    });
  }
}

const sampleRecords: DatabaseRecord[] = [
  { student_id: "S001", full_name: "Alice Johnson", department: "Computer Science", gpa: 3.9 },
  { student_id: "S002", full_name: "Bob Smith, Jr.", department: 'Data "Engineering"', gpa: 3.7 },
  { student_id: "S003", full_name: "Charlie Brown\nLine2", department: "Mathematics", gpa: 4.0 }
];

function createExportFixture(
  records: DatabaseRecord[] = sampleRecords,
  customAdapters?: Partial<Record<DatabaseEngine, DatabaseRecord[]>>
) {
  const events: LogRecordInput[] = [];
  const datasets = new Map<string, Record<string, unknown>>([
    [datasetId, mockDataset()],
    [publicDatasetId, mockDataset({ id: publicDatasetId, ownerAdminId: otherOwnerId, visibility: "PUBLIC", name: "Public Census" })],
    [emptyDatasetId, mockDataset({ id: emptyDatasetId, name: "Empty Records", recordCount: BigInt(0) })]
  ]);

  const locations = new Map<string, { storageIdentifier: string; engine: string }>([
    [datasetId, { storageIdentifier: "tbl_students", engine: "POSTGRESQL" }],
    [publicDatasetId, { storageIdentifier: "tbl_public_census", engine: "POSTGRESQL" }],
    [emptyDatasetId, { storageIdentifier: "tbl_empty", engine: "POSTGRESQL" }]
  ]);

  const repository = {
    findById: async (id: string) => datasets.get(id) ?? null,
    getLocation: async (id: string) => locations.get(id) ?? null
  } as unknown as DatasetRepository;

  const defaultRecords: Record<DatabaseEngine, DatabaseRecord[]> = {
    POSTGRESQL: customAdapters?.POSTGRESQL ?? records,
    MYSQL: customAdapters?.MYSQL ?? [{ id: "m-1", engine: "MYSQL", label: "MySQL Data" }],
    SQLSERVER: customAdapters?.SQLSERVER ?? [{ id: "s-1", engine: "SQLSERVER", label: "SQLServer Data" }],
    MONGODB: customAdapters?.MONGODB ?? [{ id: "doc-1", engine: "MONGODB", label: "MongoDB Data" }],
    COUCHBASE: customAdapters?.COUCHBASE ?? [{ id: "cb-1", engine: "COUCHBASE", label: "Couchbase Data" }],
    NEO4J: customAdapters?.NEO4J ?? [{ id: "n-1", engine: "NEO4J", label: "Neo4j Data" }]
  };

  const adapters: Partial<Record<DatabaseEngine, DatabaseAdapter>> = {
    POSTGRESQL: new MockEngineAdapter("POSTGRESQL", defaultRecords.POSTGRESQL),
    MYSQL: new MockEngineAdapter("MYSQL", defaultRecords.MYSQL),
    SQLSERVER: new MockEngineAdapter("SQLSERVER", defaultRecords.SQLSERVER),
    MONGODB: new MockEngineAdapter("MONGODB", defaultRecords.MONGODB),
    COUCHBASE: new MockEngineAdapter("COUCHBASE", defaultRecords.COUCHBASE),
    NEO4J: new MockEngineAdapter("NEO4J", defaultRecords.NEO4J)
  };

  const router = new DatabaseRouter(adapters);
  const logger = createLogger(events);
  const service = new DatasetExportService({ datasets: repository, router, logger });

  return { service, events, datasets, locations, router, adapters };
}

describe("Dataset Download / Export Feature", () => {
  it("exports dataset as CSV with proper headers, quoting, and row formatting", async () => {
    const fixture = createExportFixture();
    const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

    const result = await fixture.service.export(datasetId, "csv", actor);

    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(result.filename).toBe("Student Enrollment.csv");
    expect(result.format).toBe("csv");
    expect(result.recordCount).toBe(3);

    const csvText = result.buffer.toString("utf8");
    expect(csvText).toContain("student_id,full_name,department,gpa");
    expect(csvText).toContain("Alice Johnson");
    // Escaping of comma and quotes:
    expect(csvText).toContain('"Bob Smith, Jr."');
    expect(csvText).toContain('"Data ""Engineering"""');
    expect(csvText).toContain('"Charlie Brown\nLine2"');
  });

  it("exports dataset as JSON array matching records", async () => {
    const fixture = createExportFixture();
    const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

    const result = await fixture.service.export(datasetId, "json", actor);

    expect(result.contentType).toBe("application/json; charset=utf-8");
    expect(result.filename).toBe("Student Enrollment.json");
    expect(result.format).toBe("json");
    expect(result.recordCount).toBe(3);

    const parsed = JSON.parse(result.buffer.toString("utf8"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ student_id: "S001", full_name: "Alice Johnson" });
    expect(parsed[1]).toMatchObject({ student_id: "S002", full_name: "Bob Smith, Jr." });
  });

  it("exports dataset as XLSX with valid ExcelJS workbook and sheets", async () => {
    const fixture = createExportFixture();
    const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

    const result = await fixture.service.export(datasetId, "xlsx", actor);

    expect(result.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.filename).toBe("Student Enrollment.xlsx");
    expect(result.format).toBe("xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as unknown as ExcelJS.Buffer);

    expect(workbook.worksheets.length).toBeGreaterThanOrEqual(1);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.name).toBe("Student Enrollment");

    // Check header row:
    const headerRow = sheet.getRow(1).values as string[];
    expect(headerRow).toContain("student_id");
    expect(headerRow).toContain("full_name");
    expect(headerRow).toContain("department");
    expect(headerRow).toContain("gpa");

    // Check row count (1 header + 3 data rows = 4)
    expect(sheet.rowCount).toBe(4);
  });

  describe("All Six Database Adapters", () => {
    const engines: DatabaseEngine[] = ["MYSQL", "SQLSERVER", "POSTGRESQL", "MONGODB", "COUCHBASE", "NEO4J"];

    for (let i = 0; i < engines.length; i++) {
      const engine = engines[i]!;
      it(`exports records successfully when dataset is stored in ${engine}`, async () => {
        const fixture = createExportFixture(undefined, {
          [engine]: [{ id: `rec-${engine}-1`, engine, label: `${engine} Test Record` }]
        });
        const dsId = `11111111-2222-4333-8444-00000000000${i}`;

        fixture.datasets.set(dsId, mockDataset({
          id: dsId,
          name: `${engine} Export Dataset`,
          selectedEngine: engine,
          detectedFields: ["id", "engine", "label"]
        }));

        fixture.locations.set(dsId, {
          storageIdentifier: `storage_${engine.toLowerCase()}`,
          engine
        });

        const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

        const csvResult = await fixture.service.export(dsId, "csv", actor);
        expect(csvResult.contentType).toBe("text/csv; charset=utf-8");
        expect(csvResult.databaseEngine).toBe(engine);
        expect(csvResult.buffer.toString("utf8")).toContain(engine);

        const jsonResult = await fixture.service.export(dsId, "json", actor);
        expect(jsonResult.contentType).toBe("application/json; charset=utf-8");
        const parsed = JSON.parse(jsonResult.buffer.toString("utf8"));
        expect(parsed.length).toBeGreaterThan(0);
        expect(parsed[0].engine).toBe(engine);

        const xlsxResult = await fixture.service.export(dsId, "xlsx", actor);
        expect(xlsxResult.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(xlsxResult.buffer.byteLength).toBeGreaterThan(1000);
      });
    }

    it("rejects and records activity when the database adapter is unconfigured", async () => {
      const fixture = createExportFixture();
      const dsId = "99999999-9999-4999-8999-999999999999";
      fixture.datasets.set(dsId, mockDataset({ id: dsId, selectedEngine: "MYSQL" }));
      fixture.locations.set(dsId, { storageIdentifier: "tbl_unconf", engine: "MYSQL" });

      // Override router with default unconfigured MySqlAdapter
      const defaultRouter = new DatabaseRouter();
      const service = new DatasetExportService({
        datasets: { findById: async () => fixture.datasets.get(dsId) ?? null, getLocation: async () => fixture.locations.get(dsId) ?? null } as unknown as DatasetRepository,
        router: defaultRouter,
        logger: createLogger(fixture.events)
      });

      const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };
      await expect(service.export(dsId, "csv", actor)).rejects.toMatchObject({ code: "DATABASE_NOT_CONFIGURED" });

      expect(fixture.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: "DATASET_EXPORTED",
          success: false,
          errorCode: "DatabaseNotConfiguredError"
        })
      ]));
    });
  });

  describe("Security and Permission Enforcement", () => {
    it("denies unowned private dataset download for another Admin and logs failure", async () => {
      const fixture = createExportFixture();
      const otherAdmin = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: otherOwnerId, actorEmail: "other@example.test" };

      await expect(fixture.service.export(datasetId, "csv", otherAdmin)).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(fixture.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: "DATASET_EXPORTED",
          success: false,
          errorCode: "FORBIDDEN"
        })
      ]));
    });

    it("allows Super Admin to download any private dataset", async () => {
      const fixture = createExportFixture();
      const superAdmin = { role: "SUPER_ADMIN" as const, actorType: "SUPER_ADMIN" as const, actorId: null, actorEmail: "super@example.test" };

      const result = await fixture.service.export(datasetId, "csv", superAdmin);
      expect(result.recordCount).toBe(3);
    });

    it("allows an Admin to download another admin's PUBLIC dataset", async () => {
      const fixture = createExportFixture();
      const admin = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

      const result = await fixture.service.export(publicDatasetId, "json", admin);
      expect(result.format).toBe("json");
    });
  });

  describe("Validation & Edge Cases", () => {
    it("rejects invalid dataset ID format with 400", async () => {
      const fixture = createExportFixture();
      const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

      await expect(fixture.service.export("not-a-valid-uuid", "csv", actor)).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_DATASET_ID"
      });
    });

    it("rejects non-existent dataset with 404 and logs failure", async () => {
      const fixture = createExportFixture();
      const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };
      const nonExistent = "00000000-0000-4000-8000-000000000000";

      await expect(fixture.service.export(nonExistent, "csv", actor)).rejects.toMatchObject({
        statusCode: 404,
        code: "DATASET_NOT_FOUND"
      });

      expect(fixture.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: "DATASET_EXPORTED",
          resourceId: nonExistent,
          success: false,
          errorCode: "DATASET_NOT_FOUND"
        })
      ]));
    });

    it("rejects unsupported format with 400", async () => {
      const fixture = createExportFixture();
      const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

      await expect(fixture.service.export(datasetId, "pdf", actor)).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_FORMAT"
      });

      await expect(fixture.service.export(datasetId, "docx", actor)).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_FORMAT"
      });
    });

    it("handles empty datasets properly across CSV, JSON, and XLSX without throwing", async () => {
      const fixture = createExportFixture([]);
      const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

      // Empty CSV
      const emptyCsv = await fixture.service.export(emptyDatasetId, "csv", actor);
      expect(emptyCsv.recordCount).toBe(0);
      expect(emptyCsv.contentType).toBe("text/csv; charset=utf-8");
      expect(emptyCsv.buffer.toString("utf8")).toContain("student_id,full_name,department,gpa");

      // Empty JSON
      const emptyJson = await fixture.service.export(emptyDatasetId, "json", actor);
      expect(emptyJson.recordCount).toBe(0);
      expect(emptyJson.contentType).toBe("application/json; charset=utf-8");
      expect(emptyJson.buffer.toString("utf8").trim()).toBe("[]");

      // Empty XLSX
      const emptyXlsx = await fixture.service.export(emptyDatasetId, "xlsx", actor);
      expect(emptyXlsx.recordCount).toBe(0);
      expect(emptyXlsx.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(emptyXlsx.buffer as unknown as ExcelJS.Buffer);
      expect(wb.worksheets[0]?.rowCount).toBe(1); // 1 header row, 0 data rows
    });
  });

  describe("Activity Logging", () => {
    it("records DATASET_EXPORTED activity log on successful download", async () => {
      const fixture = createExportFixture();
      const actor = { role: "ADMIN" as const, actorType: "ADMIN" as const, actorId: ownerId, actorEmail: "admin@example.test" };

      await fixture.service.export(datasetId, "csv", actor);

      expect(fixture.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: "DATASET_EXPORTED",
          resourceType: "DATASET",
          resourceId: datasetId,
          actorId: ownerId,
          actorEmail: "admin@example.test",
          success: true,
          metadata: expect.objectContaining({
            format: "csv",
            databaseEngine: "POSTGRESQL",
            recordCount: 3,
            filename: "Student Enrollment.csv"
          })
        })
      ]));
    });
  });

  describe("HTTP Endpoints Integration (GET /api/datasets/:id/download & /export)", () => {
    it("handles full HTTP download pipeline with auth, headers, and format query", async () => {
      const fixture = createExportFixture();
      const env = { ...process.env };
      Object.assign(process.env, {
        NODE_ENV: authConfig.NODE_ENV,
        ACCESS_TOKEN_SECRET: authConfig.ACCESS_TOKEN_SECRET,
        ACCESS_TOKEN_EXPIRES_IN: authConfig.ACCESS_TOKEN_EXPIRES_IN
      });

      try {
        const app = createApp(undefined, undefined, undefined, undefined, fixture.router, undefined, undefined, undefined, undefined, undefined, fixture.service);
        const token = await issueAccessToken({ type: "ADMIN", id: ownerId, email: "admin@example.test", role: "ADMIN" }, "sess-1", authConfig);

        // 1. Download CSV via /download
        const csvRes = await request(app)
          .get(`/api/datasets/${datasetId}/download?format=csv`)
          .set("Authorization", `Bearer ${token}`);

        expect(csvRes.status).toBe(200);
        expect(csvRes.headers["content-type"]).toBe("text/csv; charset=utf-8");
        expect(csvRes.headers["content-disposition"]).toContain('attachment; filename="Student Enrollment.csv"');
        expect(csvRes.text).toContain("Alice Johnson");

        // 2. Download JSON via /export alias
        const jsonRes = await request(app)
          .get(`/api/datasets/${datasetId}/export?format=json`)
          .set("Authorization", `Bearer ${token}`);

        expect(jsonRes.status).toBe(200);
        expect(jsonRes.headers["content-type"]).toBe("application/json; charset=utf-8");
        expect(Array.isArray(jsonRes.body)).toBe(true);

        // 3. Download XLSX
        const xlsxRes = await request(app)
          .get(`/api/datasets/${datasetId}/download?format=xlsx`)
          .set("Authorization", `Bearer ${token}`)
          .responseType("blob");

        expect(xlsxRes.status).toBe(200);
        expect(xlsxRes.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(xlsxRes.body.length).toBeGreaterThan(1000);

        // 4. Unauthorized (no token)
        const unauthRes = await request(app).get(`/api/datasets/${datasetId}/download?format=csv`);
        expect(unauthRes.status).toBe(401);

        // 5. Forbidden (other admin)
        const otherToken = await issueAccessToken({ type: "ADMIN", id: otherOwnerId, email: "other@example.test", role: "ADMIN" }, "sess-2", authConfig);
        const forbiddenRes = await request(app)
          .get(`/api/datasets/${datasetId}/download?format=csv`)
          .set("Authorization", `Bearer ${otherToken}`);
        expect(forbiddenRes.status).toBe(403);

        // 6. Invalid format
        const badFormatRes = await request(app)
          .get(`/api/datasets/${datasetId}/download?format=invalid`)
          .set("Authorization", `Bearer ${token}`);
        expect(badFormatRes.status).toBe(400);

        // 7. Invalid dataset ID
        const badIdRes = await request(app)
          .get("/api/datasets/not-a-uuid/download?format=csv")
          .set("Authorization", `Bearer ${token}`);
        expect(badIdRes.status).toBe(400);
      } finally {
        for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
        Object.assign(process.env, env);
      }
    });
  });
});
