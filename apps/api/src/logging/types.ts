export type LogActorType = "ADMIN" | "SUPER_ADMIN" | "SYSTEM" | "ANONYMOUS";

export type ActionCategory =
  | "AUTHENTICATION"
  | "ADMINISTRATION"
  | "DATASET"
  | "ANALYSIS"
  | "DATABASE"
  | "RECORD"
  | "REPORT"
  | "SECURITY"
  | "SYSTEM"
  | "PUBLIC_ACCESS";

export type LogActor = {
  actorType: LogActorType;
  actorId?: string | null | undefined;
  actorEmail?: string | null | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
};

export type LogRecordInput = LogActor & {
  action: string;
  resourceType?: string | null | undefined;
  resourceId?: string | null | undefined;
  success: boolean;
  metadata?: unknown;
  errorCode?: string | null | undefined;
};

export type ActivityLogInput = LogActor & {
  category: ActionCategory;
  action: string;
  resourceType?: string | null | undefined;
  resourceId?: string | null | undefined;
  datasetId?: string | null | undefined;
  databaseEngine?: string | null | undefined;
  success: boolean;
  metadata?: Record<string, unknown> | unknown;
  errorCode?: string | null | undefined;
  method?: string | null | undefined;
  endpoint?: string | null | undefined;
  statusCode?: number | null | undefined;
  durationMs?: number | null | undefined;
  requestId?: string | null | undefined;
  description?: string | null | undefined;
};

export type LogQuery = {
  page: number;
  pageSize: number;
  start?: Date | undefined;
  end?: Date | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  actor?: string | undefined;
  actorId?: string | undefined;
  action?: string | undefined;
  category?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  datasetId?: string | undefined;
  dataset?: string | undefined;
  databaseEngine?: string | undefined;
  success?: boolean | undefined;
  status?: string | undefined;
  search?: string | undefined;
  stream?:
    | "login"
    | "audit"
    | "security"
    | "dataset-activity"
    | "database-activity"
    | "all"
    | "authentication"
    | "datasets"
    | "database"
    | undefined;
};

export type PaginatedLogs = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type LogStatistics = {
  total: number;
  success: number;
  failure: number;
  byCategory: Record<string, number>;
  byStream: {
    login: number;
    audit: number;
    security: number;
    datasetActivity: number;
    databaseActivity: number;
  };
};

export type ActivityLogger = {
  recordLogin(input: LogRecordInput): Promise<void>;
  recordAudit(input: LogRecordInput): Promise<void>;
  recordSecurity(input: LogRecordInput): Promise<void>;
  recordDatasetActivity(input: LogRecordInput): Promise<void>;
  recordDatabaseActivity?: (input: LogRecordInput) => Promise<void>;
  logActivity?: (input: ActivityLogInput) => Promise<void>;
  listLogin(query: LogQuery): Promise<PaginatedLogs>;
  listAudit(query: LogQuery): Promise<PaginatedLogs>;
  listSecurity(query: LogQuery): Promise<PaginatedLogs>;
  listDatasetActivity(query: LogQuery): Promise<PaginatedLogs>;
  listDatabaseActivity(query: LogQuery): Promise<PaginatedLogs>;
  listAll?: (query: LogQuery) => Promise<PaginatedLogs>;
  getById?: (id: string) => Promise<Record<string, unknown> | null>;
  getStatistics?: (query?: { start?: Date | undefined; end?: Date | undefined }) => Promise<LogStatistics>;
};

export const anonymousActor: LogActor = { actorType: "ANONYMOUS" };

