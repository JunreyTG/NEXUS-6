import "../config/load-env.js";
import { z } from "zod";
import { AuthConfigurationError } from "./errors.js";

const authEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPER_ADMIN_EMAIL: z.string().trim().email().transform((value) => value.toLowerCase()),
  SUPER_ADMIN_PASSWORD_HASH: z.string().trim().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().trim().regex(/^\d+(s|m|h|d)$/).default("15m"),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive().max(365).default(30)
});

export type AuthConfig = z.infer<typeof authEnvSchema>;

export function requireAuthConfig(source: NodeJS.ProcessEnv = process.env): AuthConfig {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) throw new AuthConfigurationError();
  return result.data;
}
