import ExcelJS from "exceljs";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { UploadValidationError } from "../errors/app-error.js";

export type StructuredRecord = Record<string, unknown>;

export function parseDelimitedRows(text: string, delimiter: string): string[][] {
  if (!text.trim()) throw new UploadValidationError("EMPTY_FILE");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new UploadValidationError("MALFORMED_FILE");
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  if (!rows.length) throw new UploadValidationError("EMPTY_FILE");
  return rows;
}

export function parseJsonRecords(text: string): StructuredRecord[] {
  if (!text.trim()) throw new UploadValidationError("EMPTY_FILE");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UploadValidationError("MALFORMED_FILE");
  }
  if (Array.isArray(value)) {
    const records = value.filter((item): item is StructuredRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    if (!records.length) throw new UploadValidationError("EMPTY_FILE");
    return records;
  }
  if (value && typeof value === "object") return [value as StructuredRecord];
  throw new UploadValidationError("MALFORMED_FILE");
}

export function parseNdjsonRecords(text: string): StructuredRecord[] {
  if (!text.trim()) throw new UploadValidationError("EMPTY_FILE");
  const records: StructuredRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new UploadValidationError("MALFORMED_FILE");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new UploadValidationError("MALFORMED_FILE");
    records.push(value as StructuredRecord);
  }
  if (!records.length) throw new UploadValidationError("EMPTY_FILE");
  return records;
}

function findRecordArray(value: unknown, depth = 0): StructuredRecord[] | null {
  if (depth > 6 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const records = value.filter((item): item is StructuredRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    return records.length ? records : null;
  }
  for (const child of Object.values(value as StructuredRecord)) {
    const found = findRecordArray(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function deepestSingleObject(value: unknown): StructuredRecord | null {
  let current = value;
  while (current && typeof current === "object" && !Array.isArray(current) && Object.keys(current as StructuredRecord).length === 1) {
    current = Object.values(current as StructuredRecord)[0];
  }
  return current && typeof current === "object" && !Array.isArray(current) ? (current as StructuredRecord) : null;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

export function parseXmlRecords(text: string): StructuredRecord[] {
  if (!text.trim()) throw new UploadValidationError("EMPTY_FILE");
  if (XMLValidator.validate(text) !== true) throw new UploadValidationError("MALFORMED_FILE");
  let value: unknown;
  try {
    value = xmlParser.parse(text);
  } catch {
    throw new UploadValidationError("MALFORMED_FILE");
  }
  if (!value || typeof value !== "object") throw new UploadValidationError("MALFORMED_FILE");
  const records = findRecordArray(value) ?? (deepestSingleObject(value) ? [deepestSingleObject(value)!] : null);
  if (!records || !records.length) throw new UploadValidationError("EMPTY_FILE");
  return records;
}

export async function loadXlsxWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  if (!buffer.length) throw new UploadValidationError("EMPTY_FILE");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);
  } catch {
    throw new UploadValidationError("MALFORMED_FILE");
  }
  return workbook;
}
