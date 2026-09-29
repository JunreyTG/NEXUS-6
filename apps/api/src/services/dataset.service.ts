import { AuthorizationError } from "../auth/errors.js";
import { NotFoundError, UploadValidationError } from "../errors/app-error.js";
import { AdminRepository } from "../repositories/admin.repository.js";
import { DatasetRepository, matchDatabaseEngine, type DatasetFilterOptions } from "../repositories/dataset.repository.js";
import { LogService } from "../logging/log.service.js";
import type { ActivityLogger, LogActor } from "../logging/types.js";
import { DATASET_FILE_TYPES, parseDatasetFile, type DatasetFileType, type ParsedDataset } from "../uploads/parsers.js";
import { TemporaryUploadStorage } from "../uploads/storage.js";
import { DatasetAnalyzer } from "../analysis/analyzer.js";
import type { AnalysisResult } from "../analysis/types.js";

export const DATASET_CATEGORIES = [
  "Education",
  "Environment",
  "Transportation",
  "Demographics",
  "Business",
  "Finance",
  "Healthcare"
] as const;

export type DatasetCategory = typeof DATASET_CATEGORIES[number];

export function normalizeCategory(val: string | null | undefined): DatasetCategory | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim().toLowerCase();
  const match = DATASET_CATEGORIES.find((c) => c.toLowerCase() === trimmed);
  return match ?? null;
}

export function formatBytes(bytes: bigint | number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null;
  const num = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  if (num < 1024 * 1024 * 1024 * 1024) return `${(num / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(num / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
}

const engineDisplayNames: Record<string, string> = {
  MYSQL: "MySQL",
  SQLSERVER: "SQLServer",
  POSTGRESQL: "PostgreSQL",
  MONGODB: "MongoDB",
  NEO4J: "Neo4J",
  COUCHBASE: "CouchBase"
};

function isDatasetFileType(value: string | null | undefined): value is DatasetFileType {
  return (DATASET_FILE_TYPES as readonly string[]).includes(value ?? "");
}

export type DatasetActor = LogActor & {
  role: "ADMIN" | "SUPER_ADMIN";
};

export type DatasetMetadataInput = {
  name: string;
  description?: string | undefined;
  category?: DatasetCategory | string | undefined;
  targetDb?: string | undefined;
  databaseEngine?: string | undefined;
  visibility: "PRIVATE" | "PUBLIC";
  ownerAdminId?: string | undefined;
};

export type UploadedDatasetFile = {
  key: string;
  path: string;
  originalFilename: string;
  fileType: ParsedDataset["fileType"];
  size: number;
};

function safeNumber(value: bigint | null): number | string | null {
  if (value === null) return null;
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

export function serializeDataset(dataset: Record<string, unknown>) {
  const owner = dataset.owner as Record<string, unknown> | undefined;
  const contributorName = (dataset.contributorName as string | undefined) || (owner?.name as string | undefined) || "Super Admin";
  const contributorEmail = (dataset.contributorEmail as string | undefined) || (owner?.email as string | undefined) || null;
  const contributorId = (dataset.ownerAdminId as string | undefined) || (owner?.id as string | undefined) || null;
  const rawEngine = (dataset.selectedEngine as string | undefined) || (dataset.recommendedEngine as string | undefined) || null;
  const databaseEngine = rawEngine ? (engineDisplayNames[rawEngine] ?? rawEngine) : null;
  const rawSize = dataset.fileSizeBytes as bigint | number | null | undefined;

  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    category: (dataset.category as string | undefined) || "Education",
    databaseEngine,
    targetDb: databaseEngine,
    selectedEngine: dataset.selectedEngine ?? null,
    recommendedEngine: dataset.recommendedEngine ?? null,
    fileFormat: dataset.fileType,
    format: dataset.fileType,
    fileType: dataset.fileType,
    size: formatBytes(rawSize) || "0 B",
    fileSizeBytes: safeNumber(rawSize as bigint | null),
    detectedFields: dataset.detectedFields,
    recordCount: safeNumber(dataset.recordCount as bigint | null),
    visibility: dataset.visibility,
    status: dataset.status,
    ownerAdminId: dataset.ownerAdminId,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
    contributor: {
      id: contributorId,
      name: contributorName,
      email: contributorEmail
    },
    uploadedBy: contributorName,
    contributorId,
    contributorName,
    contributorEmail,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
    originalFilename: dataset.originalFilename
  };
}

export class DatasetService {
  constructor(
    private readonly dependencies: {
      datasets?: DatasetRepository;
      admins?: Pick<AdminRepository, "findById"> & { findByEmail?: (email: string) => Promise<any> };
      storage?: TemporaryUploadStorage;
      logger?: ActivityLogger;
      analyzer?: DatasetAnalyzer;
    } = {}
  ) {}

  private get datasets(): DatasetRepository {
    return this.dependencies.datasets ?? new DatasetRepository();
  }

  private get admins(): Pick<AdminRepository, "findById"> & { findByEmail?: (email: string) => Promise<any> } {
    return this.dependencies.admins ?? new AdminRepository();
  }

  private get storage(): TemporaryUploadStorage {
    return this.dependencies.storage ?? new TemporaryUploadStorage();
  }

  private get logger(): ActivityLogger {
    return this.dependencies.logger ?? new LogService();
  }

  private get analyzer(): DatasetAnalyzer {
    return this.dependencies.analyzer ?? new DatasetAnalyzer();
  }

  async upload(file: UploadedDatasetFile, input: DatasetMetadataInput, actor: DatasetActor) {
    try {
      // 1. Validate Category strictly
      const rawCategory = input.category ?? "Education";
      const validatedCategory = normalizeCategory(rawCategory);
      if (!validatedCategory) {
        throw new UploadValidationError("CATEGORY_INVALID");
      }

      // 2. Determine Contributor Identity strictly from authenticated actor
      let ownerAdminId: string | null = null;
      let contributorName = "Super Admin";
      let contributorEmail = actor.actorEmail ?? null;

      if (actor.role === "ADMIN") {
        ownerAdminId = actor.actorId!;
        const admin = await this.admins.findById(ownerAdminId);
        if (!admin) throw new NotFoundError("OWNER_NOT_FOUND");
        contributorName = admin.name;
        contributorEmail = admin.email;
      } else if (actor.role === "SUPER_ADMIN") {
        if (actor.actorEmail && this.admins.findByEmail) {
          const admin = await this.admins.findByEmail(actor.actorEmail);
          if (admin) {
            ownerAdminId = admin.id;
            contributorName = admin.name;
          }
        }
        if (!ownerAdminId && input.ownerAdminId) {
          ownerAdminId = input.ownerAdminId;
        }
      }

      const parsed = await parseDatasetFile(file.path, file.fileType);

      // Target database engine if specified
      const targetDb = input.targetDb || input.databaseEngine;
      const matchedEngine = targetDb ? matchDatabaseEngine(targetDb) : undefined;

      const dataset = await this.datasets.create({
        ownerAdminId,
        category: validatedCategory,
        contributorName,
        contributorEmail,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        originalFilename: sanitizeFilename(file.originalFilename),
        fileType: parsed.fileType,
        visibility: input.visibility,
        recordCount: BigInt(parsed.recordCount),
        fileSizeBytes: BigInt(file.size),
        detectedFields: parsed.detectedFields,
        temporaryFileKey: file.key,
        ...(matchedEngine ? { selectedEngine: matchedEngine, status: "READY" } : {})
      });

      // Operational activity log: action = UPLOAD
      await this.recordActivity({
        ...actor,
        action: "UPLOAD",
        resourceType: "DATASET",
        resourceId: dataset.id,
        success: true,
        metadata: {
          datasetId: dataset.id,
          datasetName: dataset.name,
          category: validatedCategory,
          databaseEngine: dataset.selectedEngine ?? dataset.recommendedEngine ?? matchedEngine ?? null,
          fileFormat: parsed.fileType,
          recordCount: parsed.recordCount,
          fileSizeBytes: file.size,
          contributor: contributorName
        }
      });

      // Backward-compatible log for existing test assertions
      await this.recordActivity({
        ...actor,
        action: "DATASET_UPLOAD_SUCCESS",
        resourceType: "DATASET",
        resourceId: dataset.id,
        success: true,
        metadata: {
          fileType: parsed.fileType,
          recordCount: parsed.recordCount,
          category: validatedCategory
        }
      });

      // Create system notification for successful upload if repository supports it
      if (typeof (this.datasets as any).createNotification === "function") {
        await this.datasets.createNotification({
          userId: ownerAdminId,
          title: "Dataset Uploaded",
          message: `Dataset "${dataset.name}" was uploaded successfully (${parsed.recordCount ?? 0} records).`,
          type: "SUCCESS"
        }).catch(() => undefined);
      }

      return serializeDataset(dataset as unknown as Record<string, unknown>);
    } catch (error) {
      await this.storage.remove(file.key).catch(() => undefined);
      await this.recordActivity({
        ...actor,
        action: "DATASET_UPLOAD_FAILURE",
        resourceType: "DATASET",
        success: false,
        errorCode: error instanceof UploadValidationError ? error.code : "UPLOAD_FAILED"
      });
      throw error;
    }
  }

  async list(actor: DatasetActor, options: DatasetFilterOptions = {}) {
    if (typeof (this.datasets as any).findFiltered === "function") {
      const isSuper = actor.role === "SUPER_ADMIN";
      const accessFilter = isSuper
        ? undefined
        : { allowedOwnerAdminId: actor.actorId!, allowPublic: true };

      const result = await this.datasets.findFiltered({
        ...options,
        accessFilter
      });

      const serializedItems = result.items.map((dataset) => serializeDataset(dataset as unknown as Record<string, unknown>));
      await this.recordActivity({
        ...actor,
        action: "DATASET_LIST_VIEWED",
        resourceType: "DATASET",
        success: true,
        metadata: { count: result.total, page: result.page, search: options.search, category: options.category }
      });

      return {
        items: serializedItems,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      };
    }

    const datasets = actor.role === "SUPER_ADMIN"
      ? await this.datasets.listAll()
      : await this.datasets.listByOwner(actor.actorId!);
    const serialized = datasets.map((dataset) => serializeDataset(dataset as unknown as Record<string, unknown>));
    await this.recordActivity({ ...actor, action: "DATASET_LIST_VIEWED", resourceType: "DATASET", success: true, metadata: { count: serialized.length } });
    return {
      items: serialized,
      page: 1,
      limit: serialized.length,
      total: serialized.length,
      totalPages: 1
    };
  }

  async listMine(actor: DatasetActor, options: DatasetFilterOptions = {}) {
    if (typeof (this.datasets as any).findFiltered === "function") {
      const ownerAdminId = actor.role === "ADMIN" ? actor.actorId! : undefined;
      const result = await this.datasets.findFiltered({
        ...options,
        ownerAdminId,
        accessFilter: actor.role === "ADMIN" ? { allowedOwnerAdminId: actor.actorId!, allowPublic: false } : undefined
      });

      const serializedItems = result.items.map((dataset) => serializeDataset(dataset as unknown as Record<string, unknown>));
      await this.recordActivity({
        ...actor,
        action: "DATASET_MINE_VIEWED",
        resourceType: "DATASET",
        success: true,
        metadata: { count: result.total, page: result.page }
      });

      return {
        items: serializedItems,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      };
    }

    const datasets = actor.actorId ? await this.datasets.listByOwner(actor.actorId) : await this.datasets.listAll();
    const serialized = datasets.map((dataset) => serializeDataset(dataset as unknown as Record<string, unknown>));
    return {
      items: serialized,
      page: 1,
      limit: serialized.length,
      total: serialized.length,
      totalPages: 1
    };
  }

  async listBookmarked(actor: DatasetActor, options: DatasetFilterOptions = {}) {
    if (!actor.actorId) {
      return { items: [], page: 1, limit: 25, total: 0, totalPages: 1 };
    }
    const result = await this.datasets.findBookmarked(actor.actorId, options);
    const serializedItems = result.items.map((dataset) => serializeDataset(dataset as unknown as Record<string, unknown>));
    await this.recordActivity({
      ...actor,
      action: "DATASET_BOOKMARKED_VIEWED",
      resourceType: "DATASET",
      success: true,
      metadata: { count: result.total, page: result.page }
    });
    return {
      items: serializedItems,
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages
    };
  }

  async getBookmarkedIds(actor: DatasetActor): Promise<string[]> {
    if (!actor.actorId) return [];
    return this.datasets.getBookmarkedIds(actor.actorId);
  }

  async bookmark(id: string, actor: DatasetActor): Promise<{ bookmarked: boolean }> {
    const dataset = await this.authorize(id, actor, true);
    await this.datasets.addBookmark(actor.actorId!, dataset.id);
    await this.recordActivity({
      ...actor,
      action: "DATASET_BOOKMARKED",
      resourceType: "DATASET",
      resourceId: id,
      success: true
    });
    return { bookmarked: true };
  }

  async unbookmark(id: string, actor: DatasetActor): Promise<{ bookmarked: boolean }> {
    await this.datasets.removeBookmark(actor.actorId!, id);
    await this.recordActivity({
      ...actor,
      action: "DATASET_UNBOOKMARKED",
      resourceType: "DATASET",
      resourceId: id,
      success: true
    });
    return { bookmarked: false };
  }

  async toggleBookmark(id: string, actor: DatasetActor): Promise<{ bookmarked: boolean }> {
    const isBookmarked = await this.datasets.isBookmarked(actor.actorId!, id);
    if (isBookmarked) {
      return this.unbookmark(id, actor);
    } else {
      return this.bookmark(id, actor);
    }
  }

  async listNotifications(actor: DatasetActor) {
    return this.datasets.listNotifications(actor.actorId ?? undefined);
  }

  async countUnreadNotifications(actor: DatasetActor): Promise<number> {
    return this.datasets.countUnreadNotifications(actor.actorId ?? undefined);
  }

  async markNotificationAsRead(id: string, _actor: DatasetActor): Promise<void> {
    await this.datasets.markNotificationAsRead(id);
  }

  async markAllNotificationsAsRead(actor: DatasetActor): Promise<void> {
    await this.datasets.markAllNotificationsAsRead(actor.actorId ?? undefined);
  }

  async getDashboardStats(actor: DatasetActor, days: number = 7) {
    const isSuper = actor.role === "SUPER_ADMIN";
    const accessFilter = isSuper ? undefined : { allowedOwnerAdminId: actor.actorId!, allowPublic: true };

    const resolvedLog = (this.logger && typeof (this.logger as any).getActivityTimeline === "function")
      ? (this.logger as any)
      : (this.logger instanceof LogService ? this.logger : new LogService());

    const [categoryStats, contributorStats, downloadCount, timeline] = await Promise.all([
      this.datasets.getCategoryStatistics(accessFilter),
      this.datasets.getContributorStatistics(accessFilter),
      resolvedLog.getDownloadCount().catch(() => 0),
      resolvedLog.getActivityTimeline(days).catch(() => [])
    ]);

    const activeCategoriesCount = Object.values(categoryStats.categories).filter((c) => c > 0).length;

    return {
      kpis: {
        totalDatasets: categoryStats.totalDatasets,
        totalContributors: contributorStats.totalContributors,
        categoriesCount: activeCategoriesCount || DATASET_CATEGORIES.length,
        totalDownloads: downloadCount,
        totalStorageBytes: categoryStats.totalStorageBytes ?? 0,
        totalStorageFormatted: categoryStats.totalStorageFormatted ?? "0 B"
      },
      databaseEngines: categoryStats.databaseEngines,
      databaseStorageBytes: categoryStats.databaseStorageBytes ?? { MySQL: 0, SQLServer: 0, PostgreSQL: 0, MongoDB: 0, Neo4J: 0, CouchBase: 0 },
      databaseStorage: categoryStats.databaseStorage ?? {
        MySQL: { bytes: 0, formatted: "0 B", datasets: 0 },
        SQLServer: { bytes: 0, formatted: "0 B", datasets: 0 },
        PostgreSQL: { bytes: 0, formatted: "0 B", datasets: 0 },
        MongoDB: { bytes: 0, formatted: "0 B", datasets: 0 },
        Neo4J: { bytes: 0, formatted: "0 B", datasets: 0 },
        CouchBase: { bytes: 0, formatted: "0 B", datasets: 0 }
      },
      categories: categoryStats.categories,
      categoryBreakdown: categoryStats.breakdown,
      timeline
    };
  }

  async getCategoryStatistics(actor: DatasetActor) {
    if (typeof (this.datasets as any).getCategoryStatistics === "function") {
      const isSuper = actor.role === "SUPER_ADMIN";
      const accessFilter = isSuper
        ? undefined
        : { allowedOwnerAdminId: actor.actorId!, allowPublic: true };
      const stats = await this.datasets.getCategoryStatistics(accessFilter);
      await this.recordActivity({
        ...actor,
        action: "DATASET_STATISTICS_VIEWED",
        resourceType: "DATASET",
        success: true,
        metadata: { totalDatasets: stats.totalDatasets }
      });
      return stats;
    }
    return {
      totalDatasets: 0,
      totalStorageBytes: 0,
      totalStorageFormatted: "0 B",
      categories: { Education: 0, Environment: 0, Transportation: 0, Demographics: 0, Business: 0, Finance: 0, Healthcare: 0 },
      databaseEngines: { MySQL: 0, SQLServer: 0, PostgreSQL: 0, MongoDB: 0, Neo4J: 0, CouchBase: 0 },
      databaseStorageBytes: { MySQL: 0, SQLServer: 0, PostgreSQL: 0, MongoDB: 0, Neo4J: 0, CouchBase: 0 },
      databaseStorage: {
        MySQL: { bytes: 0, formatted: "0 B", datasets: 0 },
        SQLServer: { bytes: 0, formatted: "0 B", datasets: 0 },
        PostgreSQL: { bytes: 0, formatted: "0 B", datasets: 0 },
        MongoDB: { bytes: 0, formatted: "0 B", datasets: 0 },
        Neo4J: { bytes: 0, formatted: "0 B", datasets: 0 },
        CouchBase: { bytes: 0, formatted: "0 B", datasets: 0 }
      },
      breakdown: []
    };
  }

  async getContributorStatistics(actor: DatasetActor) {
    if (typeof (this.datasets as any).getContributorStatistics === "function") {
      const isSuper = actor.role === "SUPER_ADMIN";
      const accessFilter = isSuper
        ? undefined
        : { allowedOwnerAdminId: actor.actorId!, allowPublic: true };
      const stats = await this.datasets.getContributorStatistics(accessFilter);
      await this.recordActivity({
        ...actor,
        action: "DATASET_CONTRIBUTORS_VIEWED",
        resourceType: "DATASET",
        success: true,
        metadata: { totalContributors: stats.totalContributors }
      });
      return stats;
    }
    return { totalContributors: 0, contributors: [], recentActivity: [] };
  }

  async get(id: string, actor: DatasetActor) {
    const dataset = await this.authorize(id, actor, true);
    await this.recordActivity({ ...actor, action: "DATASET_VIEWED", resourceType: "DATASET", resourceId: id, success: true });
    return serializeDataset(dataset as unknown as Record<string, unknown>);
  }

  async update(id: string, input: { name?: string | undefined; description?: string | undefined; visibility?: "PRIVATE" | "PUBLIC" | undefined }, actor: DatasetActor) {
    await this.authorize(id, actor);
    const dataset = await this.datasets.updateMetadata(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {})
    });
    await this.recordActivity({ ...actor, action: "DATASET_METADATA_UPDATED", resourceType: "DATASET", resourceId: id, success: true });
    return serializeDataset(dataset as unknown as Record<string, unknown>);
  }

  async delete(id: string, actor: DatasetActor): Promise<void> {
    const dataset = await this.authorize(id, actor);
    await this.datasets.delete(id);
    await this.storage.remove(dataset.temporaryFileKey as string | null | undefined).catch(() => undefined);
    await this.recordActivity({ ...actor, action: "DATASET_DELETED", resourceType: "DATASET", resourceId: id, success: true });
  }

  async recordUploadFailure(actor: DatasetActor, errorCode: string): Promise<void> {
    await this.recordActivity({ ...actor, action: "DATASET_UPLOAD_FAILURE", success: false, errorCode });
  }

  async analyze(id: string, actor: DatasetActor): Promise<AnalysisResult> {
    const dataset = await this.authorize(id, actor);
    const fileType = dataset.fileType;
    const temporaryFileKey = dataset.temporaryFileKey;
    if (!isDatasetFileType(fileType) || !temporaryFileKey) throw new UploadValidationError("ANALYSIS_FILE_UNAVAILABLE");
    await this.datasets.beginAnalysis(id);
    await this.recordActivity({ ...actor, action: "DATASET_ANALYSIS_STARTED", resourceType: "DATASET", resourceId: id, success: true });
    try {
      const result = await this.analyzer.analyze(this.storage.resolve(temporaryFileKey), fileType);
      await this.datasets.saveAnalysis(id, result);
      await this.recordActivity({ ...actor, action: "DATASET_ANALYSIS_COMPLETED", resourceType: "DATASET", resourceId: id, success: true, metadata: { classification: result.classification, recommendedEngine: result.recommendedEngine, analyzedRecordCount: result.characteristics.analyzedRecordCount } });
      return result;
    } catch (error) {
      await this.datasets.markAnalysisFailed(id).catch(() => undefined);
      await this.recordActivity({ ...actor, action: "DATASET_ANALYSIS_FAILED", resourceType: "DATASET", resourceId: id, success: false, errorCode: error instanceof UploadValidationError ? error.code : "ANALYSIS_FAILED" });
      throw error;
    }
  }

  async getAnalysis(id: string, actor: DatasetActor) {
    await this.authorize(id, actor, true);
    const analysis = await this.datasets.getAnalysis(id);
    if (!analysis) throw new NotFoundError("DATASET_ANALYSIS_NOT_FOUND");
    await this.recordActivity({ ...actor, action: "DATASET_ANALYSIS_VIEWED", resourceType: "DATASET", resourceId: id, success: true });
    return {
      id: analysis.id,
      datasetId: analysis.datasetId,
      analysis: analysis.analysis,
      recommendationScores: analysis.recommendationScores,
      recommendationReason: analysis.recommendationReason,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt
    };
  }

  private async authorize(id: string, actor: DatasetActor, allowPublic = false) {
    const dataset = await this.datasets.findById(id);
    if (!dataset) throw new NotFoundError("DATASET_NOT_FOUND");
    if (actor.role === "ADMIN") {
      const isOwner = dataset.ownerAdminId === actor.actorId;
      const isPublic = allowPublic && dataset.visibility === "PUBLIC";
      if (!isOwner && !isPublic) {
        await this.recordActivity({ ...actor, action: "DATASET_OWNERSHIP_DENIED", resourceType: "DATASET", resourceId: id, success: false, errorCode: "FORBIDDEN" });
        throw new AuthorizationError();
      }
    }
    return dataset;
  }


  private async recordActivity(input: Parameters<ActivityLogger["recordDatasetActivity"]>[0]): Promise<void> {
    try {
      await this.logger.recordDatasetActivity(input);
    } catch {
      // Logging failure must not interrupt dataset operations.
    }
  }
}

function sanitizeFilename(filename: string): string {
  return [...filename].map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || character === "\\" || character === "/" ? "_" : character;
  }).join("").slice(0, 255);
}
