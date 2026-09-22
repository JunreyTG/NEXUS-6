import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { DatasetAnalyzer } from "../src/analysis/analyzer.js";

async function temporaryFile(extension: string, contents: string | Buffer) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus6-analysis-test-"));
  const filePath = path.join(directory, `input.${extension}`);
  await writeFile(filePath, contents);
  return { directory, filePath };
}

describe("dataset analysis", () => {
  it("classifies consistent CSV data as relational and reports nulls", async () => {
    const file = await temporaryFile("csv", "id,name,age\n1,Alice,30\n2,Bob,\n");
    try {
      const result = await new DatasetAnalyzer().analyze(file.filePath, "CSV");
      expect(result.classification).toBe("RELATIONAL");
      expect(result.recommendedEngine).toBe("POSTGRESQL");
      expect(result.characteristics.candidateIds).toContain("id");
      expect(result.characteristics.fields.find((field) => field.name === "age")?.nullPercentage).toBe(50);
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("detects nested document structure and produces stable recommendations", async () => {
    const file = await temporaryFile("json", JSON.stringify([
      { id: "a", profile: { city: "A" }, tags: ["one", "two"] },
      { id: "b", profile: { city: "B", zip: "2" }, tags: [] }
    ]));
    try {
      const analyzer = new DatasetAnalyzer();
      const first = await analyzer.analyze(file.filePath, "JSON");
      const second = await analyzer.analyze(file.filePath, "JSON");
      expect(first).toEqual(second);
      expect(first.classification).toBe("DOCUMENT");
      expect(first.recommendedEngine).toBe("MONGODB");
      expect(first.characteristics.arrayFields).toContain("tags");
      expect(first.characteristics.nestedFields).toContain("profile");
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("detects graph and key-value patterns", async () => {
    const graph = await temporaryFile("json", JSON.stringify([{ source: "a", target: "b" }, { source: "b", target: "c" }]));
    const keyValue = await temporaryFile("json", JSON.stringify([{ key: "theme", value: "dark" }, { key: "locale", value: "en" }]));
    try {
      await expect(new DatasetAnalyzer().analyze(graph.filePath, "JSON")).resolves.toMatchObject({ classification: "GRAPH", recommendedEngine: "NEO4J" });
      await expect(new DatasetAnalyzer().analyze(keyValue.filePath, "JSON")).resolves.toMatchObject({ classification: "KEY_VALUE", recommendedEngine: "COUCHBASE" });
    } finally {
      await rm(graph.directory, { recursive: true, force: true });
      await rm(keyValue.directory, { recursive: true, force: true });
    }
  });

  it("analyzes XLSX without persisting source contents", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data");
    worksheet.addRow(["id", "value"]);
    worksheet.addRow([1, "one"]);
    const file = await temporaryFile("xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
    try {
      const result = await new DatasetAnalyzer().analyze(file.filePath, "XLSX");
      expect(result.characteristics.recordCount).toBe(1);
      expect(JSON.stringify(result)).not.toContain("one");
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });
});
