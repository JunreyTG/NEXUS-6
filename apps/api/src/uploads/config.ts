import { z } from "zod";

const uploadConfigSchema = z.object({
  // 0, "0", or "unlimited" represents unlimited GB upload. Positive integers configure custom limit in MB.
  MAX_UPLOAD_SIZE_MB: z.preprocess((value) => {
    if (value === undefined || value === null || value === "" || value === "0" || value === 0 || value === "unlimited" || value === "infinity" || value === "none") {
      return 0;
    }
    return value;
  }, z.coerce.number().int().min(0).default(0)),
  TEMP_UPLOAD_DIR: z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().min(1).optional()),
  TEMP_UPLOAD_RETENTION_HOURS: z.coerce.number().int().positive().max(720).default(24)
});

export type UploadConfig = z.infer<typeof uploadConfigSchema>;

export function requireUploadConfig(source: NodeJS.ProcessEnv = process.env): UploadConfig {
  const envSource: Record<string, unknown> = { ...source };

  // Support MAX_UPLOAD_SIZE_GB when specified
  if ((envSource["MAX_UPLOAD_SIZE_MB"] === undefined || envSource["MAX_UPLOAD_SIZE_MB"] === "") && envSource["MAX_UPLOAD_SIZE_GB"] !== undefined) {
    const gbVal = String(envSource["MAX_UPLOAD_SIZE_GB"]).trim().toLowerCase();
    if (gbVal === "0" || gbVal === "unlimited" || gbVal === "infinity" || gbVal === "none") {
      envSource["MAX_UPLOAD_SIZE_MB"] = 0;
    } else {
      const gbNum = Number(gbVal);
      if (!isNaN(gbNum) && gbNum >= 0) {
        envSource["MAX_UPLOAD_SIZE_MB"] = Math.round(gbNum * 1024);
      }
    }
  }

  const result = uploadConfigSchema.safeParse(envSource);
  if (!result.success) throw new Error("Invalid upload configuration.");
  return result.data;
}
