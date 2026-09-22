import type { PrismaClient } from "../generated/prisma/client.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";
import { databaseOperation } from "../errors/database-error.js";

// Only non-secret configuration belongs here. Secret values remain in the environment.
export class SystemSettingRepository {
  constructor(private readonly database: () => Pick<PrismaClient, "systemSetting"> = getSystemDatabase) {}

  findByKey(key: string) {
    return databaseOperation(() => this.database().systemSetting.findUnique({ where: { key } }));
  }
}
