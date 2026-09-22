import { z } from "zod";

const fieldName = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_$.[\]-]+$/);
const filterSchema = z.object({
  field: fieldName,
  operator: z.enum(["eq", "neq", "contains", "gt", "gte", "lt", "lte", "in"]),
  value: z.unknown()
}).strict();
const aggregateSchema = z.object({
  operation: z.enum(["COUNT", "SUM", "AVG", "MIN", "MAX"]),
  field: fieldName.optional(),
  alias: fieldName
}).strict();

export const reportConfigurationSchema = z.object({
  selectedFields: z.array(fieldName).max(100),
  filters: z.array(filterSchema).max(50),
  grouping: z.array(fieldName).max(20),
  aggregates: z.array(aggregateSchema).max(20)
}).strict();

export const reportCreateSchema = z.object({
  datasetId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  configuration: reportConfigurationSchema,
  visibility: z.enum(["PRIVATE", "PUBLIC"])
}).strict();

export const reportPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  configuration: reportConfigurationSchema.optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).optional()
}).strict().refine((value) => Object.keys(value).length > 0);
