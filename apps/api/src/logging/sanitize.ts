const sensitiveKey = /(password|token|secret|api[._-]?key|connection|string|credential|authorization|cookie|username|host|port|\bdatabase\b|uri|url|dsn|private[._-]?key|confirm.?password)/i;
const sensitiveValue = /^(bearer\s+|eyJ[a-zA-Z0-9_-]+\.|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|neo4j|couchbase|sqlserver):\/\/)/i;
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

export function sanitizeMetadata(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && key !== "databaseEngine" && (forbiddenKeys.has(key) || sensitiveKey.test(key))) return "[REDACTED]";
  if (typeof value === "string") return sensitiveValue.test(value) ? "[REDACTED]" : value.slice(0, 2000);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeMetadata(item, undefined, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value as object)) return "[CIRCULAR]";
    seen.add(value as object);
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .filter(([entryKey]) => !forbiddenKeys.has(entryKey))
        .map(([entryKey, entryValue]) => [entryKey, sanitizeMetadata(entryValue, entryKey, seen)] as const)
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

