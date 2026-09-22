import type { PrismaClient } from "../generated/prisma/client.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";
import { databaseOperation, databaseWriteOperation } from "../errors/database-error.js";
import type { AnalysisResult } from "../analysis/types.js";
import type { StorageDescriptor } from "../database/types.js";

const ownerSelect = { id: true, name: true, email: true } as const;

const datasetInclude = { owner: { select: ownerSelect } } as const;

export type DatasetCreateData = {
  ownerAdminId: string;
  name: string;
  description?: string | null;
  originalFilename: string;
  fileType: string;
  visibility: "PRIVATE" | "PUBLIC";
  recordCount: bigint;
  fileSizeBytes: bigint;
  detectedFields: string[];
  temporaryFileKey: string;
};

export class DatasetRepository {
  constructor(private readonly database: () => Pick<PrismaClient, "dataset" | "datasetAnalysis" | "datasetLocation"> = getSystemDatabase) {}

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
    return databaseWriteOperation(() => this.database().dataset.create({ data, include: datasetInclude }));
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
}
