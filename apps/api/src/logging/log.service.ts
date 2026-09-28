import { LogRepository } from "../repositories/log.repository.js";
import { sanitizeMetadata } from "./sanitize.js";
import { getRequestContext, markSemanticLogEmitted } from "./request-context.js";
import type {
  ActivityLogger,
  ActivityLogInput,
  LogQuery,
  LogRecordInput,
  LogStatistics,
  PaginatedLogs
} from "./types.js";

type LogModel = "loginLog" | "auditLog" | "securityEvent" | "datasetActivityLog" | "databaseActivityLog";

export class LogService implements ActivityLogger {
  constructor(private readonly repository = new LogRepository()) {}

  async recordLogin(input: LogRecordInput): Promise<void> {
    markSemanticLogEmitted();
    await this.safeAppend("loginLog", input);
  }

  async recordAudit(input: LogRecordInput): Promise<void> {
    markSemanticLogEmitted();
    await this.safeAppend("auditLog", input);
  }

  async recordSecurity(input: LogRecordInput): Promise<void> {
    markSemanticLogEmitted();
    await this.safeAppend("securityEvent", input);
  }

  async recordDatasetActivity(input: LogRecordInput): Promise<void> {
    markSemanticLogEmitted();
    await this.safeAppend("datasetActivityLog", input);
  }

  async recordDatabaseActivity(input: LogRecordInput): Promise<void> {
    markSemanticLogEmitted();
    await this.safeAppend("databaseActivityLog", input);
  }

  async logActivity(input: ActivityLogInput): Promise<void> {
    markSemanticLogEmitted();

    const context = getRequestContext();
    const durationMs = input.durationMs ?? (context ? Date.now() - context.startTime : undefined);

    const mergedMetadata: Record<string, unknown> = {
      category: input.category,
      ...(input.description ? { description: input.description } : {}),
      ...(input.method || context?.method ? { method: input.method ?? context?.method } : {}),
      ...(input.endpoint || context?.endpoint ? { endpoint: input.endpoint ?? context?.endpoint } : {}),
      ...(input.statusCode !== undefined ? { statusCode: input.statusCode } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(input.requestId || context?.requestId ? { requestId: input.requestId ?? context?.requestId } : {}),
      ...(input.databaseEngine ? { databaseEngine: input.databaseEngine } : {}),
      ...(input.datasetId ? { datasetId: input.datasetId } : {}),
      ...(typeof input.metadata === "object" && input.metadata !== null ? (input.metadata as Record<string, unknown>) : {})
    };

    const recordInput: LogRecordInput = {
      actorType: input.actorType,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      ipAddress: input.ipAddress ?? context?.ipAddress ?? undefined,
      userAgent: input.userAgent ?? context?.userAgent ?? undefined,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? input.datasetId ?? undefined,
      success: input.success,
      errorCode: input.errorCode,
      metadata: mergedMetadata
    };

    const model = this.resolveStream(input.category, input.action, input.success);
    await this.safeAppend(model, recordInput);
  }

  async log(
    input: Omit<ActivityLogInput, "success"> & {
      success?: boolean;
      status?: "SUCCESS" | "FAILED" | "PENDING" | string;
    }
  ): Promise<void> {
    const isSuccess = input.success !== undefined ? input.success : input.status === "SUCCESS";
    await this.logActivity({
      ...input,
      success: isSuccess
    });
  }

  listLogin(query: LogQuery): Promise<PaginatedLogs> {
    return this.repository.list("loginLog", query);
  }

  listAudit(query: LogQuery): Promise<PaginatedLogs> {
    return this.repository.list("auditLog", query);
  }

  listSecurity(query: LogQuery): Promise<PaginatedLogs> {
    return this.repository.list("securityEvent", query);
  }

  listDatasetActivity(query: LogQuery): Promise<PaginatedLogs> {
    return this.repository.list("datasetActivityLog", query);
  }

  listDatabaseActivity(query: LogQuery): Promise<PaginatedLogs> {
    return this.repository.list("databaseActivityLog", query);
  }

  listAll(query: LogQuery): Promise<PaginatedLogs> {
    return this.repository.listAll(query);
  }

  getById(id: string): Promise<Record<string, unknown> | null> {
    return this.repository.findById(id);
  }

  getStatistics(query?: { start?: Date | undefined; end?: Date | undefined }): Promise<LogStatistics> {
    return this.repository.getStatistics(query);
  }

  getActivityTimeline(days?: number): Promise<Array<{ date: string; label: string; count: number }>> {
    return this.repository.getActivityTimeline(days);
  }

  getDownloadCount(): Promise<number> {
    return this.repository.getDownloadCount();
  }

  private resolveStream(category: string, action: string, success: boolean): LogModel {
    switch (category) {
      case "AUTHENTICATION":
        if (action.startsWith("LOGIN") || action === "LOGIN_ATTEMPT" || action === "LOGIN_SUCCESS" || action === "LOGIN_FAILURE") {
          return "loginLog";
        }
        if (action.includes("TOKEN") && !success) {
          return "securityEvent";
        }
        return "auditLog";

      case "SECURITY":
        return "securityEvent";

      case "DATABASE":
        return "databaseActivityLog";

      case "DATASET":
      case "ANALYSIS":
      case "RECORD":
      case "REPORT":
      case "PUBLIC_ACCESS":
        return "datasetActivityLog";

      case "ADMINISTRATION":
      case "SYSTEM":
      default:
        return "auditLog";
    }
  }

  private async safeAppend(model: LogModel, input: LogRecordInput): Promise<void> {
    try {
      await this.repository.append(model, {
        ...input,
        metadata: sanitizeMetadata(input.metadata ?? {})
      });
    } catch {
      // Activity logging must never expose secrets or interrupt the primary operation.
    }
  }
}

export const ActivityLogService = LogService;
export type ActivityLogService = LogService;
