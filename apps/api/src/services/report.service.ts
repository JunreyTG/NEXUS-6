import { AuthorizationError } from "../auth/errors.js";
import { DatasetStorageUnavailableError } from "../database/errors.js";
import { DatabaseRouter } from "../database/router.js";
import type { DatabaseValue, ReportQueryPlan } from "../database/types.js";
import { NotFoundError, ReportValidationError } from "../errors/app-error.js";
import type { ActivityLogger, LogActor } from "../logging/types.js";
import { DatasetRepository } from "../repositories/dataset.repository.js";
import { ReportRepository } from "../repositories/report.repository.js";
import type { ReportConfiguration, ReportInput, ReportPatchInput, ReportPreview } from "../reports/types.js";

export type ReportActor = LogActor & { role: "ADMIN" | "SUPER_ADMIN" };

function toReportValue(value: unknown, depth = 0): DatabaseValue {
  if (depth > 10 || value === undefined || typeof value === "function" || typeof value === "symbol") throw new ReportValidationError("REPORT_FILTER_INVALID");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ReportValidationError("REPORT_FILTER_INVALID");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toReportValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, DatabaseValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (!/^[A-Za-z0-9_$.[\]-]+$/.test(key) || key.length > 200) throw new ReportValidationError("REPORT_FILTER_INVALID");
      result[key] = toReportValue(child, depth + 1);
    }
    return result;
  }
  throw new ReportValidationError("REPORT_FILTER_INVALID");
}

function fieldSet(dataset: Record<string, unknown>, analysis: Record<string, unknown> | null): Set<string> {
  const result = new Set<string>();
  const detected = dataset.detectedFields;
  if (Array.isArray(detected)) for (const field of detected) if (typeof field === "string") result.add(field);
  const analysisFields = analysis?.fields;
  if (Array.isArray(analysisFields)) for (const field of analysisFields) if (field && typeof field === "object" && "name" in field && typeof field.name === "string") result.add(field.name);
  return result;
}

export class ReportService {
  constructor(
    private readonly dependencies: {
      reports?: ReportRepository;
      datasets?: DatasetRepository;
      router?: DatabaseRouter;
      logger?: ActivityLogger;
    } = {}
  ) {}

  private get reports(): ReportRepository { return this.dependencies.reports ?? new ReportRepository(); }
  private get datasets(): DatasetRepository { return this.dependencies.datasets ?? new DatasetRepository(); }
  private get router(): DatabaseRouter { return this.dependencies.router ?? new DatabaseRouter(); }

  async list(actor: ReportActor) {
    const reports = actor.role === "SUPER_ADMIN" ? await this.reports.listAll() : await this.reports.listByOwner(actor.actorId!);
    return reports.map((report) => this.serialize(report as unknown as Record<string, unknown>));
  }

  async get(id: string, actor: ReportActor) {
    const report = await this.authorizeReport(id, actor);
    return this.serialize(report as unknown as Record<string, unknown>);
  }

  async getPublic(id: string) {
    const report = await this.reports.findPublicById(id);
    if (!report) throw new NotFoundError("REPORT_NOT_FOUND");
    const dataset = await this.datasets.findPublicById(report.datasetId);
    if (!dataset) throw new NotFoundError("REPORT_NOT_FOUND");
    return this.serializePublic(report as unknown as Record<string, unknown>, dataset as unknown as Record<string, unknown>);
  }

  async create(input: ReportInput, actor: ReportActor) {
    const dataset = await this.authorizeDataset(input.datasetId, actor);
    const configuration = await this.normalizeConfiguration(input.configuration, dataset);
    const ownerAdminId = actor.role === "ADMIN" ? actor.actorId! : dataset.ownerAdminId;
    const report = await this.reports.create({ ...input, configuration, ownerAdminId });
    await this.recordActivity(actor, "REPORT_CREATE", report.id, true, { datasetId: report.datasetId });
    return this.serialize(report as unknown as Record<string, unknown>);
  }

  async update(id: string, input: ReportPatchInput, actor: ReportActor) {
    const report = await this.authorizeReport(id, actor);
    const dataset = await this.authorizeDataset(report.datasetId, actor);
    const configuration = input.configuration ? await this.normalizeConfiguration(input.configuration, dataset) : undefined;
    const updated = await this.reports.update(id, { ...input, ...(configuration ? { configuration } : {}) });
    await this.recordActivity(actor, "REPORT_UPDATE", id, true, { datasetId: report.datasetId });
    return this.serialize(updated as unknown as Record<string, unknown>);
  }

  async delete(id: string, actor: ReportActor): Promise<void> {
    const report = await this.authorizeReport(id, actor);
    await this.reports.delete(id);
    await this.recordActivity(actor, "REPORT_DELETE", id, true, { datasetId: report.datasetId });
  }

  async preview(id: string, actor: ReportActor): Promise<ReportPreview> {
    const report = await this.authorizeReport(id, actor);
    const dataset = await this.authorizeDataset(report.datasetId, actor);
    const location = await this.datasets.getLocation(dataset.id);
    if (!dataset.selectedEngine || !location) throw new DatasetStorageUnavailableError();
    const configuration = this.persistedConfiguration(report.configuration);
    try {
      const result = await this.router.getAdapter(dataset.selectedEngine).queryForReport({
        ownerAdminId: dataset.ownerAdminId,
        datasetId: dataset.id,
        storageIdentifier: location.storageIdentifier,
        plan: configuration
      });
      await this.recordActivity(actor, "REPORT_PREVIEW", id, true, { datasetId: dataset.id });
      return { reportId: id, columns: result.columns, rows: result.rows };
    } catch (error) {
      await this.recordActivity(actor, "REPORT_PREVIEW", id, false, { datasetId: dataset.id }, error instanceof Error ? error.name : "REPORT_PREVIEW_FAILED");
      throw error;
    }
  }

  async previewPublic(id: string): Promise<ReportPreview> {
    const report = await this.reports.findPublicById(id);
    if (!report) throw new NotFoundError("REPORT_NOT_FOUND");
    const dataset = await this.datasets.findPublicById(report.datasetId);
    if (!dataset) throw new NotFoundError("REPORT_NOT_FOUND");
    const location = await this.datasets.getLocation(dataset.id);
    if (!dataset.selectedEngine || !location) throw new DatasetStorageUnavailableError();
    const result = await this.router.getAdapter(dataset.selectedEngine).queryForReport({
      ownerAdminId: dataset.ownerAdminId,
      datasetId: dataset.id,
      storageIdentifier: location.storageIdentifier,
      plan: this.persistedConfiguration(report.configuration)
    });
    return { reportId: id, columns: result.columns, rows: result.rows };
  }

  async publish(id: string, actor: ReportActor) {
    return this.changeVisibility(id, "PUBLIC", actor, "REPORT_PUBLISH");
  }

  async unpublish(id: string, actor: ReportActor) {
    return this.changeVisibility(id, "PRIVATE", actor, "REPORT_UNPUBLISH");
  }

  private async changeVisibility(id: string, visibility: "PUBLIC" | "PRIVATE", actor: ReportActor, action: string) {
    const report = await this.authorizeReport(id, actor);
    const updated = await this.reports.update(id, { visibility });
    await this.recordActivity(actor, action, id, true, { datasetId: report.datasetId, visibility });
    return this.serialize(updated as unknown as Record<string, unknown>);
  }

  private async authorizeReport(id: string, actor: ReportActor) {
    const report = actor.role === "SUPER_ADMIN" ? await this.reports.findById(id) : await this.reports.findOwnedById(id, actor.actorId!);
    if (!report) throw new NotFoundError("REPORT_NOT_FOUND");
    return report;
  }

  private async authorizeDataset(id: string, actor: ReportActor) {
    const dataset = await this.datasets.findById(id);
    if (!dataset) throw new NotFoundError("DATASET_NOT_FOUND");
    if (actor.role === "ADMIN" && dataset.ownerAdminId !== actor.actorId) throw new AuthorizationError();
    return dataset;
  }

  private async normalizeConfiguration(input: ReportConfiguration, dataset: Record<string, unknown>): Promise<ReportConfiguration> {
    const analysis = await this.datasets.getAnalysis(dataset.id as string);
    const available = fieldSet(dataset, analysis?.analysis as Record<string, unknown> | null);
    const allFields = [...input.selectedFields, ...input.grouping, ...input.filters.map((filter) => filter.field), ...input.aggregates.flatMap((aggregate) => aggregate.field ? [aggregate.field] : [])];
    if (input.aggregates.some((aggregate) => aggregate.operation !== "COUNT" && !aggregate.field)) throw new ReportValidationError("REPORT_AGGREGATE_FIELD_REQUIRED");
    if (available.size && allFields.some((field) => !available.has(field))) throw new ReportValidationError("REPORT_FIELD_NOT_FOUND");
    return {
      selectedFields: [...input.selectedFields],
      grouping: [...input.grouping],
      filters: input.filters.map((filter) => ({ ...filter, value: toReportValue(filter.value) })),
      aggregates: input.aggregates.map((aggregate) => ({ ...aggregate }))
    };
  }

  private persistedConfiguration(value: unknown): ReportQueryPlan {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReportValidationError();
    const configuration = value as Partial<ReportConfiguration>;
    if (!Array.isArray(configuration.selectedFields) || !Array.isArray(configuration.filters) || !Array.isArray(configuration.grouping) || !Array.isArray(configuration.aggregates)) throw new ReportValidationError();
    return {
      selectedFields: configuration.selectedFields.filter((field): field is string => typeof field === "string"),
      filters: configuration.filters.map((filter) => ({ field: filter.field, operator: filter.operator, value: toReportValue(filter.value) })),
      grouping: configuration.grouping.filter((field): field is string => typeof field === "string"),
      aggregates: configuration.aggregates.map((aggregate) => ({ operation: aggregate.operation, alias: aggregate.alias, ...(aggregate.field !== undefined ? { field: aggregate.field } : {}) }))
    };
  }

  private serialize(report: Record<string, unknown>) {
    return {
      id: report.id,
      datasetId: report.datasetId,
      ownerAdminId: report.ownerAdminId,
      title: report.title,
      description: report.description,
      configuration: report.configuration,
      visibility: report.visibility,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt
    };
  }

  private serializePublic(report: Record<string, unknown>, dataset: Record<string, unknown>) {
    return {
      id: report.id,
      datasetId: report.datasetId,
      title: report.title,
      description: report.description,
      visibility: report.visibility,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        classification: dataset.classification,
        recommendedEngine: dataset.recommendedEngine,
        selectedEngine: dataset.selectedEngine
      }
    };
  }

  private async recordActivity(actor: ReportActor, action: string, reportId: string, success: boolean, metadata?: unknown, errorCode?: string): Promise<void> {
    try {
      await this.dependencies.logger?.recordDatasetActivity({ actorType: actor.actorType, actorId: actor.actorId, actorEmail: actor.actorEmail, ipAddress: actor.ipAddress, userAgent: actor.userAgent, action, resourceType: "REPORT", resourceId: reportId, success, ...(metadata !== undefined ? { metadata } : {}), ...(errorCode !== undefined ? { errorCode } : {}) });
    } catch {
      // Activity logging must not interrupt report operations.
    }
  }
}
