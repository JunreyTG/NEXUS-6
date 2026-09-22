import { z } from "zod";
import type { DatabaseEngine, DatabaseStatus } from "../database/types.js";

const optionalText = z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().min(1).optional());
const optionalPort = z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.coerce.number().int().min(1).max(65535).optional());
const optionalBoolean = z.preprocess((value) => value === "" ? undefined : value === "true" ? true : value === "false" ? false : value, z.boolean().optional());

const datasetDatabaseEnvSchema = z.object({
  MONGODB_URI: optionalText,
  MYSQL_HOST: optionalText,
  MYSQL_PORT: optionalPort.default(3306),
  MYSQL_DATABASE: optionalText,
  MYSQL_USER: optionalText,
  MYSQL_PASSWORD: optionalText,
  POSTGRES_DATA_HOST: optionalText,
  POSTGRES_DATA_PORT: optionalPort.default(5432),
  POSTGRES_DATA_DATABASE: optionalText,
  POSTGRES_DATA_USER: optionalText,
  POSTGRES_DATA_PASSWORD: optionalText,
  POSTGRES_DATA_SSL: optionalBoolean.default(true),
  COUCHBASE_CONNECTION_STRING: optionalText,
  COUCHBASE_USERNAME: optionalText,
  COUCHBASE_PASSWORD: optionalText,
  COUCHBASE_BUCKET: optionalText,
  NEO4J_URI: optionalText,
  NEO4J_USERNAME: optionalText,
  NEO4J_PASSWORD: optionalText,
  SQLSERVER_HOST: optionalText,
  SQLSERVER_PORT: optionalPort.default(1433),
  SQLSERVER_DATABASE: optionalText,
  SQLSERVER_USER: optionalText,
  SQLSERVER_PASSWORD: optionalText,
  SQLSERVER_ENCRYPT: optionalBoolean.default(true),
  SQLSERVER_TRUST_SERVER_CERTIFICATE: optionalBoolean.default(false)
});

export type DatasetDatabaseConfig = {
  MONGODB: { uri?: string | undefined; configured: boolean };
  MYSQL: { host?: string | undefined; port: number; database?: string | undefined; user?: string | undefined; password?: string | undefined; configured: boolean };
  POSTGRESQL: { host?: string | undefined; port: number; database?: string | undefined; user?: string | undefined; password?: string | undefined; ssl: boolean; configured: boolean };
  COUCHBASE: { connectionString?: string | undefined; username?: string | undefined; password?: string | undefined; bucket?: string | undefined; configured: boolean };
  NEO4J: { uri?: string | undefined; username?: string | undefined; password?: string | undefined; configured: boolean };
  SQLSERVER: { host?: string | undefined; port: number; database?: string | undefined; user?: string | undefined; password?: string | undefined; encrypt: boolean; trustServerCertificate: boolean; configured: boolean };
};

export type DatasetDatabaseStatuses = Record<DatabaseEngine, DatabaseStatus>;

export function getDatasetDatabaseConfig(source: NodeJS.ProcessEnv = process.env): DatasetDatabaseConfig {
  const parsed = datasetDatabaseEnvSchema.safeParse(source);
  if (!parsed.success) return emptyConfig();
  const value = parsed.data;
  return {
    MONGODB: { uri: value.MONGODB_URI, configured: Boolean(value.MONGODB_URI) },
    MYSQL: { host: value.MYSQL_HOST, port: value.MYSQL_PORT, database: value.MYSQL_DATABASE, user: value.MYSQL_USER, password: value.MYSQL_PASSWORD, configured: Boolean(value.MYSQL_HOST && value.MYSQL_DATABASE && value.MYSQL_USER && value.MYSQL_PASSWORD) },
    POSTGRESQL: { host: value.POSTGRES_DATA_HOST, port: value.POSTGRES_DATA_PORT, database: value.POSTGRES_DATA_DATABASE, user: value.POSTGRES_DATA_USER, password: value.POSTGRES_DATA_PASSWORD, ssl: value.POSTGRES_DATA_SSL, configured: Boolean(value.POSTGRES_DATA_HOST && value.POSTGRES_DATA_DATABASE && value.POSTGRES_DATA_USER && value.POSTGRES_DATA_PASSWORD) },
    COUCHBASE: { connectionString: value.COUCHBASE_CONNECTION_STRING, username: value.COUCHBASE_USERNAME, password: value.COUCHBASE_PASSWORD, bucket: value.COUCHBASE_BUCKET, configured: Boolean(value.COUCHBASE_CONNECTION_STRING && value.COUCHBASE_USERNAME && value.COUCHBASE_PASSWORD && value.COUCHBASE_BUCKET) },
    NEO4J: { uri: value.NEO4J_URI, username: value.NEO4J_USERNAME, password: value.NEO4J_PASSWORD, configured: Boolean(value.NEO4J_URI && value.NEO4J_USERNAME && value.NEO4J_PASSWORD) },
    SQLSERVER: { host: value.SQLSERVER_HOST, port: value.SQLSERVER_PORT, database: value.SQLSERVER_DATABASE, user: value.SQLSERVER_USER, password: value.SQLSERVER_PASSWORD, encrypt: value.SQLSERVER_ENCRYPT, trustServerCertificate: value.SQLSERVER_TRUST_SERVER_CERTIFICATE, configured: Boolean(value.SQLSERVER_HOST && value.SQLSERVER_DATABASE && value.SQLSERVER_USER && value.SQLSERVER_PASSWORD) }
  };
}

export function getDatasetDatabaseStatuses(source: NodeJS.ProcessEnv = process.env): DatasetDatabaseStatuses {
  const config = getDatasetDatabaseConfig(source);
  return {
    MONGODB: config.MONGODB.configured ? "configured" : "not_configured",
    MYSQL: config.MYSQL.configured ? "configured" : "not_configured",
    POSTGRESQL: config.POSTGRESQL.configured ? "configured" : "not_configured",
    COUCHBASE: config.COUCHBASE.configured ? "configured" : "not_configured",
    NEO4J: config.NEO4J.configured ? "configured" : "not_configured",
    SQLSERVER: config.SQLSERVER.configured ? "configured" : "not_configured"
  };
}

function emptyConfig(): DatasetDatabaseConfig {
  return {
    MONGODB: { configured: false },
    MYSQL: { port: 3306, configured: false },
    POSTGRESQL: { port: 5432, ssl: true, configured: false },
    COUCHBASE: { configured: false },
    NEO4J: { configured: false },
    SQLSERVER: { port: 1433, encrypt: true, trustServerCertificate: false, configured: false }
  };
}
