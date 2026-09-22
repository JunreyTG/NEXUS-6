import type { PrismaClient } from "../generated/prisma/client.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";
import { databaseOperation } from "../errors/database-error.js";

export class ReportRepository {
  constructor(private readonly database: () => Pick<PrismaClient, "report"> = getSystemDatabase) {}

  findOwnedById(id: string, ownerAdminId: string) {
    return databaseOperation(() => this.database().report.findFirst({ where: { id, ownerAdminId } }));
  }

  listByOwner(ownerAdminId: string) {
    return databaseOperation(() => this.database().report.findMany({
      where: { ownerAdminId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100
    }));
  }
}
