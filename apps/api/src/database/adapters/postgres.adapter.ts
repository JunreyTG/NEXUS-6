import pg from "pg";
import { getDatasetDatabaseConfig, type DatasetDatabaseConfig } from "../../config/dataset-databases.js";
import { DatabaseNotConfiguredError } from "../errors.js";
import { databaseOperation, databaseWriteOperation } from "../../errors/database-error.js";
import type {
  DatabaseHealthResult,
  DatabaseRecord,
  DatabaseSchema,
  ImportDatasetRequest,
  ImportDatasetResult,
  InsertRecordRequest,
  RecordPage,
  RecordListRequest,
  RecordRequest,
  ReportQueryRequest,
  ReportQueryResult,
  StorageDescriptor,
  StorageRequest,
  UpdateRecordRequest
} from "../types.js";
import { UnconfiguredDatabaseAdapter } from "../unconfigured.adapter.js";
import { buildReport, recordWithId, sortRecords, validateIdentifier } from "./relational-adapter.support.js";

type StoredRow = { record_id: string; record_data: DatabaseRecord };

export class PostgresAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "POSTGRESQL" as const;
  override readonly isImplemented = true;
  private readonly configuration: DatasetDatabaseConfig["POSTGRESQL"];
  private pool: pg.Pool | undefined;

  constructor(configuration = getDatasetDatabaseConfig().POSTGRESQL) {
    super();
    this.configuration = configuration;
  }

  override healthCheck(): Promise<DatabaseHealthResult> {
    return Promise.resolve({ engine: this.engine, status: this.configuration.configured ? "configured" : "not_configured" });
  }

  override createStorage(request: StorageRequest): Promise<StorageDescriptor> {
    return this.write(async () => {
      const table = identifier(request.storageIdentifier);
      await this.getPool().query(`CREATE TABLE IF NOT EXISTS ${table} (record_id VARCHAR(191) NOT NULL PRIMARY KEY, record_data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      return descriptor(request.storageIdentifier, this.configuration.database);
    });
  }

  override importDataset(_request: ImportDatasetRequest): Promise<ImportDatasetResult> {
    return Promise.reject(new Error("Dataset import requires the upload import workflow."));
  }

  override getSchema(request: StorageRequest): Promise<DatabaseSchema> {
    return this.read(async () => {
      const records = await this.rows(request.storageIdentifier);
      const fields = new Map<string, { name: string; type: string; nullable: boolean }>();
      for (const record of records.slice(0, 1000)) for (const [name, value] of Object.entries(record)) {
        if (name === "id") continue;
        const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
        const current = fields.get(name);
        fields.set(name, { name, type: current && current.type !== type ? "mixed" : type, nullable: current?.nullable === true || value === null });
      }
      return { storage: descriptor(request.storageIdentifier, this.configuration.database), fields: [...fields.values()] };
    });
  }

  override listRecords(request: RecordListRequest): Promise<RecordPage> {
    return this.read(async () => {
      let records = await this.rows(request.storageIdentifier);
      if (request.search) {
        const search = request.search.toLowerCase();
        records = records.filter((record) => JSON.stringify(record).toLowerCase().includes(search));
      }
      records = sortRecords(records, request.sortBy, request.sortDirection);
      const start = (request.page - 1) * request.pageSize;
      return { items: records.slice(start, start + request.pageSize), page: request.page, pageSize: request.pageSize, total: records.length };
    });
  }

  override getRecord(request: RecordRequest): Promise<DatabaseRecord | null> {
    return this.read(async () => {
      const table = identifier(request.storageIdentifier);
      const result = await this.getPool().query<StoredRow>(`SELECT record_id, record_data FROM ${table} WHERE record_id = $1 LIMIT 1`, [request.recordId]);
      const row = result.rows[0];
      return row ? recordWithId(row.record_id, row.record_data) : null;
    });
  }

  override insertRecord(request: InsertRecordRequest): Promise<DatabaseRecord> {
    return this.write(async () => {
      const recordId = recordIdentifier(request.record);
      const table = identifier(request.storageIdentifier);
      await this.getPool().query(`INSERT INTO ${table} (record_id, record_data) VALUES ($1, $2)`, [recordId, JSON.stringify(request.record)]);
      return { id: recordId, ...request.record };
    });
  }

  override updateRecord(request: UpdateRecordRequest): Promise<DatabaseRecord> {
    return this.write(async () => {
      const table = identifier(request.storageIdentifier);
      await this.getPool().query(`UPDATE ${table} SET record_data = $1, updated_at = now() WHERE record_id = $2`, [JSON.stringify(request.record), request.recordId]);
      return { id: request.recordId, ...request.record };
    });
  }

  override deleteRecord(request: RecordRequest): Promise<void> {
    return this.write(async () => {
      await this.getPool().query(`DELETE FROM ${identifier(request.storageIdentifier)} WHERE record_id = $1`, [request.recordId]);
    });
  }

  override queryForReport(request: ReportQueryRequest): Promise<ReportQueryResult> {
    return this.read(async () => buildReport(await this.rows(request.storageIdentifier), request.plan));
  }

  override deleteStorage(request: StorageRequest): Promise<void> {
    return this.write(async () => {
      await this.getPool().query(`DROP TABLE IF EXISTS ${identifier(request.storageIdentifier)}`);
    });
  }

  private async rows(storageIdentifier: string): Promise<DatabaseRecord[]> {
    const result = await this.getPool().query<StoredRow>(`SELECT record_id, record_data FROM ${identifier(storageIdentifier)} ORDER BY created_at ASC, record_id ASC`);
    return result.rows.map((row) => recordWithId(row.record_id, row.record_data));
  }

  private getPool(): pg.Pool {
    if (!this.configuration.configured || !this.configuration.host || !this.configuration.database || !this.configuration.user || !this.configuration.password) throw new DatabaseNotConfiguredError(this.engine);
    this.pool ??= new pg.Pool({ host: this.configuration.host, port: this.configuration.port, database: this.configuration.database, user: this.configuration.user, password: this.configuration.password, ssl: this.configuration.ssl ? { rejectUnauthorized: false } : undefined, max: 10, idleTimeoutMillis: 60000 });
    return this.pool;
  }

  private read<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.configuration.configured) return Promise.reject(new DatabaseNotConfiguredError(this.engine));
    return databaseOperation(operation);
  }

  private write<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.configuration.configured) return Promise.reject(new DatabaseNotConfiguredError(this.engine));
    return databaseWriteOperation(operation);
  }
}

function identifier(value: string): string {
  return `"${validateIdentifier(value)}"`;
}

function descriptor(storageIdentifier: string, databaseName: string | undefined): StorageDescriptor {
  return { engine: "POSTGRESQL", storageType: "TABLE", storageIdentifier, ...(databaseName ? { databaseName } : {}), tableOrCollection: storageIdentifier };
}

function recordIdentifier(record: DatabaseRecord): string {
  const value = record.id;
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,191}$/.test(value)) throw new Error("Record id is required.");
  return value;
}
