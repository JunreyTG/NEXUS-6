import { AuthorizationError } from "../auth/errors.js";
import { DatasetStorageUnavailableError } from "../database/errors.js";
import { DatabaseRouter } from "../database/router.js";
import type { DatabaseRecord, DatabaseValue } from "../database/types.js";
import { NotFoundError, RecordValidationError } from "../errors/app-error.js";
import type { ActivityLogger, LogActor } from "../logging/types.js";
import { DatasetRepository } from "../repositories/dataset.repository.js";

export type RecordActor = LogActor & { role: "ADMIN" | "SUPER_ADMIN" };
type RecordQueryInput = { page: number; pageSize: number; sortBy?: string | undefined; sortDirection?: "asc" | "desc" | undefined; search?: string | undefined };

const protectedFields = new Set(["datasetId", "ownerAdminId", "storageIdentifier", "databaseName", "namespace", "tableOrCollection", "connectionString", "credentials", "password", "host", "port", "query", "sql", "cypher", "command", "__proto__", "prototype", "constructor"]);

function safeFieldName(field: string): boolean {
  return /^[A-Za-z0-9_$.[\]-]+$/.test(field) && field.length <= 200;
}

function toDatabaseValue(value: unknown, depth = 0): DatabaseValue {
  if (depth > 10 || value === undefined || typeof value === "function" || typeof value === "symbol") throw new RecordValidationError();
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RecordValidationError();
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toDatabaseValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, DatabaseValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (!safeFieldName(key) || protectedFields.has(key)) throw new RecordValidationError("RECORD_FIELD_NOT_ALLOWED");
      result[key] = toDatabaseValue(child, depth + 1);
    }
    return result;
  }
  throw new RecordValidationError();
}

function parseRecord(value: unknown): DatabaseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecordValidationError();
  const parsed = toDatabaseValue(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new RecordValidationError();
  if (Object.keys(parsed).length > 100) throw new RecordValidationError("RECORD_TOO_LARGE");
  return parsed;
}

export class DatasetRecordService {
  constructor(
    private readonly dependencies: {
      datasets?: DatasetRepository;
      router?: DatabaseRouter;
      logger?: ActivityLogger;
    } = {}
  ) {}

  private get datasets(): DatasetRepository { return this.dependencies.datasets ?? new DatasetRepository(); }
  private get router(): DatabaseRouter { return this.dependencies.router ?? new DatabaseRouter(); }

  async list(datasetId: string, query: RecordQueryInput, actor: RecordActor) {
    const context = await this.context(datasetId, actor);
    return this.router.getAdapter(context.dataset.selectedEngine!).listRecords({ ...context.storage, ...query });
  }

  async get(datasetId: string, recordId: string, actor: RecordActor) {
    const context = await this.context(datasetId, actor);
    const record = await this.router.getAdapter(context.dataset.selectedEngine!).getRecord({ ...context.storage, recordId });
    if (!record) throw new NotFoundError("RECORD_NOT_FOUND");
    return record;
  }

  async create(datasetId: string, input: unknown, actor: RecordActor) {
    const context = await this.context(datasetId, actor);
    const record = parseRecord(input);
    try {
      const result = await this.router.getAdapter(context.dataset.selectedEngine!).insertRecord({ ...context.storage, record });
      await this.recordActivity(actor, "RECORD_CREATE", datasetId, true, { fieldCount: Object.keys(record).length });
      return result;
    } catch (error) {
      await this.recordActivity(actor, "RECORD_CREATE", datasetId, false, undefined, error instanceof Error ? error.name : "RECORD_CREATE_FAILED");
      throw error;
    }
  }

  async update(datasetId: string, recordId: string, input: unknown, actor: RecordActor) {
    const context = await this.context(datasetId, actor);
    const record = parseRecord(input);
    try {
      const result = await this.router.getAdapter(context.dataset.selectedEngine!).updateRecord({ ...context.storage, recordId, record });
      await this.recordActivity(actor, "RECORD_UPDATE", datasetId, true, { fieldCount: Object.keys(record).length });
      return result;
    } catch (error) {
      await this.recordActivity(actor, "RECORD_UPDATE", datasetId, false, undefined, error instanceof Error ? error.name : "RECORD_UPDATE_FAILED");
      throw error;
    }
  }

  async delete(datasetId: string, recordId: string, actor: RecordActor): Promise<void> {
    const context = await this.context(datasetId, actor);
    try {
      await this.router.getAdapter(context.dataset.selectedEngine!).deleteRecord({ ...context.storage, recordId });
      await this.recordActivity(actor, "RECORD_DELETE", datasetId, true);
    } catch (error) {
      await this.recordActivity(actor, "RECORD_DELETE", datasetId, false, undefined, error instanceof Error ? error.name : "RECORD_DELETE_FAILED");
      throw error;
    }
  }

  private async context(datasetId: string, actor: RecordActor) {
    const dataset = await this.datasets.findById(datasetId);
    if (!dataset) throw new NotFoundError("DATASET_NOT_FOUND");
    if (actor.role === "ADMIN" && dataset.ownerAdminId !== actor.actorId) throw new AuthorizationError();
    const location = await this.datasets.getLocation(datasetId);
    if (!dataset.selectedEngine || !location) throw new DatasetStorageUnavailableError();
    return {
      dataset,
      storage: { ownerAdminId: dataset.ownerAdminId, datasetId: dataset.id, storageIdentifier: location.storageIdentifier }
    };
  }

  private async recordActivity(actor: RecordActor, action: string, datasetId: string, success: boolean, metadata?: unknown, errorCode?: string): Promise<void> {
    try {
      await this.dependencies.logger?.recordDatasetActivity({ actorType: actor.actorType, actorId: actor.actorId, actorEmail: actor.actorEmail, ipAddress: actor.ipAddress, userAgent: actor.userAgent, action, resourceType: "DATASET", resourceId: datasetId, success, ...(metadata !== undefined ? { metadata } : {}), ...(errorCode !== undefined ? { errorCode } : {}) });
    } catch {
      // Activity logging must not interrupt record operations.
    }
  }
}
