import { getLogDatabase } from "../infrastructure/log-database/client.js";
import type { LogActorType } from "../generated/log-prisma/enums.js";
import type { LogQuery, LogRecordInput, LogStatistics, PaginatedLogs } from "../logging/types.js";
import { sanitizeMetadata } from "../logging/sanitize.js";
import { logDatabaseOperation } from "../errors/database-error.js";

type LogModel = "loginLog" | "auditLog" | "securityEvent" | "datasetActivityLog" | "databaseActivityLog";
type LogRecord = Record<string, unknown>;
type LogDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<LogRecord>;
  findMany(args: { where: Record<string, unknown>; orderBy: Record<string, string>; skip?: number; take?: number }): Promise<LogRecord[]>;
  findUnique(args: { where: { id: string } }): Promise<LogRecord | null>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
};

const ALL_MODELS: readonly LogModel[] = [
  "loginLog",
  "auditLog",
  "securityEvent",
  "datasetActivityLog",
  "databaseActivityLog"
];

const STREAM_TO_MODEL: Record<string, LogModel> = {
  login: "loginLog",
  authentication: "loginLog",
  audit: "auditLog",
  security: "securityEvent",
  "dataset-activity": "datasetActivityLog",
  datasets: "datasetActivityLog",
  "database-activity": "databaseActivityLog",
  database: "databaseActivityLog"
};

const MODEL_TO_STREAM: Record<LogModel, string> = {
  loginLog: "login",
  auditLog: "audit",
  securityEvent: "security",
  datasetActivityLog: "dataset-activity",
  databaseActivityLog: "database-activity"
};

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function delegate(model: LogModel): LogDelegate {
  return (getLogDatabase()[model] as unknown) as LogDelegate;
}

function buildWhere(query: LogQuery): Record<string, unknown> {
  const timestamp: Record<string, Date> = {};
  if (query.start) timestamp.gte = query.start;
  if (query.end) timestamp.lte = query.end;
  const filters: Array<Record<string, unknown>> = [];
  if (Object.keys(timestamp).length) filters.push({ timestamp });
  if (query.actor) {
    filters.push({ OR: [
      { actorEmail: { contains: query.actor, mode: "insensitive" } },
      { actorId: { contains: query.actor, mode: "insensitive" } }
    ] });
  }
  if (query.action) filters.push({ action: { contains: query.action, mode: "insensitive" } });
  if (query.resourceType) filters.push({ resourceType: { contains: query.resourceType, mode: "insensitive" } });
  if (query.resourceId && isUuid(query.resourceId)) filters.push({ resourceId: query.resourceId });
  if (query.datasetId && isUuid(query.datasetId)) filters.push({ resourceId: query.datasetId });
  if (query.success !== undefined) filters.push({ success: query.success });
  if (query.search) {
    filters.push({ OR: [
      { actorEmail: { contains: query.search, mode: "insensitive" } },
      { action: { contains: query.search, mode: "insensitive" } },
      { resourceType: { contains: query.search, mode: "insensitive" } },
      { resourceId: { contains: query.search, mode: "insensitive" } },
      { errorCode: { contains: query.search, mode: "insensitive" } }
    ] });
  }
  return filters.length ? { AND: filters } : {};
}

export class LogRepository {
  async append(model: LogModel, input: LogRecordInput): Promise<void> {
    await logDatabaseOperation(() => delegate(model).create({
      data: {
        ...(isUuid(input.actorId) ? { actorId: input.actorId } : {}),
        ...(input.actorEmail ? { actorEmail: input.actorEmail.slice(0, 320) } : {}),
        actorType: input.actorType as LogActorType,
        action: input.action.slice(0, 200),
        ...(input.resourceType ? { resourceType: input.resourceType.slice(0, 100) } : {}),
        ...(isUuid(input.resourceId) ? { resourceId: input.resourceId } : {}),
        success: input.success,
        ...(input.ipAddress ? { ipAddress: input.ipAddress.slice(0, 100) } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 500) } : {}),
        metadata: sanitizeMetadata(input.metadata ?? {}) ?? {},
        ...(input.errorCode ? { errorCode: input.errorCode.slice(0, 100) } : {})
      }
    }));
  }

  async list(model: LogModel, query: LogQuery): Promise<PaginatedLogs> {
    const where = buildWhere(query);
    const [rawItems, total] = await logDatabaseOperation(() => Promise.all([
      delegate(model).findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      delegate(model).count({ where })
    ]));
    const items = rawItems.map((item) => ({ ...item, stream: MODEL_TO_STREAM[model] }));
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.ceil(total / query.pageSize)
    };
  }

  async listAll(query: LogQuery): Promise<PaginatedLogs> {
    if (query.stream && query.stream !== "all") {
      const targetModel = STREAM_TO_MODEL[query.stream];
      if (targetModel) {
        return this.list(targetModel, query);
      }
    }

    const where = buildWhere(query);
    const takeLimit = query.page * query.pageSize;

    const results = await logDatabaseOperation(() => Promise.all(
      ALL_MODELS.map(async (model) => {
        const [rawItems, count] = await Promise.all([
          delegate(model).findMany({ where, orderBy: { timestamp: "desc" }, take: takeLimit }),
          delegate(model).count({ where })
        ]);
        const items: Array<Record<string, unknown>> = rawItems.map((item) => ({ ...item, stream: MODEL_TO_STREAM[model] }));
        return { model, items, count };
      })
    ));

    const total = results.reduce((sum, res) => sum + res.count, 0);
    const allItems: Array<Record<string, unknown>> = results.flatMap((res) => res.items);

    allItems.sort((a, b) => {
      const tsA = a["timestamp"];
      const tsB = b["timestamp"];
      const timeA = tsA instanceof Date ? tsA.getTime() : new Date(String(tsA ?? "")).getTime();
      const timeB = tsB instanceof Date ? tsB.getTime() : new Date(String(tsB ?? "")).getTime();
      return timeB - timeA;
    });

    const offset = (query.page - 1) * query.pageSize;
    const paginatedItems = allItems.slice(offset, offset + query.pageSize);

    return {
      items: paginatedItems,
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.ceil(total / query.pageSize)
    };
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    if (!isUuid(id)) return null;

    const queries = ALL_MODELS.map(async (model) => {
      const item = await delegate(model).findUnique({ where: { id } }).catch(() => null);
      if (item) {
        return { ...item, stream: MODEL_TO_STREAM[model] };
      }
      return null;
    });

    const results = await logDatabaseOperation(() => Promise.all(queries));
    return results.find((r) => r !== null) ?? null;
  }

  async getStatistics(query?: { start?: Date | undefined; end?: Date | undefined }): Promise<LogStatistics> {
    const timestamp: Record<string, Date> = {};
    if (query?.start) timestamp.gte = query.start;
    if (query?.end) timestamp.lte = query.end;
    const baseWhere = Object.keys(timestamp).length ? { timestamp } : {};

    const streamStats = await logDatabaseOperation(() => Promise.all(
      ALL_MODELS.map(async (model) => {
        const [totalCount, successCount] = await Promise.all([
          delegate(model).count({ where: baseWhere }),
          delegate(model).count({ where: { ...baseWhere, success: true } })
        ]);
        return {
          model,
          total: totalCount,
          success: successCount,
          failure: totalCount - successCount
        };
      })
    ));

    const total = streamStats.reduce((sum, s) => sum + s.total, 0);
    const totalSuccess = streamStats.reduce((sum, s) => sum + s.success, 0);
    const totalFailure = streamStats.reduce((sum, s) => sum + s.failure, 0);

    const streamMap = Object.fromEntries(streamStats.map((s) => [s.model, s]));

    return {
      total,
      success: totalSuccess,
      failure: totalFailure,
      byStream: {
        login: streamMap.loginLog?.total ?? 0,
        audit: streamMap.auditLog?.total ?? 0,
        security: streamMap.securityEvent?.total ?? 0,
        datasetActivity: streamMap.datasetActivityLog?.total ?? 0,
        databaseActivity: streamMap.databaseActivityLog?.total ?? 0
      },
      byCategory: {
        AUTHENTICATION: streamMap.loginLog?.total ?? 0,
        ADMINISTRATION: streamMap.auditLog?.total ?? 0,
        SECURITY: streamMap.securityEvent?.total ?? 0,
        DATASET: streamMap.datasetActivityLog?.total ?? 0,
        DATABASE: streamMap.databaseActivityLog?.total ?? 0
      }
    };
  }

  async getActivityTimeline(days: number = 7): Promise<Array<{ date: string; label: string; count: number }>> {
    const numDays = Math.min(Math.max(days, 1), 90);
    const now = new Date();
    const daysList: Array<{ start: Date; end: Date; dateStr: string; label: string }> = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      const label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      daysList.push({ start, end, dateStr, label });
    }

    return logDatabaseOperation(async () => {
      const timeline = await Promise.all(
        daysList.map(async (day) => {
          const counts = await Promise.all(
            ALL_MODELS.map((model) =>
              delegate(model).count({
                where: {
                  timestamp: { gte: day.start, lte: day.end }
                }
              })
            )
          );
          const total = counts.reduce((sum, c) => sum + c, 0);
          return {
            date: day.dateStr,
            label: day.label,
            count: total
          };
        })
      );
      return timeline;
    });
  }

  async getDownloadCount(): Promise<number> {
    return logDatabaseOperation(async () => {
      return delegate("datasetActivityLog").count({
        where: {
          action: { in: ["DATASET_EXPORTED", "DATASET_DOWNLOADED"] },
          success: true
        }
      });
    });
  }
}

