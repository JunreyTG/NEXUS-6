import { LogRepository } from "../repositories/log.repository.js";
import { sanitizeMetadata } from "./sanitize.js";
import type { ActivityLogger, LogQuery, LogRecordInput, PaginatedLogs } from "./types.js";

export class LogService implements ActivityLogger {
  constructor(private readonly repository = new LogRepository()) {}

  async recordLogin(input: LogRecordInput): Promise<void> {
    await this.safeAppend("loginLog", input);
  }

  async recordAudit(input: LogRecordInput): Promise<void> {
    await this.safeAppend("auditLog", input);
  }

  async recordSecurity(input: LogRecordInput): Promise<void> {
    await this.safeAppend("securityEvent", input);
  }

  async recordDatasetActivity(input: LogRecordInput): Promise<void> {
    await this.safeAppend("datasetActivityLog", input);
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

  private async safeAppend(model: "loginLog" | "auditLog" | "securityEvent" | "datasetActivityLog", input: LogRecordInput): Promise<void> {
    try {
      await this.repository.append(model, { ...input, metadata: sanitizeMetadata(input.metadata ?? {}) });
    } catch {
      // Activity logging must never expose or interrupt the primary operation.
    }
  }
}
