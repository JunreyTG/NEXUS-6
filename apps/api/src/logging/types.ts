export type LogActorType = "ADMIN" | "SUPER_ADMIN" | "SYSTEM" | "ANONYMOUS";

export type LogActor = {
  actorType: LogActorType;
  actorId?: string | null | undefined;
  actorEmail?: string | null | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
};

export type LogRecordInput = LogActor & {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  success: boolean;
  metadata?: unknown;
  errorCode?: string | null;
};

export type LogQuery = {
  page: number;
  pageSize: number;
  start?: Date | undefined;
  end?: Date | undefined;
  actor?: string | undefined;
  action?: string | undefined;
  success?: boolean | undefined;
  search?: string | undefined;
};

export type PaginatedLogs = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type ActivityLogger = {
  recordLogin(input: LogRecordInput): Promise<void>;
  recordAudit(input: LogRecordInput): Promise<void>;
  recordSecurity(input: LogRecordInput): Promise<void>;
  recordDatasetActivity(input: LogRecordInput): Promise<void>;
  listLogin(query: LogQuery): Promise<PaginatedLogs>;
  listAudit(query: LogQuery): Promise<PaginatedLogs>;
  listSecurity(query: LogQuery): Promise<PaginatedLogs>;
  listDatasetActivity(query: LogQuery): Promise<PaginatedLogs>;
  listDatabaseActivity(query: LogQuery): Promise<PaginatedLogs>;
};

export const anonymousActor: LogActor = { actorType: "ANONYMOUS" };
