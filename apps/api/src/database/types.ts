export const DATABASE_ENGINES = ["MONGODB", "MYSQL", "POSTGRESQL", "COUCHBASE", "NEO4J", "SQLSERVER"] as const;

export type DatabaseEngine = (typeof DATABASE_ENGINES)[number];
export type DatabaseModel = "RELATIONAL" | "DOCUMENT" | "KEY_VALUE" | "GRAPH";
export type DatabaseStatus = "not_configured" | "configured" | "healthy" | "unavailable";
export type StorageType = "DATABASE" | "SCHEMA" | "TABLE" | "COLLECTION" | "SCOPE" | "GRAPH_NAMESPACE" | "OTHER";

export type DatabaseScalar = string | number | boolean | null;
export type DatabaseValue = DatabaseScalar | DatabaseValue[] | { [key: string]: DatabaseValue };
export type DatabaseRecord = Record<string, DatabaseValue>;

export type StorageRequest = {
  ownerAdminId: string;
  datasetId: string;
  storageIdentifier: string;
};

export type StorageDescriptor = {
  engine: DatabaseEngine;
  storageType: StorageType;
  storageIdentifier: string;
  databaseName?: string;
  namespace?: string;
  tableOrCollection?: string;
};

export type ImportDatasetRequest = StorageRequest & {
  sourceFileKey: string;
  fileType: "CSV" | "JSON" | "XLSX";
};

export type ImportDatasetResult = {
  importedRecordCount: number;
};

export type DatabaseSchema = {
  storage: StorageDescriptor;
  fields: Array<{ name: string; type: string; nullable: boolean }>;
};

export type RecordPage = {
  items: DatabaseRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type RecordFilter = {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "in";
  value: DatabaseValue;
};

export type RecordListRequest = StorageRequest & {
  page: number;
  pageSize: number;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
  search?: string | undefined;
  filters?: RecordFilter[] | undefined;
};

export type RecordRequest = StorageRequest & { recordId: string };
export type InsertRecordRequest = StorageRequest & { record: DatabaseRecord };
export type UpdateRecordRequest = RecordRequest & { record: DatabaseRecord };
export type ReportAggregate = {
  operation: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
  field?: string;
  alias: string;
};

export type ReportQueryPlan = {
  selectedFields: string[];
  filters: RecordFilter[];
  grouping: string[];
  aggregates: ReportAggregate[];
};

export type ReportQueryRequest = StorageRequest & { plan: ReportQueryPlan };
export type ReportQueryResult = { columns: string[]; rows: DatabaseRecord[] };

export type DatabaseHealthResult = {
  engine: DatabaseEngine;
  status: DatabaseStatus;
};

export type DatabaseEngineStatus = {
  engine: DatabaseEngine;
  displayName: string;
  databaseType: string;
  dataModels: DatabaseModel[];
  storageConcept: string;
  status: DatabaseStatus;
};
