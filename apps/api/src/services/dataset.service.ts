import { AuthorizationError } from "../auth/errors.js";
import { NotFoundError, UploadValidationError } from "../errors/app-error.js";
import { AdminRepository } from "../repositories/admin.repository.js";
import { DatasetRepository } from "../repositories/dataset.repository.js";
import { LogService } from "../logging/log.service.js";
import type { ActivityLogger, LogActor } from "../logging/types.js";
import { DATASET_FILE_TYPES, parseDatasetFile, type DatasetFileType, type ParsedDataset } from "../uploads/parsers.js";
import { TemporaryUploadStorage } from "../uploads/storage.js";
import { DatasetAnalyzer } from "../analysis/analyzer.js";
import type { AnalysisResult } from "../analysis/types.js";

function isDatasetFileType(value: string | null | undefined): value is DatasetFileType {
  return (DATASET_FILE_TYPES as readonly string[]).includes(value ?? "");
}

export type DatasetActor = LogActor & {
  role: "ADMIN" | "SUPER_ADMIN";
};

export type DatasetMetadataInput = {
  name: string;
  description?: string | undefined;
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

function serializeDataset(dataset: Record<string, unknown>) {
  const owner = dataset.owner as Record<string, unknown> | undefined;
  return {
    id: dataset.id,
    ownerAdminId: dataset.ownerAdminId,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
    name: dataset.name,
    description: dataset.description,
    originalFilename: dataset.originalFilename,
    fileType: dataset.fileType,
    fileSizeBytes: safeNumber(dataset.fileSizeBytes as bigint | null),
    detectedFields: dataset.detectedFields,
    recordCount: safeNumber(dataset.recordCount as bigint | null),
    visibility: dataset.visibility,
    status: dataset.status,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt
  };
}

export class DatasetService {
  constructor(
    private readonly dependencies: {
      datasets?: DatasetRepository;
      admins?: Pick<AdminRepository, "findById">;
      storage?: TemporaryUploadStorage;
      logger?: ActivityLogger;
      analyzer?: DatasetAnalyzer;
    } = {}
  ) {}

  private get datasets(): DatasetRepository {
    return this.dependencies.datasets ?? new DatasetRepository();
  }

  private get admins(): Pick<AdminRepository, "findById"> {
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
      const ownerAdminId = actor.role === "ADMIN" ? actor.actorId : input.ownerAdminId;
      if (!ownerAdminId) throw new UploadValidationError("OWNER_REQUIRED");
      if (!(await this.admins.findById(ownerAdminId))) throw new NotFoundError("OWNER_NOT_FOUND");
      const parsed = await parseDatasetFile(file.path, file.fileType);
      const dataset = await this.datasets.create({
        ownerAdminId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        originalFilename: sanitizeFilename(file.originalFilename),
        fileType: parsed.fileType,
        visibility: input.visibility,
        recordCount: BigInt(parsed.recordCount),
        fileSizeBytes: BigInt(file.size),
        detectedFields: parsed.detectedFields,
        temporaryFileKey: file.key
      });
      await this.recordActivity({ ...actor, action: "DATASET_UPLOAD_SUCCESS", resourceType: "DATASET", resourceId: dataset.id, success: true, metadata: { fileType: parsed.fileType, recordCount: parsed.recordCount } });
      return serializeDataset(dataset as unknown as Record<string, unknown>);
    } catch (error) {
      await this.storage.remove(file.key).catch(() => undefined);
      await this.recordActivity({ ...actor, action: "DATASET_UPLOAD_FAILURE", resourceType: "DATASET", success: false, errorCode: error instanceof UploadValidationError ? error.code : "UPLOAD_FAILED" });
      throw error;
    }
  }

  async list(actor: DatasetActor) {
    const datasets = actor.role === "SUPER_ADMIN"
      ? await this.datasets.listAll()
      : await this.datasets.listByOwner(actor.actorId!);
    return datasets.map((dataset) => serializeDataset(dataset as unknown as Record<string, unknown>));
  }

  async get(id: string, actor: DatasetActor) {
    const dataset = await this.authorize(id, actor);
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
    await this.authorize(id, actor);
    const analysis = await this.datasets.getAnalysis(id);
    if (!analysis) throw new NotFoundError("DATASET_ANALYSIS_NOT_FOUND");
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

  private async authorize(id: string, actor: DatasetActor) {
    const dataset = await this.datasets.findById(id);
    if (!dataset) throw new NotFoundError("DATASET_NOT_FOUND");
    if (actor.role === "ADMIN" && dataset.ownerAdminId !== actor.actorId) {
      await this.recordActivity({ ...actor, action: "DATASET_OWNERSHIP_DENIED", resourceType: "DATASET", resourceId: id, success: false, errorCode: "FORBIDDEN" });
      throw new AuthorizationError();
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
