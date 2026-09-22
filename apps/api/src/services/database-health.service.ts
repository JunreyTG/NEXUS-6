import { databaseOperation } from "../errors/database-error.js";
import { getSystemDatabase } from "../infrastructure/database/client.js";

export async function checkDatabaseHealth(
  probe: () => Promise<unknown> = () => getSystemDatabase().$queryRaw`SELECT 1`
): Promise<{ status: "ok"; database: "system" }> {
  await databaseOperation(probe);
  return { status: "ok", database: "system" };
}
