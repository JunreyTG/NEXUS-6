import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDatasetFile } from "../src/uploads/parsers.js";

async function temporaryFile(extension: string, contents: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus6-parser-test-"));
  const filePath = path.join(directory, `input.${extension}`);
  await writeFile(filePath, contents);
  return { directory, filePath };
}

describe("parseDatasetFile", () => {
  it("parses TSV files", async () => {
    const file = await temporaryFile("tsv", "id\tname\n1\tAlice\n2\tBob\n");
    try {
      await expect(parseDatasetFile(file.filePath, "TSV")).resolves.toEqual({ fileType: "TSV", recordCount: 2, detectedFields: ["id", "name"] });
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("parses NDJSON files", async () => {
    const file = await temporaryFile("ndjson", `${JSON.stringify({ id: 1, name: "Alice" })}\n${JSON.stringify({ id: 2, name: "Bob" })}\n`);
    try {
      const result = await parseDatasetFile(file.filePath, "NDJSON");
      expect(result.fileType).toBe("NDJSON");
      expect(result.recordCount).toBe(2);
      expect(result.detectedFields.sort()).toEqual(["id", "name"]);
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed NDJSON lines", async () => {
    const file = await temporaryFile("ndjson", `${JSON.stringify({ id: 1 })}\nnot json\n`);
    try {
      await expect(parseDatasetFile(file.filePath, "NDJSON")).rejects.toMatchObject({ code: "MALFORMED_FILE" });
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("parses XML records nested under a repeated element", async () => {
    const file = await temporaryFile("xml", "<rows><row><id>1</id><name>Alice</name></row><row><id>2</id><name>Bob</name></row></rows>");
    try {
      const result = await parseDatasetFile(file.filePath, "XML");
      expect(result.fileType).toBe("XML");
      expect(result.recordCount).toBe(2);
      expect(result.detectedFields.sort()).toEqual(["id", "name"]);
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("parses a single-record XML document", async () => {
    const file = await temporaryFile("xml", "<record><id>1</id><name>Alice</name></record>");
    try {
      const result = await parseDatasetFile(file.filePath, "XML");
      expect(result.recordCount).toBe(1);
      expect(result.detectedFields.sort()).toEqual(["id", "name"]);
    } finally {
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  it("rejects empty and malformed XML", async () => {
    const empty = await temporaryFile("xml", "   ");
    const malformed = await temporaryFile("xml", "<rows><row>");
    try {
      await expect(parseDatasetFile(empty.filePath, "XML")).rejects.toMatchObject({ code: "EMPTY_FILE" });
      await expect(parseDatasetFile(malformed.filePath, "XML")).rejects.toMatchObject({ code: "MALFORMED_FILE" });
    } finally {
      await rm(empty.directory, { recursive: true, force: true });
      await rm(malformed.directory, { recursive: true, force: true });
    }
  });
});
