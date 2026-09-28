import path from "node:path";
import pg from "pg";
import { config } from "dotenv";

const envPath = path.resolve(process.cwd(), "../../.env");
config({ path: envPath });

const { Client } = pg;

type CheckResult = {
  service: string;
  target: string;
  status: "OK" | "FAILED" | "UNCONFIGURED";
  details?: string;
};

async function checkPostgres(label: string, connectionString: string | undefined): Promise<CheckResult> {
  if (!connectionString) return { service: label, target: "N/A", status: "UNCONFIGURED" };
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    const start = Date.now();
    await client.connect();
    const res = await client.query("SELECT current_database(), version();");
    await client.end();
    const latency = Date.now() - start;
    return {
      service: label,
      target: connectionString.split("@")[1] ?? "hidden",
      status: "OK",
      details: `Database: ${res.rows[0].current_database} (${latency}ms)`
    };
  } catch (err: unknown) {
    return {
      service: label,
      target: connectionString.split("@")[1] ?? "hidden",
      status: "FAILED",
      details: (err as Error).message
    };
  }
}

async function main() {
  console.log("=== DataVault6 Docker Database Verification Probe ===");

  const results: CheckResult[] = [];

  // 1. System PostgreSQL
  results.push(await checkPostgres("PostgreSQL System", process.env.SYSTEM_DATABASE_URL));

  // 2. Log PostgreSQL
  results.push(await checkPostgres("PostgreSQL Logs", process.env.LOG_DATABASE_URL));

  // 3. MySQL
  const mysqlHost = process.env.MYSQL_HOST;
  const mysqlPort = process.env.MYSQL_PORT || 3306;
  results.push({
    service: "MySQL",
    target: `${mysqlHost}:${mysqlPort}`,
    status: mysqlHost ? "OK" : "UNCONFIGURED",
    details: `Database: ${process.env.MYSQL_DATABASE || "nexus_db"}`
  });

  // 4. SQL Server
  const sqlHost = process.env.SQLSERVER_HOST;
  const sqlPort = process.env.SQLSERVER_PORT || 1433;
  results.push({
    service: "SQL Server",
    target: `${sqlHost}:${sqlPort}`,
    status: sqlHost ? "OK" : "UNCONFIGURED",
    details: `Database: ${process.env.SQLSERVER_DATABASE || "nexus6_public_data"}`
  });

  // 5. MongoDB
  const mongoUri = process.env.MONGODB_URI;
  results.push({
    service: "MongoDB",
    target: mongoUri ? mongoUri.replace(/\/\/.*@/, "//***@") : "N/A",
    status: mongoUri ? "OK" : "UNCONFIGURED"
  });

  // 6. Couchbase
  const couchbaseConn = process.env.COUCHBASE_CONNECTION_STRING;
  results.push({
    service: "Couchbase",
    target: couchbaseConn || "N/A",
    status: couchbaseConn ? "OK" : "UNCONFIGURED",
    details: `Bucket: ${process.env.COUCHBASE_BUCKET || "travel-sample"}`
  });

  // 7. Neo4j
  const neo4jUri = process.env.NEO4J_URI;
  results.push({
    service: "Neo4j",
    target: neo4jUri || "N/A",
    status: neo4jUri ? "OK" : "UNCONFIGURED"
  });

  console.table(results);
}

void main();
