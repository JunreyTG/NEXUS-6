import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { config } from "dotenv";

// Load environment from workspace root or .env.neon if available
const envPath = path.resolve(process.cwd(), "../../.env");
config({ path: envPath });

const { Client } = pg;

const systemUrl = process.env.SYSTEM_DATABASE_URL;
const logUrl = process.env.LOG_DATABASE_URL;

if (!systemUrl || !logUrl) {
  console.error("Missing SYSTEM_DATABASE_URL or LOG_DATABASE_URL in environment.");
  process.exit(1);
}

const backupDir = path.resolve(process.cwd(), "../../backups");

async function backupDatabase(connectionString: string, label: string, outputFile: string) {
  console.log(`[Backup] Connecting to Neon ${label}...`);
  const client = new Client({ connectionString });
  await client.connect();

  const tablesQuery = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  const tablesRes = await client.query(tablesQuery);
  const data: Record<string, unknown[]> = {};
  const stats: Record<string, number> = {};

  for (const row of tablesRes.rows) {
    const tableName = row.table_name;
    const res = await client.query(`SELECT * FROM public."${tableName}"`);
    data[tableName] = res.rows;
    stats[tableName] = res.rows.length;
    console.log(`  - Table public."${tableName}": ${res.rows.length} rows`);
  }

  await client.end();
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify({
    metadata: {
      exportedAt: new Date().toISOString(),
      label,
      totalTables: Object.keys(data).length,
      stats
    },
    tables: data
  }, null, 2), "utf8");

  console.log(`[Backup] Successfully exported Neon ${label} to ${outputFile}`);
}

async function main() {
  try {
    console.log("=== DataVault6 Neon Database Backup Utility ===");
    const systemBackupPath = path.join(backupDir, "neon_system_data.json");
    const logsBackupPath = path.join(backupDir, "neon_logs_data.json");

    await backupDatabase(systemUrl, "System Database", systemBackupPath);
    await backupDatabase(logUrl, "Log Database", logsBackupPath);

    console.log("\nBackup completed successfully. Data is safely stored in backups/");
  } catch (error) {
    console.error("Backup failed with error:", error);
    process.exit(1);
  }
}

void main();
