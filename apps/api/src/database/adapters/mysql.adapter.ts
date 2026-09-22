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
      const rows = await this.rows(request.storageIdentifier);
      const fields = new Map<string, { name: string; type: string; nullable: boolean }>();
      for (const row of rows.slice(0, 1000)) for (const [name, value] of Object.entries(row.record_data)) {
        const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
        const current = fields.get(name);
        fields.set(name, { name, type: current && current.type !== type ? "mixed" : type, nullable: current?.nullable === true || value === null });
      }
      return { storage: descriptor(request.storageIdentifier, this.configuration.database), fields: [...fields.values()] };
    });
  }

  override listRecords(request: RecordListRequest): Promise<RecordPage> {
    return this.read(async () => {
      let records = (await this.rows(request.storageIdentifier)).map((row) => recordWithId(row.record_id, row.record_data));
      if (request.search) {
        const search = request.search.toLowerCase();
        records = records.filter((record) => JSON.stringify(record).toLowerCase().includes(search));
      }
      if (request.sortBy) records.sort((left, right) => compare(getField(left, request.sortBy!), getField(right, request.sortBy!)) * (request.sortDirection === "desc" ? -1 : 1));
      const start = (request.page - 1) * request.pageSize;
      return { items: records.slice(start, start + request.pageSize), page: request.page, pageSize: request.pageSize, total: records.length };
    });
  }

  override getRecord(request: RecordRequest): Promise<DatabaseRecord | null> {
    return this.read(async () => {
      const table = identifier(request.storageIdentifier);
      const [rows] = await this.getPool().execute<StoredRow[]>(`SELECT record_id, record_data FROM ${table} WHERE record_id = ? LIMIT 1`, [request.recordId]);
      const row = rows[0];
      return row ? { id: row.record_id, ...row.record_data } : null;
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

  private async rows(storageIdentifier: string): Promise<StoredRow[]> {
    const [rows] = await this.getPool().execute<StoredRow[]>(`SELECT record_id, record_data FROM ${identifier(storageIdentifier)} ORDER BY created_at ASC, record_id ASC`);
    return rows;
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
  if (!/^[A-Za-z0-9_]+$/.test(value) || value.length > 190) throw new Error("Invalid storage identifier.");
  return `\`${value}\``;
}

function descriptor(storageIdentifier: string, databaseName: string | undefined): StorageDescriptor {
  return { engine: "MYSQL", storageType: "TABLE", storageIdentifier, ...(databaseName ? { databaseName } : {}), tableOrCollection: storageIdentifier };
}

function recordIdentifier(record: DatabaseRecord): string {
  const value = record.id;
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,191}$/.test(value)) throw new Error("Record id is required.");
  return value;
}

function getField(record: DatabaseRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined, record);
}

function compare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function buildReport(rows: StoredRow[], plan: ReportQueryRequest["plan"]): ReportQueryResult {
  const records = rows.map((row) => recordWithId(row.record_id, row.record_data)).filter((record) => plan.filters.every((filter) => matches(getField(record, filter.field), filter.operator, filter.value)));
  if (plan.grouping.length) {
    const groups = new Map<string, DatabaseRecord[]>();
    for (const record of records) {
      const key = JSON.stringify(plan.grouping.map((field) => getField(record, field)));
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    const resultRows = [...groups.values()].map((group) => ({ ...Object.fromEntries(plan.grouping.map((field) => [field, getField(group[0]!, field)])), ...aggregate(group, plan.aggregates) }) as DatabaseRecord);
    return { columns: [...plan.grouping, ...plan.aggregates.map((item) => item.alias)], rows: resultRows };
  }
  if (plan.aggregates.length) return { columns: [...plan.selectedFields, ...plan.aggregates.map((item) => item.alias)], rows: [{ ...Object.fromEntries(plan.selectedFields.map((field) => [field, getField(records[0] ?? {}, field)])), ...aggregate(records, plan.aggregates) } as DatabaseRecord] };
  const fields = plan.selectedFields.length ? plan.selectedFields : [...new Set(records.flatMap((record) => Object.keys(record)))];
  return { columns: fields, rows: records.map((record) => Object.fromEntries(fields.map((field) => [field, getField(record, field)])) as DatabaseRecord) };
}

function recordWithId(id: string, record: DatabaseRecord): DatabaseRecord {
  return { id, ...record };
}

function aggregate(records: DatabaseRecord[], aggregates: ReportQueryRequest["plan"]["aggregates"]): DatabaseRecord {
  return Object.fromEntries(aggregates.map((item) => {
    const values = item.field ? records.map((record) => getField(record, item.field!)).filter((value): value is number => typeof value === "number") : [];
    if (item.operation === "COUNT") return [item.alias, records.length];
    if (!values.length) return [item.alias, null];
    if (item.operation === "SUM") return [item.alias, values.reduce((sum, value) => sum + value, 0)];
    if (item.operation === "AVG") return [item.alias, values.reduce((sum, value) => sum + value, 0) / values.length];
    return [item.alias, item.operation === "MIN" ? Math.min(...values) : Math.max(...values)];
  }));
}

function matches(actual: unknown, operator: string, expected: unknown): boolean {
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (operator === "contains") return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
  if (operator === "in") return Array.isArray(expected) && expected.includes(actual);
  if (operator === "gt") return typeof actual === "number" && actual > Number(expected);
  if (operator === "gte") return typeof actual === "number" && actual >= Number(expected);
  if (operator === "lt") return typeof actual === "number" && actual < Number(expected);
  if (operator === "lte") return typeof actual === "number" && actual <= Number(expected);
  return false;
}
