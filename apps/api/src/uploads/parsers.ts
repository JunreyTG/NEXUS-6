import { readFile } from "node:fs/promises";
import { UploadValidationError } from "../errors/app-error.js";
import { loadXlsxWorkbook, parseDelimitedRows, parseJsonRecords, parseNdjsonRecords, parseXmlRecords, type StructuredRecord } from "./dataset-formats.js";

export const DATASET_FILE_TYPES = ["CSV", "TSV", "JSON", "NDJSON", "XML", "XLSX"] as const;
export type DatasetFileType = (typeof DATASET_FILE_TYPES)[number];

export type ParsedDataset = {
  fileType: DatasetFileType;
  recordCount: number;
  detectedFields: string[];
};

function nonEmpty(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function fieldsFromRecords(records: StructuredRecord[]): string[] {
  return [...new Set(records.flatMap((record) => Object.keys(record)))].slice(0, 100);
}

function parseDelimited(text: string, delimiter: string, fileType: "CSV" | "TSV"): ParsedDataset {
  const rows = parseDelimitedRows(text, delimiter);
  const fields = rows[0]!.map((value, index) => nonEmpty(value) ?? `column_${index + 1}`);
  return { fileType, recordCount: Math.max(0, rows.length - 1), detectedFields: [...new Set(fields)] };
}

function parseJson(text: string): ParsedDataset {
  const records = parseJsonRecords(text);
  return { fileType: "JSON", recordCount: records.length, detectedFields: fieldsFromRecords(records) };
}

function parseNdjson(text: string): ParsedDataset {
  const records = parseNdjsonRecords(text);
  return { fileType: "NDJSON", recordCount: records.length, detectedFields: fieldsFromRecords(records) };
}

function parseXml(text: string): ParsedDataset {
  const records = parseXmlRecords(text);
  return { fileType: "XML", recordCount: records.length, detectedFields: fieldsFromRecords(records) };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedDataset> {
  const workbook = await loadXlsxWorkbook(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 1) throw new UploadValidationError("EMPTY_FILE");
  const header = worksheet.getRow(1).values as unknown[];
  const fields = header.slice(1).map((value, index) => nonEmpty(value) ?? `column_${index + 1}`);
  let recordCount = 0;
  worksheet.eachRow((row, rowNumber) => {
    const values = row.values as unknown as unknown[];
    if (rowNumber > 1 && values.some((value) => nonEmpty(value))) recordCount += 1;
  });
  return { fileType: "XLSX", recordCount, detectedFields: [...new Set(fields)].slice(0, 100) };
}

export async function parseDatasetFile(filePath: string, fileType: DatasetFileType): Promise<ParsedDataset> {
  if (fileType === "XLSX") return parseXlsx(await readFile(filePath));
  const text = (await readFile(filePath)).toString("utf8");
  if (fileType === "CSV") return parseDelimited(text, ",", "CSV");
  if (fileType === "TSV") return parseDelimited(text, "\t", "TSV");
  if (fileType === "JSON") return parseJson(text);
  if (fileType === "NDJSON") return parseNdjson(text);
  return parseXml(text);
}
