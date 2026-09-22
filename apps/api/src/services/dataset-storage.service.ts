import { DatasetNotAnalyzedError, DatabaseEngineNotSelectedError, DatabaseNotConfiguredError, IncompatibleDatabaseEngineError, StorageAlreadyExistsError } from "../database/errors.js";
import { DatabaseRouter } from "../database/router.js";
import { generateStorageIdentifier } from "../database/storage-naming.js";
import type { DatabaseEngine } from "../database/types.js";
import { CompatibilityService } from "../analysis/compatibility.service.js";
import type { DatasetClassification } from "../analysis/types.js";
import { AuthorizationError } from "../auth/errors.js";
import { NotFoundError } from "../errors/app-error.js";
import type { ActivityLogger, LogActor } from "../logging/types.js";
import { DatasetRepository } from "../repositories/dataset.repository.js";

export class DatasetStorageService {
  constructor(
    private readonly dependencies: {
      datasets?: DatasetRepository;
      router?: DatabaseRouter;
      logger?: ActivityLogger;
      compatibility?: CompatibilityService;
    } = {}
  ) {}

  private get datasets(): DatasetRepository {
    return this.dependencies.datasets ?? new DatasetRepository();
  }

  private get router(): DatabaseRouter {
    return this.dependencies.router ?? new DatabaseRouter();
  }

  private get compatibility(): CompatibilityService {
    return this.dependencies.compatibility ?? new CompatibilityService();
  }

  async createStorage(datasetId: string, actor?: LogActor) {
    const dataset = await this.datasets.findById(datasetId);
    if (!dataset) throw new NotFoundError("DATASET_NOT_FOUND");
    if (!dataset.selectedEngine) throw new DatabaseEngineNotSelectedError();
    return this.requestStorage(datasetId, dataset.selectedEngine as DatabaseEngine, actor);
  }

  async requestStorage(datasetId: string, engine: DatabaseEngine, actor?: LogActor & { role?: "ADMIN" | "SUPER_ADMIN" }) {
    const dataset = await this.loadDataset(datasetId, actor);
    if (dataset.status !== "ANALYZED" && dataset.status !== "READY") throw new DatasetNotAnalyzedError();
    if (await this.datasets.getLocation(datasetId)) throw new StorageAlreadyExistsError();

    const classification = dataset.classification as DatasetClassification;
    if (!this.compatibility.isCompatible(classification, engine)) {
      await this.recordDatabaseActivity(actor, { action: "INCOMPATIBLE_ENGINE_REJECTED", resourceType: "DATASET", resourceId: datasetId, success: false, errorCode: "INCOMPATIBLE_DATABASE_ENGINE", metadata: { classification, engine } });
      throw new IncompatibleDatabaseEngineError();
    }

    const storageIdentifier = generateStorageIdentifier(dataset.ownerAdminId, dataset.id);
    await this.recordDatabaseActivity(actor, { action: "ENGINE_SELECTED", resourceType: "DATASET", resourceId: datasetId, success: true, metadata: { classification, engine } });
    await this.recordDatabaseActivity(actor, { action: "STORAGE_REQUESTED", resourceType: "DATASET", resourceId: datasetId, success: true, metadata: { engine } });
    try {
      const descriptor = await this.router.getAdapter(engine).createStorage({ ownerAdminId: dataset.ownerAdminId, datasetId: dataset.id, storageIdentifier });
      const location = await this.datasets.createLocation(dataset.id, descriptor);
      await this.datasets.markStorageReady(dataset.id, engine);
      await this.recordDatabaseActivity(actor, { action: "STORAGE_CREATE_SUCCESS", resourceType: "DATASET", resourceId: datasetId, success: true, metadata: { engine, storageIdentifier } });
      return location;
    } catch (error) {
      await this.recordDatabaseActivity(actor, { action: "STORAGE_CREATE_FAILED", resourceType: "DATASET", resourceId: datasetId, success: false, errorCode: error instanceof DatabaseNotConfiguredError ? error.code : "STORAGE_CREATE_FAILED", metadata: { engine, storageIdentifier } });
      throw error;
    }
  }

  async getStorageStatus(datasetId: string, actor?: LogActor & { role?: "ADMIN" | "SUPER_ADMIN" }) {
    const dataset = await this.loadDataset(datasetId, actor);
    const location = await this.datasets.getLocation(datasetId);
    const engineStatus = dataset.selectedEngine ? this.router.getStatuses().find((status) => status.engine === dataset.selectedEngine)?.status : undefined;
    return {
      configured: Boolean(location),
      engineConfigured: engineStatus === "configured" || engineStatus === "healthy",
      selectedEngine: dataset.selectedEngine,
      locationCreated: Boolean(location),
      location: location ? {
        engine: location.engine,
        storageType: location.storageType,
        storageIdentifier: location.storageIdentifier,
        namespace: location.namespace,
        tableOrCollection: location.tableOrCollection
      } : null
    };
  }

  private async loadDataset(datasetId: string, actor?: LogActor & { role?: "ADMIN" | "SUPER_ADMIN" }) {
    const dataset = await this.datasets.findById(datasetId);
    if (!dataset) throw new NotFoundError("DATASET_NOT_FOUND");
    if (actor?.role === "ADMIN" && dataset.ownerAdminId !== actor.actorId) {
      await this.recordDatabaseActivity(actor, { action: "STORAGE_CREATE_FAILED", resourceType: "DATASET", resourceId: datasetId, success: false, errorCode: "FORBIDDEN" });
      throw new AuthorizationError();
    }
    return dataset;
  }

  private async recordDatabaseActivity(actor: LogActor | undefined, input: { action: string; resourceType: string; resourceId: string; success: boolean; metadata?: unknown; errorCode?: string }): Promise<void> {
    const logger = this.dependencies.logger;
    if (!logger?.recordDatabaseActivity) return;
    try {
      await logger.recordDatabaseActivity({ actorType: actor?.actorType ?? "SYSTEM", actorId: actor?.actorId, actorEmail: actor?.actorEmail, ipAddress: actor?.ipAddress, userAgent: actor?.userAgent, ...input });
    } catch {
      // Database activity logging must not change storage operation behavior.
    }
  }
}
