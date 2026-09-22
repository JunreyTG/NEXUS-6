import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { AdminRepository } from "../src/repositories/admin.repository.js";
import { DatasetRepository } from "../src/repositories/dataset.repository.js";
import { ReportRepository } from "../src/repositories/report.repository.js";
import { SystemSettingRepository } from "../src/repositories/system-setting.repository.js";
import { DatabaseError } from "../src/errors/database-error.js";

function mockDatabase() {
  const admin = { findUnique: vi.fn().mockResolvedValue(null) };
  const dataset = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) };
  const report = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) };
  const systemSetting = { findUnique: vi.fn().mockResolvedValue(null) };
  const provider = () => ({ admin, dataset, report, systemSetting }) as unknown as PrismaClient;
  return { admin, dataset, report, systemSetting, provider };
}

describe("system repositories", () => {
  it("uses unique Admin identifiers and preserves not-found", async () => {
    const mock = mockDatabase();
    const repository = new AdminRepository(mock.provider);
    await expect(repository.findById("admin-id")).resolves.toBeNull();
    await repository.findByEmail("admin@example.test");
    expect(mock.admin.findUnique).toHaveBeenNthCalledWith(1, { where: { id: "admin-id" } });
    expect(mock.admin.findUnique).toHaveBeenNthCalledWith(2, { where: { email: "admin@example.test" } });
  });
  it("scopes dataset reads to their owner and bounds list queries", async () => {
    const mock = mockDatabase();
    const repository = new DatasetRepository(mock.provider);
    await repository.findOwnedById("dataset-id", "admin-id");
    await repository.listByOwner("admin-id");
    expect(mock.dataset.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "dataset-id", ownerAdminId: "admin-id" } }));
    expect(mock.dataset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerAdminId: "admin-id" }, take: 100 }));
  });
  it("scopes report reads to their owner", async () => {
    const mock = mockDatabase();
    const repository = new ReportRepository(mock.provider);
    await repository.findOwnedById("report-id", "admin-id");
    await repository.listByOwner("admin-id");
    expect(mock.report.findFirst).toHaveBeenCalledWith({ where: { id: "report-id", ownerAdminId: "admin-id" } });
    expect(mock.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerAdminId: "admin-id" }, take: 100 }));
  });
  it("reads settings by unique key", async () => {
    const mock = mockDatabase();
    await new SystemSettingRepository(mock.provider).findByKey("display.theme");
    expect(mock.systemSetting.findUnique).toHaveBeenCalledWith({ where: { key: "display.theme" } });
  });
  it("wraps driver and configuration failures", async () => {
    const mock = mockDatabase();
    mock.admin.findUnique.mockRejectedValue(new Error("sensitive driver message"));
    await expect(new AdminRepository(mock.provider).findById("id")).rejects.toBeInstanceOf(DatabaseError);
    const repository = new DatasetRepository(() => { throw new Error("sensitive URL"); });
    await expect(repository.listByOwner("id")).rejects.toThrow("System database unavailable.");
  });
});
