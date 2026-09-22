import type { PrismaClient } from "../generated/prisma/client.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";
import { databaseOperation } from "../errors/database-error.js";
import { databaseWriteOperation } from "../errors/database-error.js";
import type { ReportInput, ReportPatchInput } from "../reports/types.js";

export class ReportRepository {
  constructor(private readonly database: () => Pick<PrismaClient, "report"> = getSystemDatabase) {}

  findOwnedById(id: string, ownerAdminId: string) {
    return databaseOperation(() => this.database().report.findFirst({ where: { id, ownerAdminId } }));
  }

  findById(id: string) {
    return databaseOperation(() => this.database().report.findUnique({ where: { id } }));
  }

  listByOwner(ownerAdminId: string) {
    return databaseOperation(() => this.database().report.findMany({
      where: { ownerAdminId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100
    }));
  }

  listAll() {
    return databaseOperation(() => this.database().report.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }));
  }

  listPublic() {
    return databaseOperation(() => this.database().report.findMany({
      where: { visibility: "PUBLIC" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100
    }));
  }

  findPublicById(id: string) {
    return databaseOperation(() => this.database().report.findFirst({ where: { id, visibility: "PUBLIC" } }));
  }

  countPublic() {
    return databaseOperation(() => this.database().report.count({ where: { visibility: "PUBLIC" } }));
  }

  create(data: ReportInput & { ownerAdminId: string }) {
    return databaseWriteOperation(() => this.database().report.create({
      data: {
        datasetId: data.datasetId,
        ownerAdminId: data.ownerAdminId,
        title: data.title,
        description: data.description ?? null,
        configuration: JSON.parse(JSON.stringify(data.configuration)),
        visibility: data.visibility
      }
    }));
  }

  update(id: string, data: ReportPatchInput) {
    return databaseWriteOperation(() => this.database().report.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.configuration !== undefined ? { configuration: JSON.parse(JSON.stringify(data.configuration)) } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {})
      }
    }));
  }

  delete(id: string) {
    return databaseWriteOperation(() => this.database().report.delete({ where: { id } }));
  }
}
