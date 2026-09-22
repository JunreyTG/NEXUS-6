import { getEngineStatuses } from "./capabilities.js";
import { UnsupportedDatabaseEngineError } from "./errors.js";
import { CouchbaseAdapter } from "./adapters/couchbase.adapter.js";
import { MongoDbAdapter } from "./adapters/mongo-db.adapter.js";
import { MySqlAdapter } from "./adapters/mysql.adapter.js";
import { Neo4jAdapter } from "./adapters/neo4j.adapter.js";
import { PostgresAdapter } from "./adapters/postgres.adapter.js";
import { SqlServerAdapter } from "./adapters/sql-server.adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { DATABASE_ENGINES, type DatabaseEngine, type DatabaseEngineStatus } from "./types.js";
import { getDatasetDatabaseStatuses } from "../config/dataset-databases.js";

function isDatabaseEngine(value: unknown): value is DatabaseEngine {
  return typeof value === "string" && DATABASE_ENGINES.includes(value as DatabaseEngine);
}

export class DatabaseRouter {
  private readonly adapters: Record<DatabaseEngine, DatabaseAdapter>;

  constructor(adapters: Partial<Record<DatabaseEngine, DatabaseAdapter>> = {}) {
    this.adapters = {
      MONGODB: adapters.MONGODB ?? new MongoDbAdapter(),
      MYSQL: adapters.MYSQL ?? new MySqlAdapter(),
      POSTGRESQL: adapters.POSTGRESQL ?? new PostgresAdapter(),
      COUCHBASE: adapters.COUCHBASE ?? new CouchbaseAdapter(),
      NEO4J: adapters.NEO4J ?? new Neo4jAdapter(),
      SQLSERVER: adapters.SQLSERVER ?? new SqlServerAdapter()
    };
  }

  getAdapter(engine: unknown): DatabaseAdapter {
    if (!isDatabaseEngine(engine)) throw new UnsupportedDatabaseEngineError();
    return this.adapters[engine];
  }

  getStatuses(): DatabaseEngineStatus[] {
    return getEngineStatuses(getDatasetDatabaseStatuses());
  }
}
