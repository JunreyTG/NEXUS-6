import { z } from "zod";

const uploadConfigSchema = z.object({
  // Legacy zero values are bounded rather than treated as unlimited.
  MAX_UPLOAD_SIZE_MB: z.preprocess((value) => value === "0" || value === 0 ? 100 : value, z.coerce.number().int().positive().max(100).default(100)),
  TEMP_UPLOAD_DIR: z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().min(1).optional()),
  TEMP_UPLOAD_RETENTION_HOURS: z.coerce.number().int().positive().max(720).default(24)
});

export type UploadConfig = z.infer<typeof uploadConfigSchema>;

export function requireUploadConfig(source: NodeJS.ProcessEnv = process.env): UploadConfig {
  const result = uploadConfigSchema.safeParse(source);
  if (!result.success) throw new Error("Invalid upload configuration.");
  return result.data;
}
