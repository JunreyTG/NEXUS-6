import { DatabaseNotConfiguredError, DatasetStorageUnavailableError } from "../database/errors.js";
import type { DatabaseEngine } from "../database/types.js";
import { DatasetRepository } from "../repositories/dataset.repository.js";
import { ReportRepository } from "../repositories/report.repository.js";
import { ReportService } from "./report.service.js";

export type PublicPage = { page: number; pageSize: number; total: number };

export class PublicService {
  constructor(
    private readonly dependencies: {
      datasets?: DatasetRepository;
      reports?: ReportRepository;
      reportService?: ReportService;
    } = {}
  ) {}

  private get datasets(): DatasetRepository { return this.dependencies.datasets ?? new DatasetRepository(); }
  private get reports(): ReportRepository { return this.dependencies.reports ?? new ReportRepository(); }
  private get reportService(): ReportService { return this.dependencies.reportService ?? new ReportService({ datasets: this.datasets, reports: this.reports }); }

  async listDatasets(query: { page: number; pageSize: number; search?: string | undefined; classification?: string | undefined; engine?: DatabaseEngine | undefined }) {
    const datasets = (await this.datasets.listPublic()).filter((dataset) => {
      const value = dataset as unknown as Record<string, unknown>;
      const search = query.search?.toLowerCase();
      return (!search || `${value.name ?? ""} ${value.description ?? ""}`.toLowerCase().includes(search))
        && (!query.classification || value.classification === query.classification)
        && (!query.engine || value.selectedEngine === query.engine || value.recommendedEngine === query.engine);
    });
    const page = paginate(datasets, query.page, query.pageSize);
    return { items: page.items.map((dataset) => publicDataset(dataset as unknown as Record<string, unknown>)), ...page.meta };
  }

  async getDataset(id: string) {
    const dataset = await this.datasets.findPublicById(id);
    if (!dataset) return null;
    const publicReports = (await this.reports.listPublic()).filter((report) => report.datasetId === id);
    return {
      ...publicDataset(dataset as unknown as Record<string, unknown>),
      reports: publicReports.map((report) => publicReport(report as unknown as Record<string, unknown>))
    };
  }

  async listReports(query: { page: number; pageSize: number; search?: string | undefined; datasetId?: string | undefined }) {
    const reports = await this.reports.listPublic();
    const publicDatasetIds = new Set((await this.datasets.listPublic()).map((dataset) => dataset.id));
    const filtered = reports.filter((report) => {
      const value = report as unknown as Record<string, unknown>;
      const search = query.search?.toLowerCase();
      return publicDatasetIds.has(report.datasetId)
        && (!query.datasetId || report.datasetId === query.datasetId)
        && (!search || `${value.title ?? ""} ${value.description ?? ""}`.toLowerCase().includes(search));
    });
    const page = paginate(filtered, query.page, query.pageSize);
    return { items: page.items.map((report) => publicReport(report as unknown as Record<string, unknown>)), ...page.meta };
  }

  async getReport(id: string) {
    const report = await this.reportService.getPublic(id);
    let result: unknown = null;
    let unavailable = false;
    try {
      result = await this.reportService.previewPublic(id);
    } catch (error) {
      if (error instanceof DatabaseNotConfiguredError || error instanceof DatasetStorageUnavailableError) unavailable = true;
      else throw error;
    }
    return { report, result, unavailable };
  }

  async getStatistics() {
    const [datasets, reports] = await Promise.all([this.datasets.listPublic(), this.reports.listPublic()]);
    const publicDatasetIds = new Set(datasets.map((dataset) => dataset.id));
    const publicReports = reports.filter((report) => publicDatasetIds.has(report.datasetId));
    const classifications: Record<string, number> = {};
    const engines: Record<string, number> = {};
    for (const dataset of datasets) {
      const classification = String(dataset.classification ?? "UNKNOWN");
      classifications[classification] = (classifications[classification] ?? 0) + 1;
      const engine = dataset.selectedEngine ?? dataset.recommendedEngine;
      if (engine) engines[engine] = (engines[engine] ?? 0) + 1;
    }
    return { datasets: datasets.length, reports: publicReports.length, classifications, engines };
  }
}

function publicDataset(dataset: Record<string, unknown>) {
  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    classification: dataset.classification,
    recommendedEngine: dataset.recommendedEngine,
    selectedEngine: dataset.selectedEngine,
    recordCount: serializeCount(dataset.recordCount),
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt
  };
}

function publicReport(report: Record<string, unknown>) {
  return {
    id: report.id,
    datasetId: report.datasetId,
    title: report.title,
    description: report.description,
    visibility: report.visibility,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
  };
}

function serializeCount(value: unknown) {
  return typeof value === "bigint" ? value.toString() : value ?? null;
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), meta: { page, pageSize, total: items.length } };
}
