import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { requireSystemDatabaseUrl } from "../../config/env.js";
import { DatabaseError } from "../../errors/database-error.js";

const globalDatabase = globalThis as typeof globalThis & { nexusSystemPrisma?: PrismaClient };

export function getSystemDatabase(): PrismaClient {
  if (globalDatabase.nexusSystemPrisma) return globalDatabase.nexusSystemPrisma;
  try {
    const adapter = new PrismaPg({
      connectionString: requireSystemDatabaseUrl(),
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 5000,
      query_timeout: 6000
    });
    globalDatabase.nexusSystemPrisma = new PrismaClient({ adapter, log: [] });
    return globalDatabase.nexusSystemPrisma;
  } catch {
    throw new DatabaseError();
  }
}

export async function disconnectSystemDatabase(): Promise<void> {
  const client = globalDatabase.nexusSystemPrisma;
  delete globalDatabase.nexusSystemPrisma;
  if (client) await client.$disconnect();
}
