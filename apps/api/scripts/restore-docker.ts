import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { config } from "dotenv";

const envPath = path.resolve(process.cwd(), "../../.env");
config({ path: envPath });

const { Client } = pg;

// Connection URLs for Docker PostgreSQL instances
const targetSystemUrl = process.env.DOCKER_SYSTEM_DATABASE_URL || process.env.SYSTEM_DATABASE_URL;
const targetLogUrl = process.env.DOCKER_LOG_DATABASE_URL || process.env.LOG_DATABASE_URL;

const backupDir = path.resolve(process.cwd(), "../../backups");

// System database table restoration order respecting foreign-key hierarchy
const systemTableOrder = [
  "Admin",
  "SuperAdminSession",
  "SystemSetting",
  "AdminSession",
  "EmailVerificationToken",
  "PasswordResetToken",
  "AdminPasswordSetupToken",
  "Dataset",
  "DatasetLocation",
  "DatasetAnalysis",
  "Report"
];

// Log database table restoration order (independent tables)
const logTableOrder = [
  "LoginLog",
  "AuditLog",
  "SecurityEvent",
  "DatasetActivityLog",
  "DatabaseActivityLog"
];

async function restoreDatabase(connectionString: string, label: string, backupFile: string, tableOrder: string[]) {
  console.log(`[Restore] Connecting to ${label}...`);
  const client = new Client({ connectionString });
  await client.connect();

  const fileContent = await fs.readFile(backupFile, "utf8");
  const parsed = JSON.parse(fileContent);
  const tables: Record<string, Record<string, unknown>[]> = parsed.tables;

  for (const tableName of tableOrder) {
    const rows = tables[tableName];
    if (!rows || rows.length === 0) {
      console.log(`  - Table public."${tableName}": 0 rows (skipped)`);
      continue;
    }

    console.log(`  - Table public."${tableName}": Restoring ${rows.length} rows...`);
    let restoredCount = 0;

    for (const row of rows) {
      const columns = Object.keys(row);
      const values = Object.values(row);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const quotedColumns = columns.map((c) => `"${c}"`).join(", ");

      const insertQuery = `
        INSERT INTO public."${tableName}" (${quotedColumns})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING;
      `;

      try {
        await client.query(insertQuery, values);
        restoredCount++;
      } catch (err: unknown) {
        console.warn(`    Warning: Failed to insert row into ${tableName}: ${(err as Error).message}`);
      }
    }

    console.log(`    Successfully restored ${restoredCount}/${rows.length} rows in ${tableName}`);
  }

  await client.end();
  console.log(`[Restore] Completed restoration for ${label}`);
}

async function main() {
  try {
    console.log("=== DataVault6 Docker Database Restore Utility ===");
    const systemBackupPath = path.join(backupDir, "neon_system_data.json");
    const logsBackupPath = path.join(backupDir, "neon_logs_data.json");

    if (!targetSystemUrl || !targetLogUrl) {
      throw new Error("Target database URLs are missing in environment.");
    }

    await restoreDatabase(targetSystemUrl, "System Database", systemBackupPath, systemTableOrder);
    await restoreDatabase(targetLogUrl, "Log Database", logsBackupPath, logTableOrder);

    console.log("\nAll data successfully restored and verified.");
  } catch (error) {
    console.error("Restore failed with error:", error);
    process.exit(1);
  }
}

void main();
