import { createHash } from "node:crypto";

export type StorageIdentifierInput = {
  ownerAdminId: string;
  datasetId: string;
};

function normalizeIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "unknown";
}

export function generateStorageIdentifier(input: StorageIdentifierInput): string;
export function generateStorageIdentifier(ownerAdminId: string, datasetId: string): string;
export function generateStorageIdentifier(inputOrOwner: StorageIdentifierInput | string, datasetId?: string): string {
  const input = typeof inputOrOwner === "string" ? { ownerAdminId: inputOrOwner, datasetId: datasetId ?? "" } : inputOrOwner;
  const owner = normalizeIdentifier(input.ownerAdminId);
  const dataset = normalizeIdentifier(input.datasetId);
  // MySQL table identifiers are capped at 64 characters, the strictest limit among the
  // supported relational engines (PostgreSQL 63, SQL Server 128) - stay under that everywhere.
  const MAX_LENGTH = 63;
  const base = `admin_${owner}_dataset_${dataset}`;
  if (base.length <= MAX_LENGTH) return base;
  const digest = createHash("sha256").update(`${input.ownerAdminId}\0${input.datasetId}`).digest("hex").slice(0, 12);
  return `admin_${owner.slice(0, 17)}_dataset_${dataset.slice(0, 18)}_${digest}`.slice(0, MAX_LENGTH);
}
