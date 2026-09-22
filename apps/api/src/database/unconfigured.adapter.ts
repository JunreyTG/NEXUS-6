import { DatabaseNotConfiguredError } from "./errors.js";
import type { DatabaseAdapter } from "./adapter.js";
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
  UpdateRecordRequest,
  DatabaseEngine
} from "./types.js";

export abstract class UnconfiguredDatabaseAdapter implements DatabaseAdapter {
  abstract readonly engine: DatabaseEngine;
  readonly isImplemented: boolean = false;

  healthCheck(): Promise<DatabaseHealthResult> {
    return Promise.resolve({ engine: this.engine, status: "not_configured" });
  }

  createStorage(_request: StorageRequest): Promise<StorageDescriptor> { return this.notConfigured(); }
  importDataset(_request: ImportDatasetRequest): Promise<ImportDatasetResult> { return this.notConfigured(); }
  getSchema(_request: StorageRequest): Promise<DatabaseSchema> { return this.notConfigured(); }
  listRecords(_request: RecordListRequest): Promise<RecordPage> { return this.notConfigured(); }
  getRecord(_request: RecordRequest): Promise<DatabaseRecord | null> { return this.notConfigured(); }
  insertRecord(_request: InsertRecordRequest): Promise<DatabaseRecord> { return this.notConfigured(); }
  updateRecord(_request: UpdateRecordRequest): Promise<DatabaseRecord> { return this.notConfigured(); }
  deleteRecord(_request: RecordRequest): Promise<void> { return this.notConfigured(); }
  queryForReport(_request: ReportQueryRequest): Promise<ReportQueryResult> { return this.notConfigured(); }
  deleteStorage(_request: StorageRequest): Promise<void> { return this.notConfigured(); }

  protected notConfigured<T>(): Promise<T> {
    return Promise.reject(new DatabaseNotConfiguredError(this.engine));
  }
}
