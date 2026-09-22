import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { UploadValidationError } from "../errors/app-error.js";
import { RecommendationService } from "./recommendation.service.js";
import type { AnalysisResult, DatasetCharacteristics, FieldAnalysis } from "./types.js";

const MAX_ANALYZED_RECORDS = 5000;
const MAX_FIELDS = 200;
const MAX_UNIQUE_VALUES = 500;
type RecordValue = Record<string, unknown>;

type FieldState = { nullCount: number; seen: number; nonNull: number; types: Set<string>; values: Set<string> };

function typeOfValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "object") return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") {
    if (/^-?\d+$/.test(value.trim())) return "integer";
    if (/^-?\d*\.\d+$/.test(value.trim())) return "number";
    if (/^(true|false)$/i.test(value.trim())) return "boolean";
    if (!Number.isNaN(Date.parse(value)) && /[-/:]/.test(value)) return "date";
    return "string";
  }
  return "string";
}

function csvRows(text: string): string[][] {
  if (!text.trim()) throw new UploadValidationError("EMPTY_FILE");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  if (quoted) throw new UploadValidationError("MALFORMED_FILE");
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) rows.push(row); }
  if (!rows.length) throw new UploadValidationError("EMPTY_FILE");
  return rows;
}

function parseJsonRecords(text: string): RecordValue[] {
  if (!text.trim()) throw new UploadValidationError("EMPTY_FILE");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new UploadValidationError("MALFORMED_FILE"); }
  if (Array.isArray(value)) return value.filter((item): item is RecordValue => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, MAX_ANALYZED_RECORDS);
  if (value && typeof value === "object" && !Array.isArray(value)) return [value as RecordValue];
  throw new UploadValidationError("MALFORMED_FILE");
}

async function readRecords(filePath: string, fileType: "CSV" | "JSON" | "XLSX"): Promise<{ records: RecordValue[]; recordCount: number }> {
  const buffer = await readFile(filePath);
  if (!buffer.length) throw new UploadValidationError("EMPTY_FILE");
  if (fileType === "JSON") {
    const records = parseJsonRecords(buffer.toString("utf8"));
    return { records, recordCount: records.length };
  }
  if (fileType === "CSV") {
    const rows = csvRows(buffer.toString("utf8"));
    const fields = rows[0]!.map((field, index) => field.trim() || `column_${index + 1}`);
    const records = rows.slice(1, MAX_ANALYZED_RECORDS + 1).map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index] ?? null])));
    return { records, recordCount: Math.max(0, rows.length - 1) };
  }
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]); } catch { throw new UploadValidationError("MALFORMED_FILE"); }
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 1) throw new UploadValidationError("EMPTY_FILE");
  const fields = (worksheet.getRow(1).values as unknown[]).slice(1).map((field, index) => String(field ?? "").trim() || `column_${index + 1}`);
  const records: RecordValue[] = [];
  let recordCount = 0;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1 || recordCount >= MAX_ANALYZED_RECORDS) return;
    const values = row.values as unknown as unknown[];
    if (!values.some((value) => value !== null && value !== undefined && String(value).trim() !== "")) return;
    recordCount += 1;
    records.push(Object.fromEntries(fields.map((field, index) => [field, values[index + 1] ?? null])));
  });
  let totalCount = 0;
  worksheet.eachRow((row, rowNumber) => { if (rowNumber > 1 && (row.values as unknown as unknown[]).some((value) => value !== null && value !== undefined && String(value).trim() !== "")) totalCount += 1; });
  return { records, recordCount: totalCount };
}

function addField(state: Map<string, FieldState>, name: string, value: unknown, recordIndex: number, nestedFields: Set<string>, arrayFields: Set<string>, maxDepth: { value: number }): void {
  if (state.size >= MAX_FIELDS && !state.has(name)) return;
  const field = state.get(name) ?? { nullCount: 0, seen: 0, nonNull: 0, types: new Set<string>(), values: new Set<string>() };
  field.seen += 1;
  const valueType = typeOfValue(value);
  field.types.add(valueType);
  if (valueType === "null") field.nullCount += 1;
  else {
    field.nonNull += 1;
    if (field.values.size < MAX_UNIQUE_VALUES) field.values.add(JSON.stringify(value));
  }
  state.set(name, field);
  const depth = name.split(".").length;
  maxDepth.value = Math.max(maxDepth.value, depth);
  if (valueType === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    nestedFields.add(name);
    for (const [child, childValue] of Object.entries(value)) addField(state, `${name}.${child}`, childValue, recordIndex, nestedFields, arrayFields, maxDepth);
  }
  if (valueType === "array" && Array.isArray(value)) {
    arrayFields.add(name);
    for (const item of value.slice(0, 20)) if (item && typeof item === "object" && !Array.isArray(item)) for (const [child, childValue] of Object.entries(item)) addField(state, `${name}[].${child}`, childValue, recordIndex, nestedFields, arrayFields, maxDepth);
  }
}

function classify(characteristics: DatasetCharacteristics): AnalysisResult["classification"] {
  if (!characteristics.recordCount || !characteristics.fieldCount) return "UNKNOWN";
  if (characteristics.graphEdgePatterns) return "GRAPH";
  if (characteristics.keyValueCharacteristics) return "KEY_VALUE";
  if (characteristics.nestedObjects || characteristics.arrayFields.length || characteristics.flexibleDocumentStructure) return "DOCUMENT";
  return "RELATIONAL";
}

export class DatasetAnalyzer {
  constructor(private readonly recommendation = new RecommendationService()) {}

  async analyze(filePath: string, fileType: "CSV" | "JSON" | "XLSX"): Promise<AnalysisResult> {
    const { records, recordCount } = await readRecords(filePath, fileType);
    if (!recordCount || !records.length) throw new UploadValidationError("EMPTY_FILE");
    const state = new Map<string, FieldState>();
    const nestedFields = new Set<string>();
    const arrayFields = new Set<string>();
    const maxDepth = { value: 1 };
    records.forEach((record, index) => Object.entries(record).forEach(([name, value]) => addField(state, name, value, index, nestedFields, arrayFields, maxDepth)));
    const fields: FieldAnalysis[] = [...state.entries()].map(([name, field]) => ({ name, inferredTypes: [...field.types].sort(), nullCount: field.nullCount, nullPercentage: Number(((field.nullCount / records.length) * 100).toFixed(2)), uniqueEstimate: field.values.size, presencePercentage: Number(((field.seen / records.length) * 100).toFixed(2)) }));
    const relationshipLikeFields = fields.map((field) => field.name).filter((name) => /(^|[._])(id|ref|source|target|from|to|parent|child)(s|Id)?$/i.test(name));
    const candidateIds = fields.map((field) => field.name).filter((name) => /(^|[._])id$/i.test(name));
    const schemaConsistency = Number((fields.reduce((sum, field) => sum + field.presencePercentage, 0) / Math.max(1, fields.length) / 100).toFixed(3));
    const topLevelFields = fields.filter((field) => !field.name.includes(".") && !field.name.includes("[]"));
    const keyValueCharacteristics = topLevelFields.length === 2 && topLevelFields.some((field) => /^(key|name)$/i.test(field.name)) && topLevelFields.some((field) => /^(value|data)$/i.test(field.name));
    const graphEdgePatterns = relationshipLikeFields.some((name) => /(^|[._])(source|from)$/i.test(name)) && relationshipLikeFields.some((name) => /(^|[._])(target|to)$/i.test(name));
    const characteristics: DatasetCharacteristics = {
      recordCount, analyzedRecordCount: records.length, fieldCount: fields.length, fields, candidateIds, relationshipLikeFields,
      arrayFields: [...arrayFields].sort(), nestedFields: [...nestedFields].sort(), maxNestingDepth: maxDepth.value,
      schemaConsistency, nestedObjects: nestedFields.size > 0, flexibleDocumentStructure: schemaConsistency < 0.85 || nestedFields.size > 0 || arrayFields.size > 0,
      keyValueCharacteristics, graphEdgePatterns
    };
    const classification = classify(characteristics);
    const recommendation = this.recommendation.recommend(classification, characteristics);
    return { classification, ...recommendation, characteristics };
  }
}
