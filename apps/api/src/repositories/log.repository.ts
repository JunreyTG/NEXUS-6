import { getLogDatabase } from "../infrastructure/log-database/client.js";
import type { LogActorType } from "../generated/log-prisma/enums.js";
import type { LogQuery, LogRecordInput, PaginatedLogs } from "../logging/types.js";
import { sanitizeMetadata } from "../logging/sanitize.js";
import { logDatabaseOperation } from "../errors/database-error.js";

type LogModel = "loginLog" | "auditLog" | "securityEvent" | "datasetActivityLog" | "databaseActivityLog";
type LogRecord = Record<string, unknown>;
type LogDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<LogRecord>;
  findMany(args: { where: Record<string, unknown>; orderBy: Record<string, string>; skip: number; take: number }): Promise<LogRecord[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
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
  if (query.success !== undefined) filters.push({ success: query.success });
  if (query.search) {
    filters.push({ OR: [
      { actorEmail: { contains: query.search, mode: "insensitive" } },
      { action: { contains: query.search, mode: "insensitive" } },
      { resourceType: { contains: query.search, mode: "insensitive" } },
      { resourceId: { contains: query.search, mode: "insensitive" } }
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
    const [items, total] = await logDatabaseOperation(() => Promise.all([
      delegate(model).findMany({ where, orderBy: { timestamp: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      delegate(model).count({ where })
    ]));
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.ceil(total / query.pageSize)
    };
  }
}
