import type { DatabaseRecord, ReportQueryRequest, ReportQueryResult } from "../types.js";

export function validateIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value) || value.length > 190) throw new Error("Invalid storage identifier.");
  return value;
}

export function recordWithId(id: string, record: DatabaseRecord): DatabaseRecord {
  return { id, ...record };
}

export function getField(record: DatabaseRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined, record);
}

export function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

export function matchesFilter(actual: unknown, operator: string, expected: unknown): boolean {
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (operator === "contains") return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
  if (operator === "in") return Array.isArray(expected) && expected.includes(actual);
  if (operator === "gt") return typeof actual === "number" && actual > Number(expected);
  if (operator === "gte") return typeof actual === "number" && actual >= Number(expected);
  if (operator === "lt") return typeof actual === "number" && actual < Number(expected);
  if (operator === "lte") return typeof actual === "number" && actual <= Number(expected);
  return false;
}

export function sortRecords(records: DatabaseRecord[], sortBy: string | undefined, sortDirection: "asc" | "desc" | undefined): DatabaseRecord[] {
  if (!sortBy) return records;
  return [...records].sort((left, right) => compareValues(getField(left, sortBy), getField(right, sortBy)) * (sortDirection === "desc" ? -1 : 1));
}

function aggregate(records: DatabaseRecord[], aggregates: ReportQueryRequest["plan"]["aggregates"]): DatabaseRecord {
  return Object.fromEntries(aggregates.map((item) => {
    const values = item.field ? records.map((record) => getField(record, item.field!)).filter((value): value is number => typeof value === "number") : [];
    if (item.operation === "COUNT") return [item.alias, records.length];
    if (!values.length) return [item.alias, null];
    if (item.operation === "SUM") return [item.alias, values.reduce((sum, value) => sum + value, 0)];
    if (item.operation === "AVG") return [item.alias, values.reduce((sum, value) => sum + value, 0) / values.length];
    return [item.alias, item.operation === "MIN" ? Math.min(...values) : Math.max(...values)];
  }));
}

export function buildReport(records: DatabaseRecord[], plan: ReportQueryRequest["plan"]): ReportQueryResult {
  const filtered = records.filter((record) => plan.filters.every((filter) => matchesFilter(getField(record, filter.field), filter.operator, filter.value)));
  if (plan.grouping.length) {
    const groups = new Map<string, DatabaseRecord[]>();
    for (const record of filtered) {
      const key = JSON.stringify(plan.grouping.map((field) => getField(record, field)));
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    const resultRows = [...groups.values()].map((group) => ({ ...Object.fromEntries(plan.grouping.map((field) => [field, getField(group[0]!, field)])), ...aggregate(group, plan.aggregates) }) as DatabaseRecord);
    return { columns: [...plan.grouping, ...plan.aggregates.map((item) => item.alias)], rows: resultRows };
  }
  if (plan.aggregates.length) return { columns: [...plan.selectedFields, ...plan.aggregates.map((item) => item.alias)], rows: [{ ...Object.fromEntries(plan.selectedFields.map((field) => [field, getField(filtered[0] ?? {}, field)])), ...aggregate(filtered, plan.aggregates) } as DatabaseRecord] };
  const fields = plan.selectedFields.length ? plan.selectedFields : [...new Set(filtered.flatMap((record) => Object.keys(record)))];
  return { columns: fields, rows: filtered.map((record) => Object.fromEntries(fields.map((field) => [field, getField(record, field)])) as DatabaseRecord) };
}
