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
} from "./types.js";

export interface DatabaseAdapter {
  readonly engine: import("./types.js").DatabaseEngine;
  readonly isImplemented: boolean;
  healthCheck(): Promise<DatabaseHealthResult>;
  createStorage(request: StorageRequest): Promise<StorageDescriptor>;
  importDataset(request: ImportDatasetRequest): Promise<ImportDatasetResult>;
  getSchema(request: StorageRequest): Promise<DatabaseSchema>;
  listRecords(request: RecordListRequest): Promise<RecordPage>;
  getRecord(request: RecordRequest): Promise<DatabaseRecord | null>;
  insertRecord(request: InsertRecordRequest): Promise<DatabaseRecord>;
  updateRecord(request: UpdateRecordRequest): Promise<DatabaseRecord>;
  deleteRecord(request: RecordRequest): Promise<void>;
  queryForReport(request: ReportQueryRequest): Promise<ReportQueryResult>;
  deleteStorage(request: StorageRequest): Promise<void>;
}
