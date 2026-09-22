import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
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

type StoredRow = RowDataPacket & { record_id: string; record_data: DatabaseRecord };

export class MySqlAdapter extends UnconfiguredDatabaseAdapter {
  readonly engine = "MYSQL" as const;
  private readonly configuration: DatasetDatabaseConfig["MYSQL"];
  private pool: Pool | undefined;

  constructor(configuration = getDatasetDatabaseConfig().MYSQL) {
    super();
    this.configuration = configuration;
  }

  override healthCheck(): Promise<DatabaseHealthResult> {
    return Promise.resolve({ engine: this.engine, status: this.configuration.configured ? "configured" : "not_configured" });
  }

  override createStorage(request: StorageRequest): Promise<StorageDescriptor> {
    return this.write(async () => {
      const table = identifier(request.storageIdentifier);
      await this.getPool().query(`CREATE TABLE IF NOT EXISTS ${table} (record_id VARCHAR(191) NOT NULL PRIMARY KEY, record_data JSON NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))`);
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
      const [rows] = await this.getPool().execute<StoredRow[]>(`SELECT record_id, record_data FROM ${table} WHERE record_id = ? LIMIT 1`, [request.recordId]);
      const row = rows[0];
      return row ? recordWithId(row.record_id, row.record_data) : null;
    });
  }

  override insertRecord(request: InsertRecordRequest): Promise<DatabaseRecord> {
    return this.write(async () => {
      const recordId = recordIdentifier(request.record);
      const table = identifier(request.storageIdentifier);
      await this.getPool().execute<ResultSetHeader>(`INSERT INTO ${table} (record_id, record_data) VALUES (?, ?)`, [recordId, JSON.stringify(request.record)]);
      return { id: recordId, ...request.record };
    });
  }

  override updateRecord(request: UpdateRecordRequest): Promise<DatabaseRecord> {
    return this.write(async () => {
      const table = identifier(request.storageIdentifier);
      await this.getPool().execute<ResultSetHeader>(`UPDATE ${table} SET record_data = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE record_id = ?`, [JSON.stringify(request.record), request.recordId]);
      return { id: request.recordId, ...request.record };
    });
  }

  override deleteRecord(request: RecordRequest): Promise<void> {
    return this.write(async () => {
      const table = identifier(request.storageIdentifier);
      await this.getPool().execute<ResultSetHeader>(`DELETE FROM ${table} WHERE record_id = ?`, [request.recordId]);
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
    const [rows] = await this.getPool().execute<StoredRow[]>(`SELECT record_id, record_data FROM ${identifier(storageIdentifier)} ORDER BY created_at ASC, record_id ASC`);
    return rows.map((row) => recordWithId(row.record_id, row.record_data));
  }

  private getPool(): Pool {
    if (!this.configuration.configured || !this.configuration.host || !this.configuration.database || !this.configuration.user || !this.configuration.password) throw new DatabaseNotConfiguredError(this.engine);
    this.pool ??= mysql.createPool({ host: this.configuration.host, port: this.configuration.port, database: this.configuration.database, user: this.configuration.user, password: this.configuration.password, waitForConnections: true, connectionLimit: 10, maxIdle: 10, idleTimeout: 60000, enableKeepAlive: true });
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
  return `\`${validateIdentifier(value)}\``;
}

function descriptor(storageIdentifier: string, databaseName: string | undefined): StorageDescriptor {
  return { engine: "MYSQL", storageType: "TABLE", storageIdentifier, ...(databaseName ? { databaseName } : {}), tableOrCollection: storageIdentifier };
}

function recordIdentifier(record: DatabaseRecord): string {
  const value = record.id;
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,191}$/.test(value)) throw new Error("Record id is required.");
  return value;
}
