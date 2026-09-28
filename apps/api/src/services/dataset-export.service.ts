import ExcelJS from "exceljs";
import { AuthorizationError } from "../auth/errors.js";
import { DatasetStorageUnavailableError } from "../database/errors.js";
import { DatabaseRouter } from "../database/router.js";
import type { DatabaseAdapter } from "../database/adapter.js";
import type { DatabaseEngine, DatabaseRecord, StorageRequest } from "../database/types.js";
import { AppError, NotFoundError } from "../errors/app-error.js";
import { LogService } from "../logging/log.service.js";
import type { ActivityLogger, LogActor } from "../logging/types.js";
import { DatasetRepository } from "../repositories/dataset.repository.js";

export type ExportActor = LogActor & { role: "ADMIN" | "SUPER_ADMIN" };
export type ExportFormat = "csv" | "json" | "xlsx";

export class ExportValidationError extends AppError {
  public constructor(code = "INVALID_FORMAT", message = "Invalid export request.") {
    super(message, 400, code);
    this.name = "ExportValidationError";
  }
}

export type ExportResult = {
  buffer: Buffer;
  contentType: string;
  filename: string;
  recordCount: number;
  format: ExportFormat;
  databaseEngine?: DatabaseEngine | undefined;
};

function sanitizeFilename(filename: string): string {
  return [...filename]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || character === "\\" || character === "/" ? "_" : character;
    })
    .join("")
    .slice(0, 255);
}

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  let text: string;
  if (typeof val === "object") {
    text = JSON.stringify(val);
  } else {
    text = String(val);
  }
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export class DatasetExportService {
  constructor(
    private readonly dependencies: {
      datasets?: DatasetRepository | undefined;
      router?: DatabaseRouter | undefined;
      logger?: ActivityLogger | undefined;
    } = {}
  ) {}

  private get datasets(): DatasetRepository {
    return this.dependencies.datasets ?? new DatasetRepository();
  }

  private get router(): DatabaseRouter {
    return this.dependencies.router ?? new DatabaseRouter();
  }

  private get logger(): ActivityLogger {
    return this.dependencies.logger ?? new LogService();
  }

  public validateFormat(rawFormat?: string | null | undefined): ExportFormat {
    if (!rawFormat || !rawFormat.trim()) {
      return "csv";
    }
    const normalized = rawFormat.trim().toLowerCase();
    if (normalized === "csv" || normalized === "json" || normalized === "xlsx") {
      return normalized as ExportFormat;
    }
    throw new ExportValidationError("INVALID_FORMAT", `Unsupported export format "${rawFormat}". Supported formats are: csv, json, xlsx.`);
  }

  public validateDatasetId(datasetId: string): string {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(datasetId);
    if (!isUuid) {
      throw new ExportValidationError("INVALID_DATASET_ID", "Dataset ID must be a valid UUID.");
    }
    return datasetId;
  }

  async export(
    datasetIdInput: string,
    formatInput: string | undefined,
    actor: ExportActor
  ): Promise<ExportResult> {
    const datasetId = this.validateDatasetId(datasetIdInput);
    const format = this.validateFormat(formatInput);

    const dataset = await this.datasets.findById(datasetId);
    if (!dataset) {
      await this.recordActivity(actor, datasetId, format, false, undefined, "DATASET_NOT_FOUND");
      throw new NotFoundError("DATASET_NOT_FOUND");
    }

    // Permission enforcement: Admins can download owned or public datasets; Super Admins can download all
    if (actor.role === "ADMIN" && dataset.ownerAdminId !== actor.actorId && dataset.visibility !== "PUBLIC") {
      await this.recordActivity(actor, datasetId, format, false, dataset.selectedEngine as DatabaseEngine | undefined, "FORBIDDEN");
      throw new AuthorizationError();
    }

    // Storage and engine check
    const location = await this.datasets.getLocation(datasetId);
    if (!dataset.selectedEngine || !location) {
      await this.recordActivity(actor, datasetId, format, false, undefined, "DATASET_STORAGE_NOT_CONFIGURED");
      throw new DatasetStorageUnavailableError();
    }

    const engine = dataset.selectedEngine as DatabaseEngine;
    const adapter = this.router.getAdapter(engine);

    let records: DatabaseRecord[] = [];
    try {
      records = await this.fetchAllRecords(adapter, {
        ownerAdminId: dataset.ownerAdminId ?? "",
        datasetId,
        storageIdentifier: location.storageIdentifier
      });
    } catch (error) {
      await this.recordActivity(
        actor,
        datasetId,
        format,
        false,
        engine,
        error instanceof Error ? error.name : "EXPORT_FAILED"
      );
      throw error;
    }

    const baseName = sanitizeFilename(dataset.name || "dataset").replace(/\.[^/.]+$/, "") || "dataset";
    const filename = `${baseName}.${format}`;
    const detectedFields = Array.isArray(dataset.detectedFields)
      ? (dataset.detectedFields as string[]).filter((f) => typeof f === "string")
      : [];

    let buffer: Buffer;
    let contentType: string;

    if (format === "csv") {
      buffer = this.recordsToCsv(records, detectedFields);
      contentType = "text/csv; charset=utf-8";
    } else if (format === "json") {
      buffer = this.recordsToJson(records);
      contentType = "application/json; charset=utf-8";
    } else {
      buffer = await this.recordsToXlsx(records, detectedFields, dataset.name);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    await this.recordActivity(
      actor,
      datasetId,
      format,
      true,
      engine,
      undefined,
      { recordCount: records.length, filename }
    );

    return {
      buffer,
      contentType,
      filename,
      recordCount: records.length,
      format,
      databaseEngine: engine
    };
  }

  private async fetchAllRecords(adapter: DatabaseAdapter, storage: StorageRequest): Promise<DatabaseRecord[]> {
    let page = 1;
    const pageSize = 1000;
    const allRecords: DatabaseRecord[] = [];

    while (true) {
      const pageResult = await adapter.listRecords({
        ...storage,
        page,
        pageSize
      });

      if (!pageResult || !pageResult.items || pageResult.items.length === 0) {
        break;
      }

      allRecords.push(...pageResult.items);

      if (allRecords.length >= pageResult.total || pageResult.items.length < pageSize) {
        break;
      }

      page += 1;
    }

    return allRecords;
  }

  private determineColumns(records: DatabaseRecord[], detectedFields: string[]): string[] {
    const columnSet = new Set<string>();
    for (const field of detectedFields) {
      if (field) columnSet.add(field);
    }
    for (const record of records) {
      if (record && typeof record === "object") {
        for (const key of Object.keys(record)) {
          columnSet.add(key);
        }
      }
    }
    return Array.from(columnSet);
  }

  public recordsToCsv(records: DatabaseRecord[], detectedFields: string[]): Buffer {
    const columns = this.determineColumns(records, detectedFields);
    if (columns.length === 0 && records.length === 0) {
      return Buffer.from("", "utf8");
    }

    const rows: string[] = [];
    if (columns.length > 0) {
      rows.push(columns.map(escapeCsvValue).join(","));
    }

    for (const record of records) {
      const rowValues = columns.map((col) => escapeCsvValue(record[col]));
      rows.push(rowValues.join(","));
    }

    return Buffer.from(rows.join("\r\n"), "utf8");
  }

  public recordsToJson(records: DatabaseRecord[]): Buffer {
    return Buffer.from(JSON.stringify(records, null, 2), "utf8");
  }

  public async recordsToXlsx(
    records: DatabaseRecord[],
    detectedFields: string[],
    datasetName: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DataVault6";
    workbook.created = new Date();

    const safeSheetName = (datasetName || "Dataset").replace(/[:\\/?*\[\]]/g, "_").slice(0, 31) || "Dataset";
    const worksheet = workbook.addWorksheet(safeSheetName);

    const columns = this.determineColumns(records, detectedFields);
    if (columns.length > 0) {
      worksheet.columns = columns.map((col) => ({ header: col, key: col }));
    }

    for (const record of records) {
      const rowValues: Record<string, unknown> = {};
      for (const col of columns) {
        const val = record[col];
        if (val === undefined || val === null) {
          rowValues[col] = "";
        } else if (typeof val === "object") {
          rowValues[col] = JSON.stringify(val);
        } else {
          rowValues[col] = val;
        }
      }
      worksheet.addRow(rowValues);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async recordActivity(
    actor: ExportActor,
    datasetId: string,
    format: ExportFormat,
    success: boolean,
    databaseEngine?: DatabaseEngine | undefined,
    errorCode?: string | undefined,
    extra?: Record<string, unknown> | undefined
  ): Promise<void> {
    try {
      await this.logger.recordDatasetActivity({
        actorType: actor.role,
        actorId: actor.actorId ?? undefined,
        actorEmail: actor.actorEmail ?? undefined,
        ipAddress: actor.ipAddress ?? undefined,
        userAgent: actor.userAgent ?? undefined,
        action: "DATASET_EXPORTED",
        resourceType: "DATASET",
        resourceId: datasetId,
        success,
        errorCode: errorCode ?? undefined,
        metadata: {
          format,
          ...(databaseEngine ? { databaseEngine } : {}),
          ...(extra ?? {})
        }
      });

      if (this.logger.logActivity) {
        await this.logger.logActivity({
          actorType: actor.role,
          actorId: actor.actorId ?? undefined,
          actorEmail: actor.actorEmail ?? undefined,
          ipAddress: actor.ipAddress ?? undefined,
          userAgent: actor.userAgent ?? undefined,
          category: "DATASET",
          action: "DATASET_EXPORTED",
          resourceType: "DATASET",
          resourceId: datasetId,
          datasetId,
          databaseEngine: databaseEngine ?? undefined,
          success,
          errorCode: errorCode ?? undefined,
          metadata: {
            format,
            ...(extra ?? {})
          }
        });
      }
    } catch {
      // Non-blocking logging
    }
  }
}
