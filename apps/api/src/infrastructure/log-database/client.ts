import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/log-prisma/client.js";
import { requireLogDatabaseUrl } from "../../config/env.js";
import { DatabaseError } from "../../errors/database-error.js";

const globalDatabase = globalThis as typeof globalThis & { nexusLogPrisma?: PrismaClient };

export function getLogDatabase(): PrismaClient {
  if (globalDatabase.nexusLogPrisma) return globalDatabase.nexusLogPrisma;
  try {
    const adapter = new PrismaPg({
      connectionString: requireLogDatabaseUrl(),
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 5000,
      query_timeout: 6000
    });
    globalDatabase.nexusLogPrisma = new PrismaClient({ adapter, log: [] });
    return globalDatabase.nexusLogPrisma;
  } catch {
    throw new DatabaseError("Log database unavailable.", "LOG_DATABASE_UNAVAILABLE");
  }
}

export async function disconnectLogDatabase(): Promise<void> {
  const client = globalDatabase.nexusLogPrisma;
  delete globalDatabase.nexusLogPrisma;
  if (client) await client.$disconnect();
}
