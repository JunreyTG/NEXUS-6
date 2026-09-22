import type { DatabaseRecord, ReportAggregate, ReportQueryPlan } from "../database/types.js";

export type ReportVisibility = "PRIVATE" | "PUBLIC";
export type ReportFilter = ReportQueryPlan["filters"][number];

export type ReportConfiguration = {
  selectedFields: string[];
  filters: ReportFilter[];
  grouping: string[];
  aggregates: ReportAggregate[];
};

export type ReportInput = {
  datasetId: string;
  title: string;
  description?: string | null;
  configuration: ReportConfiguration;
  visibility: ReportVisibility;
};

export type ReportPatchInput = {
  title?: string;
  description?: string | null;
  configuration?: ReportConfiguration;
  visibility?: ReportVisibility;
};

export type ReportRecord = {
  id: string;
  datasetId: string;
  ownerAdminId: string;
  title: string;
  description: string | null;
  configuration: ReportConfiguration;
  visibility: ReportVisibility;
  createdAt: Date;
  updatedAt: Date;
};

export type ReportPreview = {
  reportId: string;
  columns: string[];
  rows: DatabaseRecord[];
};
