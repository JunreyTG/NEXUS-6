import { z } from "zod";

const uploadConfigSchema = z.object({
  // Zero disables the file-size limit.
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().nonnegative().max(100).default(0),
  TEMP_UPLOAD_DIR: z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().min(1).optional()),
  TEMP_UPLOAD_RETENTION_HOURS: z.coerce.number().int().positive().max(720).default(24)
});

export type UploadConfig = z.infer<typeof uploadConfigSchema>;

export function requireUploadConfig(source: NodeJS.ProcessEnv = process.env): UploadConfig {
  const result = uploadConfigSchema.safeParse(source);
  if (!result.success) throw new Error("Invalid upload configuration.");
  return result.data;
}
