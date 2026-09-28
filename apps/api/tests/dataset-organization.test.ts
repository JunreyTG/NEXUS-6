import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { AdminRepository } from "../src/repositories/admin.repository.js";
import type { DatasetRepository, DatasetFilterOptions, DatasetCreateData } from "../src/repositories/dataset.repository.js";
import { DatasetService, DATASET_CATEGORIES, normalizeCategory, type DatasetActor } from "../src/services/dataset.service.js";
import type { ActivityLogger, LogRecordInput, PaginatedLogs } from "../src/logging/types.js";
import { TemporaryUploadStorage } from "../src/uploads/storage.js";
import { createApp } from "../src/app.js";
import { issueAccessToken } from "../src/auth/tokens.js";
import type { AuthConfig } from "../src/auth/config.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";
const superAdminEmail = "super@datavault6.local";

const config: AuthConfig = {
  NODE_ENV: "test",
  SUPER_ADMIN_EMAIL: superAdminEmail,
  SUPER_ADMIN_PASSWORD_HASH: "test-hash",
  ACCESS_TOKEN_SECRET: "dataset-organization-test-secret-at-least-32-bytes",
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

function createDatasetRow(id: string, overrides: Partial<DatasetRow> = {}): DatasetRow {
  return {
    id,
    ownerAdminId: ownerId,
    contributorName: "Alice Admin",
    contributorEmail: "alice@example.test",
    name: `Dataset ${id.slice(0, 8)}`,
    description: "Sample description",
    category: "Education",
    originalFilename: "data.csv",
    fileType: "CSV",
    fileSizeBytes: BigInt(1024 * 1024 * 5), // 5 MB
    detectedFields: ["id", "name", "score"],
    temporaryFileKey: `${id}.csv`,
    recordCount: BigInt(500),
    visibility: "PRIVATE",
    status: "ACTIVE",
    selectedEngine: "POSTGRESQL",
    recommendedEngine: "POSTGRESQL",
    createdAt: new Date("2026-09-20T10:00:00.000Z"),
    updatedAt: new Date("2026-09-20T10:00:00.000Z"),
    owner: { id: ownerId, name: "Alice Admin", email: "alice@example.test" },
    ...overrides
  };
}

function createMockRepository(datasetsMap: Map<string, DatasetRow>) {
  return {
    findById: async (id: string) => datasetsMap.get(id) ?? null,
    findOwnedById: async (id: string, ownerAdminId: string) => {
      const d = datasetsMap.get(id);
      return d && d.ownerAdminId === ownerAdminId ? d : null;
    },
    listByOwner: async (id: string) => [...datasetsMap.values()].filter((d) => d.ownerAdminId === id),
    listAll: async () => [...datasetsMap.values()],
    listPublic: async () => [...datasetsMap.values()].filter((d) => d.visibility === "PUBLIC"),
    findPublicById: async (id: string) => {
      const d = datasetsMap.get(id);
      return d && d.visibility === "PUBLIC" ? d : null;
    },
    countPublic: async () => [...datasetsMap.values()].filter((d) => d.visibility === "PUBLIC").length,
    create: async (data: DatasetCreateData) => {
      const id = "44444444-4444-4444-8444-" + Math.floor(Math.random() * 100000000000).toString().padStart(12, "0");
      const created = createDatasetRow(id, {
        ...data,
        owner: data.ownerAdminId ? { id: data.ownerAdminId, name: data.contributorName ?? "Admin", email: data.contributorEmail ?? "admin@example.test" } : null
      });
      datasetsMap.set(id, created);
      return created;
    },
    updateMetadata: async (id: string, data: Record<string, unknown>) => {
      const existing = datasetsMap.get(id);
      if (!existing) throw new Error("Not found");
      const updated = { ...existing, ...data, updatedAt: new Date() };
      datasetsMap.set(id, updated);
      return updated;
    },
    delete: async (id: string) => { datasetsMap.delete(id); },
    findFiltered: async (options: DatasetFilterOptions = {}) => {
      let items = [...datasetsMap.values()];

      // Access filter
      if (options.accessFilter) {
        items = items.filter((d) => {
          if (options.accessFilter?.allowedOwnerAdminId && d.ownerAdminId === options.accessFilter.allowedOwnerAdminId) return true;
          if (options.accessFilter?.allowPublic !== false && d.visibility === "PUBLIC") return true;
          return false;
        });
      }

      // Owner filter
      if (options.ownerAdminId) {
        items = items.filter((d) => d.ownerAdminId === options.ownerAdminId);
      }

      // Visibility filter
      if (options.visibility) {
        items = items.filter((d) => d.visibility === options.visibility);
      }

      // Category filter
      if (options.category) {
        items = items.filter((d) => String(d.category).toLowerCase() === options.category!.toLowerCase());
      }

      // Format filter
      if (options.format) {
        items = items.filter((d) => String(d.fileType).toLowerCase() === options.format!.toLowerCase());
      }

      // Database filter
      if (options.database) {
        const dbUpper = options.database.toUpperCase().replace(/[\s_-]/g, "");
        items = items.filter((d) => {
          const selected = String(d.selectedEngine ?? "").toUpperCase();
          const rec = String(d.recommendedEngine ?? "").toUpperCase();
          return selected.includes(dbUpper) || rec.includes(dbUpper);
        });
      }

      // Contributor filter
      if (options.contributorId) {
        items = items.filter((d) => d.ownerAdminId === options.contributorId || String(d.contributorName).toLowerCase() === options.contributorId!.toLowerCase());
      } else if (options.contributor) {
        items = items.filter((d) => String(d.contributorName).toLowerCase().includes(options.contributor!.toLowerCase()) || String(d.contributorEmail).toLowerCase().includes(options.contributor!.toLowerCase()));
      }

      // Search filter
      if (options.search && options.search.trim()) {
        const s = options.search.trim().toLowerCase();
        items = items.filter((d) =>
          String(d.name ?? "").toLowerCase().includes(s) ||
          String(d.description ?? "").toLowerCase().includes(s) ||
          String(d.category ?? "").toLowerCase().includes(s) ||
          String(d.fileType ?? "").toLowerCase().includes(s) ||
          String(d.selectedEngine ?? "").toLowerCase().includes(s) ||
          String(d.contributorName ?? "").toLowerCase().includes(s) ||
          String(d.contributorEmail ?? "").toLowerCase().includes(s)
        );
      }

      // Sorting
      const sortOrder = options.sortOrder === "asc" ? 1 : -1;
      const sortBy = options.sortBy?.toLowerCase() ?? "createdat";
      items.sort((a, b) => {
        let valA: any = a[sortBy] ?? a.createdAt;
        let valB: any = b[sortBy] ?? b.createdAt;
        if (sortBy === "size" || sortBy === "filesizebytes") {
          valA = Number(a.fileSizeBytes ?? 0);
          valB = Number(b.fileSizeBytes ?? 0);
        } else if (sortBy === "contributor") {
          valA = String(a.contributorName ?? "");
          valB = String(b.contributorName ?? "");
        }
        if (valA < valB) return -1 * sortOrder;
        if (valA > valB) return 1 * sortOrder;
        return 0;
      });

      const page = options.page ?? 1;
      const limit = options.limit ?? 25;
      const total = items.length;
      const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);
      const paginated = items.slice((page - 1) * limit, page * limit);

      return { items: paginated, page, limit, total, totalPages };
    },
    getCategoryStatistics: async () => {
      const all = [...datasetsMap.values()];
      const categories: Record<string, number> = {
        Education: 0, Environment: 0, Transportation: 0, Demographics: 0, Business: 0, Finance: 0, Healthcare: 0
      };
      const databaseEngines: Record<string, number> = {
        MySQL: 0, SQLServer: 0, PostgreSQL: 0, MongoDB: 0, Neo4J: 0, CouchBase: 0
      };
      for (const d of all) {
        const cat = String(d.category ?? "Education");
        if (categories[cat] !== undefined) categories[cat] = (categories[cat] ?? 0) + 1;
        const eng = String(d.selectedEngine ?? d.recommendedEngine ?? "");
        if (eng === "POSTGRESQL") databaseEngines.PostgreSQL = (databaseEngines.PostgreSQL ?? 0) + 1;
        else if (eng === "MYSQL") databaseEngines.MySQL = (databaseEngines.MySQL ?? 0) + 1;
        else if (eng === "SQLSERVER") databaseEngines.SQLServer = (databaseEngines.SQLServer ?? 0) + 1;
        else if (eng === "MONGODB") databaseEngines.MongoDB = (databaseEngines.MongoDB ?? 0) + 1;
        else if (eng === "NEO4J") databaseEngines.Neo4J = (databaseEngines.Neo4J ?? 0) + 1;
        else if (eng === "COUCHBASE") databaseEngines.CouchBase = (databaseEngines.CouchBase ?? 0) + 1;
      }
      const total = all.length;
      const breakdown = Object.entries(categories).map(([category, count]) => ({
        category, count, percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
      }));
      return { totalDatasets: total, categories, databaseEngines, breakdown };
    },
    getContributorStatistics: async () => {
      const all = [...datasetsMap.values()];
      const map = new Map<string, { id: string | null; name: string; email: string | null; datasetCount: number; lastActiveAt: Date }>();
      for (const d of all) {
        const key = String(d.ownerAdminId ?? d.contributorName ?? "Super Admin");
        const existing = map.get(key);
        if (existing) existing.datasetCount++;
        else map.set(key, { id: d.ownerAdminId as string | null, name: String(d.contributorName ?? "Super Admin"), email: d.contributorEmail as string | null, datasetCount: 1, lastActiveAt: d.createdAt as Date });
      }
      const contributors = Array.from(map.values());
      const recentActivity = all.slice(0, 10).map((d) => ({
        datasetId: d.id as string,
        datasetName: d.name as string,
        category: d.category as string,
        contributorId: d.ownerAdminId as string | null,
        contributorName: d.contributorName as string,
        timestamp: d.createdAt as Date
      }));
      return { totalContributors: contributors.length, contributors, recentActivity };
    }
  } as unknown as DatasetRepository;
}

async function tempCsvFile(content: string): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus6-cat-test-"));
  const filePath = path.join(directory, "test.csv");
  await writeFile(filePath, content);
  return { directory, path: filePath };
}

describe("DataVault6 Dataset Organization & Contributor Tracking", () => {
  it("enforces predefined dataset categories (Education, Environment, Transportation, Demographics, Business, Finance, Healthcare)", () => {
    expect(DATASET_CATEGORIES).toEqual([
      "Education",
      "Environment",
      "Transportation",
      "Demographics",
      "Business",
      "Finance",
      "Healthcare"
    ]);
    expect(normalizeCategory("education")).toBe("Education");
    expect(normalizeCategory("FINANCE")).toBe("Finance");
    expect(normalizeCategory("Healthcare")).toBe("Healthcare");
    expect(normalizeCategory("InvalidCategory")).toBeNull();
    expect(normalizeCategory("")).toBeNull();
  });

  it("uploads dataset with valid category and tracks authenticated contributor", async () => {
    const events: LogRecordInput[] = [];
    const datasetsMap = new Map<string, DatasetRow>();
    const repo = createMockRepository(datasetsMap);
    const admins = {
      findById: async (id: string) => id === ownerId ? { id, name: "Alice Admin", email: "alice@example.test" } : null
    } as unknown as Pick<AdminRepository, "findById">;

    const service = new DatasetService({ datasets: repo, admins, logger: createLogger(events) });
    const file = await tempCsvFile("id,name\n1,Alpha\n2,Beta\n");

    try {
      const result = await service.upload(
        { key: "temp-key.csv", path: file.path, originalFilename: "alpha.csv", fileType: "CSV", size: 1024 },
        { name: "Alpha Dataset", description: "Alpha description", category: "Finance", visibility: "PRIVATE" },
        { role: "ADMIN", actorType: "ADMIN", actorId: ownerId, actorEmail: "alice@example.test" }
      );

      expect(result).toMatchObject({
        name: "Alpha Dataset",
        category: "Finance",
        fileFormat: "CSV",
        contributor: {
          id: ownerId,
          name: "Alice Admin",
          email: "alice@example.test"
        },
        uploadedBy: "Alice Admin"
      });

      // Verify operational UPLOAD log was recorded
      const uploadLog = events.find((e) => e.action === "UPLOAD");
      expect(uploadLog).toBeDefined();
      expect(uploadLog).toMatchObject({
        action: "UPLOAD",
        success: true,
        metadata: expect.objectContaining({
          category: "Finance",
          fileFormat: "CSV",
          contributor: "Alice Admin"
        })
      });
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("rejects invalid dataset category with UploadValidationError", async () => {
    const events: LogRecordInput[] = [];
    const datasetsMap = new Map<string, DatasetRow>();
    const repo = createMockRepository(datasetsMap);
    const admins = {
      findById: async (id: string) => id === ownerId ? { id, name: "Alice Admin", email: "alice@example.test" } : null
    } as unknown as Pick<AdminRepository, "findById">;

    const service = new DatasetService({ datasets: repo, admins, logger: createLogger(events) });
    const file = await tempCsvFile("id,name\n1,Test\n");

    try {
      await expect(
        service.upload(
          { key: "temp-invalid.csv", path: file.path, originalFilename: "test.csv", fileType: "CSV", size: 100 },
          { name: "Invalid Category Dataset", category: "Cryptocurrency" as any, visibility: "PRIVATE" },
          { role: "ADMIN", actorType: "ADMIN", actorId: ownerId, actorEmail: "alice@example.test" }
        )
      ).rejects.toMatchObject({ code: "CATEGORY_INVALID" });

      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ action: "DATASET_UPLOAD_FAILURE", errorCode: "CATEGORY_INVALID" })]));
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("prevents client from spoofing uploader ID (forces authenticated session ID)", async () => {
    const events: LogRecordInput[] = [];
    const datasetsMap = new Map<string, DatasetRow>();
    const repo = createMockRepository(datasetsMap);
    const admins = {
      findById: async (id: string) => id === ownerId ? { id, name: "Alice Admin", email: "alice@example.test" } : null
    } as unknown as Pick<AdminRepository, "findById">;

    const service = new DatasetService({ datasets: repo, admins, logger: createLogger(events) });
    const file = await tempCsvFile("id,name\n1,Test\n");

    try {
      // Client attempts to pass ownerAdminId: otherOwnerId
      const result = await service.upload(
        { key: "temp-spoof.csv", path: file.path, originalFilename: "test.csv", fileType: "CSV", size: 100 },
        { name: "Spoof Attempt", category: "Healthcare", visibility: "PRIVATE", ownerAdminId: otherOwnerId },
        { role: "ADMIN", actorType: "ADMIN", actorId: ownerId, actorEmail: "alice@example.test" }
      );

      // Must remain ownerId, NOT otherOwnerId
      expect(result.ownerAdminId).toBe(ownerId);
      expect(result.contributor.id).toBe(ownerId);
      expect(result.contributor.name).toBe("Alice Admin");
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("supports dataset search across name, description, category, and contributor", async () => {
    const datasetsMap = new Map<string, DatasetRow>([
      ["d1", createDatasetRow("d1", { name: "University Admissions 2026", category: "Education", contributorName: "Professor John" })],
      ["d2", createDatasetRow("d2", { name: "CO2 Emissions Index", category: "Environment", contributorName: "Eco Team" })],
      ["d3", createDatasetRow("d3", { name: "Metro Transit Schedule", category: "Transportation", contributorName: "Transit Dept" })]
    ]);
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: superAdminEmail };

    const searchEdu = await service.list(actor, { search: "admissions" });
    expect(searchEdu.items).toHaveLength(1);
    expect(searchEdu.items[0]!.name).toBe("University Admissions 2026");

    const searchContributor = await service.list(actor, { search: "Transit Dept" });
    expect(searchContributor.items).toHaveLength(1);
    expect(searchContributor.items[0]!.name).toBe("Metro Transit Schedule");

    const searchCategory = await service.list(actor, { search: "Environment" });
    expect(searchCategory.items).toHaveLength(1);
    expect(searchCategory.items[0]!.category).toBe("Environment");
  });

  it("supports category filtering", async () => {
    const datasetsMap = new Map<string, DatasetRow>([
      ["d1", createDatasetRow("d1", { name: "DS1", category: "Finance" })],
      ["d2", createDatasetRow("d2", { name: "DS2", category: "Finance" })],
      ["d3", createDatasetRow("d3", { name: "DS3", category: "Healthcare" })]
    ]);
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: superAdminEmail };
    const financeResults = await service.list(actor, { category: "Finance" });
    expect(financeResults.items).toHaveLength(2);
    expect(financeResults.items.every((d) => d.category === "Finance")).toBe(true);

    const healthResults = await service.list(actor, { category: "Healthcare" });
    expect(healthResults.items).toHaveLength(1);
    expect(healthResults.items[0]!.category).toBe("Healthcare");
  });

  it("supports database engine and format filtering", async () => {
    const datasetsMap = new Map<string, DatasetRow>([
      ["d1", createDatasetRow("d1", { name: "MySQL Dataset", selectedEngine: "MYSQL", fileType: "CSV" })],
      ["d2", createDatasetRow("d2", { name: "Postgres Dataset", selectedEngine: "POSTGRESQL", fileType: "JSON" })],
      ["d3", createDatasetRow("d3", { name: "Mongo Dataset", selectedEngine: "MONGODB", fileType: "XLSX" })]
    ]);
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: superAdminEmail };

    const mysqlResult = await service.list(actor, { database: "MySQL" });
    expect(mysqlResult.items).toHaveLength(1);
    expect(mysqlResult.items[0]!.name).toBe("MySQL Dataset");

    const jsonResult = await service.list(actor, { format: "JSON" });
    expect(jsonResult.items).toHaveLength(1);
    expect(jsonResult.items[0]!.fileFormat).toBe("JSON");
  });

  it("supports combined search and filters", async () => {
    const datasetsMap = new Map<string, DatasetRow>([
      ["d1", createDatasetRow("d1", { name: "Student Performance", category: "Education", selectedEngine: "POSTGRESQL" })],
      ["d2", createDatasetRow("d2", { name: "Student Tuition", category: "Finance", selectedEngine: "POSTGRESQL" })],
      ["d3", createDatasetRow("d3", { name: "Teacher Records", category: "Education", selectedEngine: "MYSQL" })]
    ]);
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: superAdminEmail };

    const result = await service.list(actor, {
      search: "Student",
      category: "Education",
      database: "PostgreSQL"
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Student Performance");
  });

  it("provides pagination and sorting metadata", async () => {
    const datasetsMap = new Map<string, DatasetRow>();
    for (let i = 1; i <= 25; i++) {
      datasetsMap.set(`d-${i}`, createDatasetRow(`d-${i}`, {
        name: `Dataset ${String(i).padStart(2, "0")}`,
        createdAt: new Date(Date.now() + i * 1000)
      }));
    }
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: superAdminEmail };

    const page1 = await service.list(actor, { page: 1, limit: 10, sortBy: "name", sortOrder: "asc" });
    expect(page1.items).toHaveLength(10);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(10);
    expect(page1.total).toBe(25);
    expect(page1.totalPages).toBe(3);
    expect(page1.items[0]!.name).toBe("Dataset 01");

    const page3 = await service.list(actor, { page: 3, limit: 10, sortBy: "name", sortOrder: "asc" });
    expect(page3.items).toHaveLength(5);
    expect(page3.items[4]!.name).toBe("Dataset 25");
  });

  it("retrieves current authenticated user's datasets via listMine", async () => {
    const datasetsMap = new Map<string, DatasetRow>([
      ["d1", createDatasetRow("d1", { ownerAdminId: ownerId, name: "Alice Dataset 1" })],
      ["d2", createDatasetRow("d2", { ownerAdminId: otherOwnerId, name: "Bob Dataset 1" })],
      ["d3", createDatasetRow("d3", { ownerAdminId: ownerId, name: "Alice Dataset 2" })]
    ]);
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const aliceActor: DatasetActor = { role: "ADMIN", actorType: "ADMIN", actorId: ownerId, actorEmail: "alice@example.test" };
    const aliceDatasets = await service.listMine(aliceActor);
    expect(aliceDatasets.items).toHaveLength(2);
    expect(aliceDatasets.items.every((d) => d.ownerAdminId === ownerId)).toBe(true);

    const bobActor: DatasetActor = { role: "ADMIN", actorType: "ADMIN", actorId: otherOwnerId, actorEmail: "bob@example.test" };
    const bobDatasets = await service.listMine(bobActor);
    expect(bobDatasets.items).toHaveLength(1);
    expect(bobDatasets.items[0]!.name).toBe("Bob Dataset 1");
  });

  it("provides category statistics and database engine distribution", async () => {
    const datasetsMap = new Map<string, DatasetRow>([
      ["d1", createDatasetRow("d1", { category: "Education", selectedEngine: "POSTGRESQL" })],
      ["d2", createDatasetRow("d2", { category: "Education", selectedEngine: "MYSQL" })],
      ["d3", createDatasetRow("d3", { category: "Finance", selectedEngine: "SQLSERVER" })],
      ["d4", createDatasetRow("d4", { category: "Healthcare", selectedEngine: "MONGODB" })]
    ]);
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: superAdminEmail };
    const stats = await service.getCategoryStatistics(actor);

    expect(stats.totalDatasets).toBe(4);
    expect(stats.categories.Education).toBe(2);
    expect(stats.categories.Finance).toBe(1);
    expect(stats.categories.Healthcare).toBe(1);
    expect(stats.databaseEngines.PostgreSQL).toBe(1);
    expect(stats.databaseEngines.MySQL).toBe(1);
    expect(stats.databaseEngines.SQLServer).toBe(1);
    expect(stats.databaseEngines.MongoDB).toBe(1);
    expect(stats.breakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "Education", count: 2 }),
      expect.objectContaining({ category: "Finance", count: 1 })
    ]));
  });

  it("provides contributor statistics and recent activity", async () => {
    const datasetsMap = new Map<string, DatasetRow>([
      ["d1", createDatasetRow("d1", { ownerAdminId: ownerId, contributorName: "Alice Admin", name: "Alpha" })],
      ["d2", createDatasetRow("d2", { ownerAdminId: ownerId, contributorName: "Alice Admin", name: "Beta" })],
      ["d3", createDatasetRow("d3", { ownerAdminId: otherOwnerId, contributorName: "Bob Admin", name: "Gamma" })]
    ]);
    const repo = createMockRepository(datasetsMap);
    const service = new DatasetService({ datasets: repo });

    const actor: DatasetActor = { role: "SUPER_ADMIN", actorType: "SUPER_ADMIN", actorId: null, actorEmail: superAdminEmail };
    const contribStats = await service.getContributorStatistics(actor);

    expect(contribStats.totalContributors).toBe(2);
    const alice = contribStats.contributors.find((c) => c.name === "Alice Admin");
    expect(alice?.datasetCount).toBe(2);
    const bob = contribStats.contributors.find((c) => c.name === "Bob Admin");
    expect(bob?.datasetCount).toBe(1);
    expect(contribStats.recentActivity).toHaveLength(3);
  });

  describe("HTTP API Endpoints Integration (Supertest)", () => {
    const previousEnv = { ...process.env };

    beforeEach(() => {
      Object.assign(process.env, {
        NODE_ENV: config.NODE_ENV,
        SUPER_ADMIN_EMAIL: config.SUPER_ADMIN_EMAIL,
        SUPER_ADMIN_PASSWORD_HASH: config.SUPER_ADMIN_PASSWORD_HASH,
        ACCESS_TOKEN_SECRET: config.ACCESS_TOKEN_SECRET,
        ACCESS_TOKEN_EXPIRES_IN: config.ACCESS_TOKEN_EXPIRES_IN,
        REFRESH_TOKEN_EXPIRES_DAYS: String(config.REFRESH_TOKEN_EXPIRES_DAYS)
      });
    });

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in previousEnv)) delete process.env[key];
      }
      Object.assign(process.env, previousEnv);
    });

    it("handles GET /api/datasets with search, filters, and pagination", async () => {
      const datasetsMap = new Map<string, DatasetRow>([
        ["d1", createDatasetRow("d1", { name: "University Enrollment", category: "Education", selectedEngine: "MYSQL", fileType: "CSV" })],
        ["d2", createDatasetRow("d2", { name: "Stock Market History", category: "Finance", selectedEngine: "SQLSERVER", fileType: "XLSX" })]
      ]);
      const repo = createMockRepository(datasetsMap);
      const service = new DatasetService({ datasets: repo });
      const app = createApp(undefined, undefined, undefined, service);

      const token = await issueAccessToken({ type: "SUPER_ADMIN", id: null, email: superAdminEmail, role: "SUPER_ADMIN" }, "session", config);

      const resAll = await request(app)
        .get("/api/datasets?page=1&limit=10")
        .set("Authorization", `Bearer ${token}`);

      expect(resAll.status).toBe(200);
      expect(resAll.body.items).toHaveLength(2);
      expect(resAll.body.total).toBe(2);

      const resFiltered = await request(app)
        .get("/api/datasets?category=Finance&format=XLSX")
        .set("Authorization", `Bearer ${token}`);

      expect(resFiltered.status).toBe(200);
      expect(resFiltered.body.items).toHaveLength(1);
      expect(resFiltered.body.items[0].name).toBe("Stock Market History");
    });

    it("handles GET /api/datasets/mine for authenticated admin", async () => {
      const datasetsMap = new Map<string, DatasetRow>([
        ["d1", createDatasetRow("d1", { ownerAdminId: ownerId, name: "Mine 1" })],
        ["d2", createDatasetRow("d2", { ownerAdminId: otherOwnerId, name: "Not Mine" })]
      ]);
      const repo = createMockRepository(datasetsMap);
      const service = new DatasetService({ datasets: repo });
      const app = createApp(undefined, undefined, undefined, service);

      const adminToken = await issueAccessToken({ type: "ADMIN", id: ownerId, email: "alice@example.test", role: "ADMIN" }, "session", config);

      const res = await request(app)
        .get("/api/datasets/mine")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe("Mine 1");
    });

    it("handles GET /api/datasets/statistics/categories and /contributors", async () => {
      const datasetsMap = new Map<string, DatasetRow>([
        ["d1", createDatasetRow("d1", { category: "Business", selectedEngine: "MONGODB", contributorName: "Enterprise Admin" })]
      ]);
      const repo = createMockRepository(datasetsMap);
      const service = new DatasetService({ datasets: repo });
      const app = createApp(undefined, undefined, undefined, service);

      const token = await issueAccessToken({ type: "SUPER_ADMIN", id: null, email: superAdminEmail, role: "SUPER_ADMIN" }, "session", config);

      const catRes = await request(app)
        .get("/api/datasets/statistics/categories")
        .set("Authorization", `Bearer ${token}`);

      expect(catRes.status).toBe(200);
      expect(catRes.body.totalDatasets).toBe(1);
      expect(catRes.body.categories.Business).toBe(1);

      const contribRes = await request(app)
        .get("/api/datasets/statistics/contributors")
        .set("Authorization", `Bearer ${token}`);

      expect(contribRes.status).toBe(200);
      expect(contribRes.body.totalContributors).toBe(1);
      expect(contribRes.body.contributors[0].name).toBe("Enterprise Admin");
    });

    it("rejects unauthorized access without valid bearer token", async () => {
      const app = createApp();

      const unauth1 = await request(app).get("/api/datasets");
      expect(unauth1.status).toBe(401);

      const unauth2 = await request(app).get("/api/datasets/mine");
      expect(unauth2.status).toBe(401);

      const unauth3 = await request(app).get("/api/datasets/statistics/categories");
      expect(unauth3.status).toBe(401);
    });

    it("rejects invalid upload category in multipart form", async () => {
      const datasetsMap = new Map<string, DatasetRow>();
      const repo = createMockRepository(datasetsMap);
      const service = new DatasetService({ datasets: repo });
      const app = createApp(undefined, undefined, undefined, service);

      const token = await issueAccessToken({ type: "ADMIN", id: ownerId, email: "alice@example.test", role: "ADMIN" }, "session", config);

      const res = await request(app)
        .post("/api/datasets/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from("id,name\n1,Test\n"), { filename: "test.csv", contentType: "text/csv" })
        .field("name", "Invalid Cat Dataset")
        .field("category", "NonExistentCategory")
        .field("visibility", "PRIVATE");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
