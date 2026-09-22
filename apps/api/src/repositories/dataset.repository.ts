import type { PrismaClient } from "../generated/prisma/client.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";
import { databaseOperation, databaseWriteOperation } from "../errors/database-error.js";

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

  create(data: DatasetCreateData) {
    return databaseWriteOperation(() => this.database().dataset.create({ data, include: datasetInclude }));
  }

  updateMetadata(id: string, data: { name?: string; description?: string | null; visibility?: "PRIVATE" | "PUBLIC" }) {
    return databaseWriteOperation(() => this.database().dataset.update({ where: { id }, data, include: datasetInclude }));
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
