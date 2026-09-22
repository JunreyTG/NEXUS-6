import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { getDatasetDatabaseConfig, getDatasetDatabaseStatuses } from "../src/config/dataset-databases.js";
import { createPublicRouter } from "../src/routes/public.routes.js";
import { PublicService } from "../src/services/public.service.js";

describe("Phase 11 dataset database configuration", () => {
  it("detects complete optional engine groups without exposing values in status", () => {
    const source = {
      MONGODB_URI: "mongodb://private",
      MYSQL_HOST: "mysql.internal",
      MYSQL_DATABASE: "data",
      MYSQL_USER: "reader",
      MYSQL_PASSWORD: "secret",
      POSTGRES_DATA_HOST: "postgres.internal",
      POSTGRES_DATA_DATABASE: "data",
      POSTGRES_DATA_USER: "reader",
      POSTGRES_DATA_PASSWORD: "secret",
      COUCHBASE_CONNECTION_STRING: "couchbase://private",
      COUCHBASE_USERNAME: "reader",
      COUCHBASE_PASSWORD: "secret",
      COUCHBASE_BUCKET: "data",
      NEO4J_URI: "neo4j://private",
      NEO4J_USERNAME: "reader",
      NEO4J_PASSWORD: "secret",
      SQLSERVER_HOST: "sql.internal",
      SQLSERVER_DATABASE: "data",
      SQLSERVER_USER: "reader",
      SQLSERVER_PASSWORD: "secret"
    };
    expect(Object.values(getDatasetDatabaseStatuses(source))).toEqual(["configured", "configured", "configured", "configured", "configured", "configured"]);
    expect(JSON.stringify(getDatasetDatabaseStatuses(source))).not.toMatch(/secret|private|reader/);
    expect(getDatasetDatabaseConfig(source).MYSQL.password).toBe("secret");
  });

  it("treats incomplete or invalid optional configuration as not configured", () => {
    const statuses = getDatasetDatabaseStatuses({ MYSQL_HOST: "host", MYSQL_PORT: "invalid", MYSQL_DATABASE: "data", MYSQL_USER: "user", MYSQL_PASSWORD: "password" });
    expect(statuses.MYSQL).toBe("not_configured");
    expect(statuses.POSTGRESQL).toBe("not_configured");
  });
});

describe("Phase 11 public portal", () => {
  it("filters private dataset/report metadata and never serializes owner or storage fields", async () => {
    const publicDataset = { id: "11111111-1111-4111-8111-111111111111", name: "Public data", description: "Approved", classification: "RELATIONAL", recommendedEngine: "POSTGRESQL", selectedEngine: null, recordCount: BigInt(4), createdAt: new Date(), updatedAt: new Date(), ownerAdminId: "private-owner", temporaryFileKey: "private-file", location: { storageIdentifier: "private-location" } };
    const publicReport = { id: "22222222-2222-4222-8222-222222222222", datasetId: publicDataset.id, ownerAdminId: "private-owner", title: "Public report", description: "Approved", visibility: "PUBLIC", configuration: {}, createdAt: new Date(), updatedAt: new Date() };
    const privateReport = { ...publicReport, id: "33333333-3333-4333-8333-333333333333", datasetId: "44444444-4444-4444-8444-444444444444" };
    const datasets = { listPublic: async () => [publicDataset], findPublicById: async (id: string) => id === publicDataset.id ? publicDataset : null };
    const reports = { listPublic: async () => [publicReport, privateReport] };
    const reportService = { getPublic: async () => ({ id: publicReport.id, datasetId: publicDataset.id, title: publicReport.title, description: publicReport.description, configuration: {}, visibility: "PUBLIC", createdAt: publicReport.createdAt, updatedAt: publicReport.updatedAt, dataset: { id: publicDataset.id, name: publicDataset.name } }), previewPublic: async () => ({ reportId: publicReport.id, columns: ["count"], rows: [{ count: 4 }] }) };
    const service = new PublicService({ datasets: datasets as never, reports: reports as never, reportService: reportService as never });
    const app = express().use("/api/public", createPublicRouter(service));

    const datasetsResponse = await request(app).get("/api/public/datasets");
    expect(datasetsResponse.status).toBe(200);
    expect(datasetsResponse.body.items).toHaveLength(1);
    expect(JSON.stringify(datasetsResponse.body)).not.toMatch(/ownerAdminId|temporaryFileKey|storageIdentifier/);

    const reportsResponse = await request(app).get("/api/public/reports");
    expect(reportsResponse.status).toBe(200);
    expect(reportsResponse.body.items).toHaveLength(1);
    expect(JSON.stringify(reportsResponse.body)).not.toMatch(/ownerAdminId|configuration/);
  });
});
