import type { PrismaClient, DatabaseEngine, Prisma } from "../generated/prisma/client.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";
import { databaseOperation, databaseWriteOperation } from "../errors/database-error.js";
import type { AnalysisResult } from "../analysis/types.js";
import type { StorageDescriptor } from "../database/types.js";

const ownerSelect = { id: true, name: true, email: true } as const;

const datasetInclude = { owner: { select: ownerSelect } } as const;

export function matchDatabaseEngine(str: string): DatabaseEngine | null {
  const s = str.trim().toUpperCase().replace(/[\s_-]/g, "");
  if (s.includes("MYSQL")) return "MYSQL";
  if (s.includes("SQLSERVER") || s.includes("MSSQL")) return "SQLSERVER";
  if (s.includes("POSTGRES")) return "POSTGRESQL";
  if (s.includes("MONGO")) return "MONGODB";
  if (s.includes("NEO4J") || s.includes("NEO4")) return "NEO4J";
  if (s.includes("COUCHBASE") || s.includes("COUCH")) return "COUCHBASE";
  return null;
}

export type DatasetCreateData = {
  ownerAdminId?: string | null | undefined;
  category?: string | undefined;
  contributorName?: string | null | undefined;
  contributorEmail?: string | null | undefined;
  name: string;
  description?: string | null | undefined;
  originalFilename: string;
  fileType: string;
  visibility: "PRIVATE" | "PUBLIC";
  recordCount: bigint;
  fileSizeBytes: bigint;
  detectedFields: string[];
  temporaryFileKey: string;
  selectedEngine?: DatabaseEngine | null | undefined;
  recommendedEngine?: DatabaseEngine | null | undefined;
};

export type DatasetFilterOptions = {
  search?: string | undefined;
  category?: string | undefined;
  database?: string | undefined;
  format?: string | undefined;
  contributorId?: string | undefined;
  contributor?: string | undefined;
  ownerAdminId?: string | undefined;
  visibility?: "PRIVATE" | "PUBLIC" | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  date?: string | Date | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: "asc" | "desc" | undefined;
  datasetIds?: string[] | undefined;
  accessFilter?: {
    allowedOwnerAdminId?: string | null | undefined;
    allowPublic?: boolean | undefined;
  } | undefined;
};

export class DatasetRepository {
  constructor(private readonly database: () => Pick<PrismaClient, "dataset" | "datasetAnalysis" | "datasetLocation" | "bookmark" | "notification"> = getSystemDatabase) {}

  findById(id: string) {
    return databaseOperation(() => this.database().dataset.findUnique({ where: { id }, include: datasetInclude }));
  }

  findOwnedById(id: string, ownerAdminId: string) {
    return databaseOperation(() => this.database().dataset.findFirst({ where: { id, ownerAdminId }, include: datasetInclude }));
  }

  listByOwner(ownerAdminId: string) {
    return databaseOperation(() => this.database().dataset.findMany({
      where: { ownerAdminId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, include: datasetInclude
    }));
  }

  listAll() {
    return databaseOperation(() => this.database().dataset.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, include: datasetInclude
    }));
  }

  listPublic() {
    return databaseOperation(() => this.database().dataset.findMany({
      where: { visibility: "PUBLIC" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, include: datasetInclude
    }));
  }

  findPublicById(id: string) {
    return databaseOperation(() => this.database().dataset.findFirst({ where: { id, visibility: "PUBLIC" }, include: datasetInclude }));
  }

  countPublic() {
    return databaseOperation(() => this.database().dataset.count({ where: { visibility: "PUBLIC" } }));
  }

  create(data: DatasetCreateData) {
    return databaseWriteOperation(() => this.database().dataset.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        category: data.category ?? "Education",
        contributorName: data.contributorName ?? null,
        contributorEmail: data.contributorEmail ?? null,
        originalFilename: data.originalFilename,
        fileType: data.fileType,
        visibility: data.visibility,
        recordCount: data.recordCount,
        fileSizeBytes: data.fileSizeBytes,
        detectedFields: data.detectedFields,
        temporaryFileKey: data.temporaryFileKey,
        ...(data.ownerAdminId ? { ownerAdminId: data.ownerAdminId } : {}),
        ...(data.selectedEngine ? { selectedEngine: data.selectedEngine, status: "READY" } : {})
      },
      include: datasetInclude
    }));
  }

  async findFiltered(options: DatasetFilterOptions = {}) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const skip = (page - 1) * limit;

    const andConditions: Prisma.DatasetWhereInput[] = [];

    // Security access control
    if (options.accessFilter) {
      const accessOr: Prisma.DatasetWhereInput[] = [];
      if (options.accessFilter.allowedOwnerAdminId) {
        accessOr.push({ ownerAdminId: options.accessFilter.allowedOwnerAdminId });
      }
      if (options.accessFilter.allowPublic !== false) {
        accessOr.push({ visibility: "PUBLIC" });
      }
      if (accessOr.length > 0) {
        andConditions.push({ OR: accessOr });
      }
    }

    // Specific owner filter (e.g. for /mine)
    if (options.ownerAdminId) {
      andConditions.push({ ownerAdminId: options.ownerAdminId });
    }

    // Specific dataset IDs filter (e.g. for bookmarks)
    if (options.datasetIds) {
      andConditions.push({ id: { in: options.datasetIds } });
    }

    // Visibility filter
    if (options.visibility) {
      andConditions.push({ visibility: options.visibility });
    }

    // Category filter (case-insensitive)
    if (options.category) {
      andConditions.push({ category: { equals: options.category, mode: "insensitive" } });
    }

    // Format / FileType filter (e.g. CSV, JSON, XLSX)
    if (options.format) {
      andConditions.push({ fileType: { equals: options.format.toUpperCase(), mode: "insensitive" } });
    }

    // Database Engine filter
    if (options.database) {
      const engine = matchDatabaseEngine(options.database);
      if (engine) {
        const engineOr: Prisma.DatasetWhereInput[] = [
          { selectedEngine: engine },
          { AND: [{ selectedEngine: null }, { recommendedEngine: engine }] }
        ];
        if (engine === "POSTGRESQL") {
          engineOr.push({ AND: [{ selectedEngine: null }, { recommendedEngine: null }] });
        }
        andConditions.push({ OR: engineOr });
      }
    }

    // Contributor filter (ID, name, or email)
    if (options.contributorId) {
      andConditions.push({
        OR: [
          { ownerAdminId: options.contributorId },
          { contributorName: { equals: options.contributorId, mode: "insensitive" } },
          { contributorEmail: { equals: options.contributorId, mode: "insensitive" } }
        ]
      });
    } else if (options.contributor) {
      andConditions.push({
        OR: [
          { contributorName: { contains: options.contributor, mode: "insensitive" } },
          { contributorEmail: { contains: options.contributor, mode: "insensitive" } },
          { owner: { name: { contains: options.contributor, mode: "insensitive" } } },
          { owner: { email: { contains: options.contributor, mode: "insensitive" } } }
        ]
      });
    }

    // Date filters
    if (options.date) {
      const d = new Date(options.date);
      if (!isNaN(d.getTime())) {
        const start = new Date(d);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setUTCHours(23, 59, 59, 999);
        andConditions.push({ createdAt: { gte: start, lte: end } });
      }
    } else {
      if (options.startDate || options.endDate) {
        const dateCondition: { gte?: Date; lte?: Date } = {};
        if (options.startDate) dateCondition.gte = options.startDate;
        if (options.endDate) dateCondition.lte = options.endDate;
        andConditions.push({ createdAt: dateCondition });
      }
    }

    // Search filter across multiple fields
    if (options.search && options.search.trim()) {
      const s = options.search.trim();
      const searchOr: Prisma.DatasetWhereInput[] = [
        { name: { contains: s, mode: "insensitive" } },
        { description: { contains: s, mode: "insensitive" } },
        { category: { contains: s, mode: "insensitive" } },
        { fileType: { contains: s, mode: "insensitive" } },
        { contributorName: { contains: s, mode: "insensitive" } },
        { contributorEmail: { contains: s, mode: "insensitive" } },
        { owner: { name: { contains: s, mode: "insensitive" } } },
        { owner: { email: { contains: s, mode: "insensitive" } } }
      ];

      const engineMatch = matchDatabaseEngine(s);
      if (engineMatch) {
        searchOr.push(
          { selectedEngine: engineMatch },
          { recommendedEngine: engineMatch }
        );
      }

      andConditions.push({ OR: searchOr });
    }

    const where: Prisma.DatasetWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    // Sorting
    const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";
    let orderBy: Prisma.DatasetOrderByWithRelationInput[] = [{ createdAt: sortOrder }, { id: sortOrder }];
    if (options.sortBy) {
      const key = options.sortBy.toLowerCase();
      if (key === "name") orderBy = [{ name: sortOrder }, { id: sortOrder }];
      else if (key === "category") orderBy = [{ category: sortOrder }, { id: sortOrder }];
      else if (key === "created" || key === "createdat" || key === "date") orderBy = [{ createdAt: sortOrder }, { id: sortOrder }];
      else if (key === "updated" || key === "updatedat") orderBy = [{ updatedAt: sortOrder }, { id: sortOrder }];
      else if (key === "size" || key === "filesizebytes") orderBy = [{ fileSizeBytes: sortOrder }, { id: sortOrder }];
      else if (key === "records" || key === "recordcount") orderBy = [{ recordCount: sortOrder }, { id: sortOrder }];
      else if (key === "contributor" || key === "uploadedby") orderBy = [{ contributorName: sortOrder }, { id: sortOrder }];
    }

    return databaseOperation(async () => {
      const db = this.database();
      const [items, total] = await Promise.all([
        db.dataset.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: datasetInclude
        }),
        db.dataset.count({ where })
      ]);
      const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);
      return { items, page, limit, total, totalPages };
    });
  }

  async getCategoryStatistics(accessFilter?: { allowedOwnerAdminId?: string | null; allowPublic?: boolean }) {
    const andConditions: Prisma.DatasetWhereInput[] = [];
    if (accessFilter) {
      const accessOr: Prisma.DatasetWhereInput[] = [];
      if (accessFilter.allowedOwnerAdminId) accessOr.push({ ownerAdminId: accessFilter.allowedOwnerAdminId });
      if (accessFilter.allowPublic !== false) accessOr.push({ visibility: "PUBLIC" });
      if (accessOr.length > 0) andConditions.push({ OR: accessOr });
    }
    const where: Prisma.DatasetWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    return databaseOperation(async () => {
      const db = this.database();
      const allDatasets = await db.dataset.findMany({
        where,
        select: {
          id: true,
          category: true,
          selectedEngine: true,
          recommendedEngine: true,
          fileSizeBytes: true
        }
      });

      const categories: Record<string, number> = {
        Education: 0,
        Environment: 0,
        Transportation: 0,
        Demographics: 0,
        Business: 0,
        Finance: 0,
        Healthcare: 0
      };

      const databaseEngines: Record<string, number> = {
        MySQL: 0,
        SQLServer: 0,
        PostgreSQL: 0,
        MongoDB: 0,
        Neo4J: 0,
        CouchBase: 0
      };

      const databaseStorageBytes: Record<string, number> = {
        MySQL: 0,
        SQLServer: 0,
        PostgreSQL: 0,
        MongoDB: 0,
        Neo4J: 0,
        CouchBase: 0
      };

      const engineNameMap: Record<string, string> = {
        MYSQL: "MySQL",
        SQLSERVER: "SQLServer",
        POSTGRESQL: "PostgreSQL",
        MONGODB: "MongoDB",
        NEO4J: "Neo4J",
        COUCHBASE: "CouchBase"
      };

      let totalStorageBytes = 0;

      for (const ds of allDatasets) {
        if (ds.category) {
          const currentCount = categories[ds.category];
          if (currentCount !== undefined) {
            categories[ds.category] = currentCount + 1;
          } else {
            const matched = Object.keys(categories).find(k => k.toLowerCase() === ds.category.toLowerCase());
            if (matched) {
              const matchedCount = categories[matched];
              categories[matched] = (matchedCount !== undefined ? matchedCount : 0) + 1;
            } else {
              categories[ds.category] = 1;
            }
          }
        }

        const sizeBytes = Number(ds.fileSizeBytes ?? 0);
        totalStorageBytes += sizeBytes;

        const engine = ds.selectedEngine ?? ds.recommendedEngine ?? "POSTGRESQL";
        if (engine && engineNameMap[engine]) {
          const mappedName = engineNameMap[engine];
          if (mappedName) {
            const currentEngineCount = databaseEngines[mappedName];
            databaseEngines[mappedName] = (currentEngineCount !== undefined ? currentEngineCount : 0) + 1;
            const currentEngineBytes = databaseStorageBytes[mappedName];
            databaseStorageBytes[mappedName] = (currentEngineBytes !== undefined ? currentEngineBytes : 0) + sizeBytes;
          }
        }
      }

      const formatStorageBytes = (bytes: number): string => {
        if (!bytes || bytes <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, i);
        return `${i === 0 ? Math.round(value) : Number(value.toFixed(1))} ${units[i]}`;
      };

      const databaseStorage: Record<string, { bytes: number; formatted: string; datasets: number }> = {};
      for (const dbName of Object.keys(databaseEngines)) {
        const bytes = databaseStorageBytes[dbName] ?? 0;
        databaseStorage[dbName] = {
          bytes,
          formatted: formatStorageBytes(bytes),
          datasets: databaseEngines[dbName] ?? 0
        };
      }

      const total = allDatasets.length;
      const breakdown = Object.entries(categories).map(([category, count]) => ({
        category,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
      }));

      return {
        totalDatasets: total,
        totalStorageBytes,
        totalStorageFormatted: formatStorageBytes(totalStorageBytes),
        categories,
        databaseEngines,
        databaseStorageBytes,
        databaseStorage,
        breakdown
      };
    });
  }

  async getContributorStatistics(accessFilter?: { allowedOwnerAdminId?: string | null; allowPublic?: boolean }) {
    const andConditions: Prisma.DatasetWhereInput[] = [];
    if (accessFilter) {
      const accessOr: Prisma.DatasetWhereInput[] = [];
      if (accessFilter.allowedOwnerAdminId) accessOr.push({ ownerAdminId: accessFilter.allowedOwnerAdminId });
      if (accessFilter.allowPublic !== false) accessOr.push({ visibility: "PUBLIC" });
      if (accessOr.length > 0) andConditions.push({ OR: accessOr });
    }
    const where: Prisma.DatasetWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    return databaseOperation(async () => {
      const db = this.database();
      const datasets = await db.dataset.findMany({
        where,
        select: {
          id: true,
          name: true,
          category: true,
          ownerAdminId: true,
          contributorName: true,
          contributorEmail: true,
          createdAt: true,
          owner: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: [{ createdAt: "desc" }]
      });

      const contributorMap = new Map<string, {
        id: string | null;
        name: string;
        email: string | null;
        datasetCount: number;
        lastActiveAt: Date;
      }>();

      for (const ds of datasets) {
        const id = ds.ownerAdminId ?? ds.owner?.id ?? null;
        const name = ds.contributorName ?? ds.owner?.name ?? "Super Admin";
        const email = ds.contributorEmail ?? ds.owner?.email ?? null;
        const key = id ?? name;

        const existing = contributorMap.get(key);
        if (existing) {
          existing.datasetCount++;
          if (ds.createdAt > existing.lastActiveAt) {
            existing.lastActiveAt = ds.createdAt;
          }
        } else {
          contributorMap.set(key, {
            id,
            name,
            email,
            datasetCount: 1,
            lastActiveAt: ds.createdAt
          });
        }
      }

      const contributors = Array.from(contributorMap.values()).sort((a, b) => b.datasetCount - a.datasetCount);
      const recentActivity = datasets.slice(0, 10).map((ds) => ({
        datasetId: ds.id,
        datasetName: ds.name,
        category: ds.category,
        contributorId: ds.ownerAdminId ?? ds.owner?.id ?? null,
        contributorName: ds.contributorName ?? ds.owner?.name ?? "Super Admin",
        timestamp: ds.createdAt
      }));

      return {
        totalContributors: contributors.length,
        contributors,
        recentActivity
      };
    });
  }

  updateMetadata(id: string, data: { name?: string; description?: string | null; visibility?: "PRIVATE" | "PUBLIC" }) {
    return databaseWriteOperation(() => this.database().dataset.update({ where: { id }, data, include: datasetInclude }));
  }

  getAnalysis(datasetId: string) {
    return databaseOperation(() => this.database().datasetAnalysis.findUnique({ where: { datasetId } }));
  }

  beginAnalysis(datasetId: string) {
    return databaseWriteOperation(() => this.database().dataset.update({ where: { id: datasetId }, data: { status: "ANALYZING" } }));
  }

  saveAnalysis(datasetId: string, result: AnalysisResult) {
    return databaseWriteOperation(async () => {
      const database = this.database();
      const analysis = await database.datasetAnalysis.upsert({
        where: { datasetId },
        update: {
          analysis: JSON.parse(JSON.stringify({ classification: result.classification, recommendedEngine: result.recommendedEngine, compatibleEngines: result.compatibleEngines, ...result.characteristics })),
          recommendationScores: JSON.parse(JSON.stringify(result.scores)),
          recommendationReason: result.reasons.join("\n")
        },
        create: {
          datasetId,
          analysis: JSON.parse(JSON.stringify({ classification: result.classification, recommendedEngine: result.recommendedEngine, compatibleEngines: result.compatibleEngines, ...result.characteristics })),
          recommendationScores: JSON.parse(JSON.stringify(result.scores)),
          recommendationReason: result.reasons.join("\n")
        }
      });
      await database.dataset.update({
        where: { id: datasetId },
        data: {
          classification: result.classification,
          recommendedEngine: result.recommendedEngine,
          status: "ANALYZED"
        }
      });
      return analysis;
    });
  }

  markAnalysisFailed(datasetId: string) {
    return databaseWriteOperation(() => this.database().dataset.update({ where: { id: datasetId }, data: { status: "FAILED" } }));
  }

  createLocation(datasetId: string, descriptor: StorageDescriptor) {
    return databaseWriteOperation(() => this.database().datasetLocation.create({
      data: {
        datasetId,
        engine: descriptor.engine,
        storageType: descriptor.storageType,
        storageIdentifier: descriptor.storageIdentifier,
        ...(descriptor.databaseName ? { databaseName: descriptor.databaseName } : {}),
        ...(descriptor.namespace ? { namespace: descriptor.namespace } : {}),
        ...(descriptor.tableOrCollection ? { tableOrCollection: descriptor.tableOrCollection } : {})
      }
    }));
  }

  getLocation(datasetId: string) {
    return databaseOperation(() => this.database().datasetLocation.findUnique({ where: { datasetId } }));
  }

  markStorageReady(datasetId: string, engine: StorageDescriptor["engine"]) {
    return databaseWriteOperation(() => this.database().dataset.update({ where: { id: datasetId }, data: { selectedEngine: engine, status: "READY" } }));
  }

  async delete(id: string): Promise<void> {
    await databaseWriteOperation(async () => {
      const database = this.database();
      await database.datasetAnalysis.deleteMany({ where: { datasetId: id } });
      await database.datasetLocation.deleteMany({ where: { datasetId: id } });
      await database.dataset.delete({ where: { id } });
    });
  }

  // ==========================================
  // Bookmarks
  // ==========================================
  async addBookmark(userId: string, datasetId: string): Promise<void> {
    await databaseWriteOperation(async () => {
      await this.database().bookmark.upsert({
        where: { userId_datasetId: { userId, datasetId } },
        create: { userId, datasetId },
        update: {}
      });
    });
  }

  async removeBookmark(userId: string, datasetId: string): Promise<void> {
    await databaseWriteOperation(async () => {
      await this.database().bookmark.deleteMany({
        where: { userId, datasetId }
      });
    });
  }

  async isBookmarked(userId: string, datasetId: string): Promise<boolean> {
    return databaseOperation(async () => {
      const b = await this.database().bookmark.findUnique({
        where: { userId_datasetId: { userId, datasetId } }
      });
      return Boolean(b);
    });
  }

  async getBookmarkedIds(userId: string): Promise<string[]> {
    return databaseOperation(async () => {
      const bookmarks = await this.database().bookmark.findMany({
        where: { userId },
        select: { datasetId: true }
      });
      return bookmarks.map((b) => b.datasetId);
    });
  }

  async findBookmarked(userId: string, options: DatasetFilterOptions = {}) {
    const bookmarkedIds = await this.getBookmarkedIds(userId);
    if (bookmarkedIds.length === 0) {
      return {
        items: [],
        page: options.page ?? 1,
        limit: options.limit ?? 10,
        total: 0,
        totalPages: 0
      };
    }
    return this.findFiltered({
      ...options,
      datasetIds: bookmarkedIds
    });
  }

  // ==========================================
  // Notifications
  // ==========================================
  async listNotifications(userId?: string) {
    return databaseOperation(async () => {
      const where: Prisma.NotificationWhereInput = userId
        ? { OR: [{ userId }, { userId: null }] }
        : {};
      return this.database().notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 20
      });
    });
  }

  async countUnreadNotifications(userId?: string): Promise<number> {
    return databaseOperation(async () => {
      const where: Prisma.NotificationWhereInput = userId
        ? { OR: [{ userId }, { userId: null }], read: false }
        : { read: false };
      return this.database().notification.count({ where });
    });
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await databaseWriteOperation(async () => {
      await this.database().notification.updateMany({
        where: { id },
        data: { read: true }
      });
    });
  }

  async markAllNotificationsAsRead(userId?: string): Promise<void> {
    await databaseWriteOperation(async () => {
      const where: Prisma.NotificationWhereInput = userId
        ? { OR: [{ userId }, { userId: null }], read: false }
        : { read: false };
      await this.database().notification.updateMany({
        where,
        data: { read: true }
      });
    });
  }

  async createNotification(data: { userId?: string | null; title: string; message: string; type?: string }): Promise<any> {
    return databaseWriteOperation(async () => {
      return this.database().notification.create({
        data: {
          userId: data.userId ?? null,
          title: data.title,
          message: data.message,
          type: data.type ?? "INFO"
        }
      });
    });
  }
}

