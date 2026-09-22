const sensitiveKey = /(password|token|secret|api[._-]?key|connection|credential|authorization|cookie)/i;
const sensitiveValue = /^(bearer\s+|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/)/i;

export function sanitizeMetadata(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return sensitiveValue.test(value) ? "[REDACTED]" : value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeMetadata(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100)
      .map(([entryKey, entryValue]) => [entryKey, sanitizeMetadata(entryValue, entryKey)] as const)
      .filter(([, entryValue]) => entryValue !== undefined));
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}
