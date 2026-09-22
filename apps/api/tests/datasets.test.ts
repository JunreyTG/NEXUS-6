import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AdminRepository } from "../src/repositories/admin.repository.js";
import type { DatasetRepository } from "../src/repositories/dataset.repository.js";
import { DatasetService } from "../src/services/dataset.service.js";
import type { ActivityLogger, LogRecordInput, PaginatedLogs } from "../src/logging/types.js";
import { parseDatasetFile } from "../src/uploads/parsers.js";
import { TemporaryUploadStorage } from "../src/uploads/storage.js";
import { detectUploadFileType } from "../src/routes/dataset.routes.js";
import { createApp } from "../src/app.js";
import { issueAccessToken } from "../src/auth/tokens.js";
import type { AuthConfig } from "../src/auth/config.js";
import type { DatasetActor } from "../src/services/dataset.service.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";
const datasetId = "33333333-3333-4333-8333-333333333333";
const config: AuthConfig = {
  NODE_ENV: "test",
  SUPER_ADMIN_EMAIL: "super@example.test",
  SUPER_ADMIN_PASSWORD_HASH: "test-hash",
  ACCESS_TOKEN_SECRET: "dataset-test-access-token-secret-that-is-32-bytes",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_DAYS: 30
};

type DatasetRow = Record<string, unknown>;

function emptyPage(): PaginatedLogs {
  return { items: [], page: 1, pageSize: 25, total: 0, pageCount: 0 };
}

function createLogger(events: LogRecordInput[]) {
  const logger: ActivityLogger = {
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
  return logger;
}

function row(overrides: Partial<DatasetRow> = {}): DatasetRow {
  return {
    id: datasetId,
    ownerAdminId: ownerId,
    name: "Dataset",
    description: null,
    originalFilename: "data.csv",
    fileType: "CSV",
    fileSizeBytes: BigInt(20),
    detectedFields: ["name", "value"],
    temporaryFileKey: "11111111-1111-4111-8111-111111111111.csv",
    recordCount: BigInt(2),
    visibility: "PRIVATE",
    status: "UPLOADED",
    createdAt: new Date("2026-09-22T00:00:00.000Z"),
    updatedAt: new Date("2026-09-22T00:00:00.000Z"),
    owner: { id: ownerId, name: "Owner", email: "owner@example.test" },
    ...overrides
  };
}

function createServiceFixture() {
  const events: LogRecordInput[] = [];
  const datasets = new Map([[datasetId, row()]]);
  const removed: Array<string | null | undefined> = [];
  const repository = {
    findById: async (id: string) => datasets.get(id) ?? null,
    listByOwner: async (id: string) => [...datasets.values()].filter((dataset) => dataset.ownerAdminId === id),
    listAll: async () => [...datasets.values()],
    create: async (data: DatasetRow) => { const created = row({ ...data, id: datasetId, owner: { id: data.ownerAdminId, name: "Owner", email: "owner@example.test" } }); datasets.set(datasetId, created); return created; },
    updateMetadata: async (_id: string, data: DatasetRow) => { const updated = row(data); datasets.set(datasetId, updated); return updated; },
    delete: async (id: string) => { datasets.delete(id); }
  } as unknown as DatasetRepository;
  const admins = { findById: async (id: string) => id === ownerId || id === otherOwnerId ? { id } : null } as unknown as Pick<AdminRepository, "findById">;
  const storage = {
    remove: async (key: string | null | undefined) => { removed.push(key); }
  } as unknown as TemporaryUploadStorage;
  const service = new DatasetService({ datasets: repository, admins, storage, logger: createLogger(events) });
  return { service, events, removed, datasets };
}

async function tempFile(extension: string, contents: string | Buffer): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus6-dataset-test-"));
  const filePath = path.join(directory, `input.${extension}`);
  await writeFile(filePath, contents);
  return { directory, path: filePath };
}

describe("dataset upload and ownership", () => {
  it("parses valid CSV and JSON files", async () => {
    const csv = await tempFile("csv", "name,value\nAlice,1\nBob,2\n");
    const json = await tempFile("json", JSON.stringify([{ name: "Alice", value: 1 }, { name: "Bob", value: 2 }]));
    try {
      await expect(parseDatasetFile(csv.path, "CSV")).resolves.toMatchObject({ fileType: "CSV", recordCount: 2, detectedFields: ["name", "value"] });
      await expect(parseDatasetFile(json.path, "JSON")).resolves.toMatchObject({ fileType: "JSON", recordCount: 2, detectedFields: ["name", "value"] });
    } finally {
      await rm(csv.directory, { recursive: true, force: true });
      await rm(json.directory, { recursive: true, force: true });
    }
  });

  it("registers a valid CSV upload as metadata and keeps the temporary key", async () => {
    const file = await tempFile("csv", "name,value\nAlice,1\nBob,2\n");
    const fixture = createServiceFixture();
    try {
      const result = await fixture.service.upload({ key: "44444444-4444-4444-8444-444444444444.csv", path: file.path, originalFilename: "data.csv", fileType: "CSV", size: 20 }, { name: "Customer data", description: "Basic data", visibility: "PRIVATE" }, { role: "ADMIN", actorType: "ADMIN", actorId: ownerId, actorEmail: "owner@example.test" });
      expect(result).toMatchObject({ name: "Customer data", fileType: "CSV", recordCount: 2, detectedFields: ["name", "value"], status: "UPLOADED" });
      expect(fixture.removed).toHaveLength(0);
      expect(fixture.events).toEqual(expect.arrayContaining([expect.objectContaining({ action: "DATASET_UPLOAD_SUCCESS", success: true })]));
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("parses valid XLSX files", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data");
    worksheet.addRow(["name", "value"]);
    worksheet.addRow(["Alice", 1]);
    const file = await tempFile("xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
    try {
      await expect(parseDatasetFile(file.path, "XLSX")).resolves.toMatchObject({ fileType: "XLSX", recordCount: 1, detectedFields: ["name", "value"] });
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["empty", "", "EMPTY_FILE"],
    ["malformed JSON", "{not-json", "MALFORMED_FILE"]
  ])("rejects %s files", async (_label, contents, code) => {
    const file = await tempFile("json", contents);
    try {
      await expect(parseDatasetFile(file.path, "JSON")).rejects.toMatchObject({ code });
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("enforces supported extensions and MIME types", () => {
    expect(() => detectUploadFileType("data.txt", "text/plain")).toThrowError("Uploaded file is invalid.");
    expect(() => detectUploadFileType("data.csv", "application/json")).toThrowError("Uploaded file is invalid.");
    expect(() => detectUploadFileType("../data.csv", "text/csv")).toThrowError("Uploaded file is invalid.");
  });

  it("rejects unsupported and oversized multipart uploads safely", async () => {
    const previous = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: config.NODE_ENV,
      SUPER_ADMIN_EMAIL: config.SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD_HASH: config.SUPER_ADMIN_PASSWORD_HASH,
      ACCESS_TOKEN_SECRET: config.ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_DAYS: String(config.REFRESH_TOKEN_EXPIRES_DAYS),
      MAX_UPLOAD_SIZE_MB: "1"
    });
    try {
      const fixture = createServiceFixture();
      const app = createApp(undefined, undefined, undefined, fixture.service);
      const token = await issueAccessToken({ type: "ADMIN", id: ownerId, email: "owner@example.test", role: "ADMIN" }, "session", config);
      const unsupported = await request(app).post("/api/datasets/upload").set("Authorization", `Bearer ${token}`).attach("file", Buffer.from("hello"), { filename: "data.txt", contentType: "text/plain" }).field("name", "Unsupported").field("visibility", "PRIVATE");
      const oversized = await request(app).post("/api/datasets/upload").set("Authorization", `Bearer ${token}`).attach("file", Buffer.alloc(1024 * 1024 + 1), { filename: "data.csv", contentType: "text/csv" }).field("name", "Oversized").field("visibility", "PRIVATE");
      expect(unsupported.body.error.code).toBe("FILE_TYPE_UNSUPPORTED");
      expect(oversized.body.error.code).toBe("FILE_TOO_LARGE");
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });

  it("enforces Admin ownership and logs denial", async () => {
    const fixture = createServiceFixture();
    const actor: DatasetActor = { role: "ADMIN", actorType: "ADMIN", actorId: otherOwnerId, actorEmail: "other@example.test" };
    await expect(fixture.service.get(datasetId, actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.events).toEqual(expect.arrayContaining([expect.objectContaining({ action: "DATASET_OWNERSHIP_DENIED", success: false })]));
  });

  it("allows Super Admin access and restricts metadata updates", async () => {
    const fixture = createServiceFixture();
    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: "super@example.test" };
    await expect(fixture.service.get(datasetId, actor)).resolves.toMatchObject({ id: datasetId });
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
      const token = await issueAccessToken({ type: "SUPER_ADMIN", id: null, email: config.SUPER_ADMIN_EMAIL, role: "SUPER_ADMIN" }, "session", config);
      const response = await request(createApp(undefined, undefined, undefined, fixture.service)).patch(`/api/datasets/${datasetId}`).set("Authorization", `Bearer ${token}`).send({ ownerAdminId: otherOwnerId });
      expect(response.status).toBe(400);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });

  it("deletes metadata and cleans the temporary file key", async () => {
    const fixture = createServiceFixture();
    await fixture.service.delete(datasetId, { role: "ADMIN", actorType: "ADMIN", actorId: ownerId, actorEmail: "owner@example.test" });
    expect(fixture.datasets.has(datasetId)).toBe(false);
    expect(fixture.removed).toContain("11111111-1111-4111-8111-111111111111.csv");
    expect(fixture.events).toEqual(expect.arrayContaining([expect.objectContaining({ action: "DATASET_DELETED", success: true })]));
  });

  it("cleans expired temporary files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "nexus6-upload-cleanup-"));
    const filename = "11111111-1111-4111-8111-111111111111.csv";
    const filePath = path.join(directory, filename);
    await writeFile(filePath, "name\nold\n");
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(filePath, old, old);
    const storage = new TemporaryUploadStorage({ MAX_UPLOAD_SIZE_MB: 10, TEMP_UPLOAD_DIR: directory, TEMP_UPLOAD_RETENTION_HOURS: 24 });
    await storage.cleanupExpired();
    await expect(stat(filePath)).rejects.toThrow();
    await rm(directory, { recursive: true, force: true });
  });
});
