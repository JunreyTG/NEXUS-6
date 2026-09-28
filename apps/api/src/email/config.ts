import "../config/load-env.js";
import { z } from "zod";
import { env } from "../config/env.js";
import { EmailProviderError } from "../errors/app-error.js";

const optionalEmpty = (schema: z.ZodTypeAny) =>
  z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, schema);

const emailEnvSchema = z.object({
  EMAIL_PROVIDER: optionalEmpty(z.enum(["console", "brevo", "brevos"]).default("console")),
  EMAIL_FROM: optionalEmpty(z.string().trim().min(1).default("DataVault6 <noreply@localhost>")),
  BREVO_API_KEY: optionalEmpty(z.string().trim().min(1).optional()),
  BREVO_SENDER_EMAIL: optionalEmpty(z.string().trim().email().optional()),
  BREVO_SENDER_NAME: optionalEmpty(z.string().trim().min(1).default("DataVault6")),
  VERIFICATION_TOKEN_EXPIRES_HOURS: z.coerce.number().int().positive().max(168).default(24),
  PASSWORD_SETUP_TOKEN_EXPIRES_MINUTES: z.coerce.number().int().positive().max(1440).default(30)
});

export type EmailConfig = z.infer<typeof emailEnvSchema> & { webOrigin: string; nodeEnv: string };

export function requireEmailConfig(source: NodeJS.ProcessEnv = process.env): EmailConfig {
  const result = emailEnvSchema.safeParse(source);
  const isBrevo = result.success && (result.data.EMAIL_PROVIDER === "brevo" || result.data.EMAIL_PROVIDER === "brevos");
  if (!result.success || (isBrevo && !result.data.BREVO_API_KEY)) {
    throw new EmailProviderError();
  }
  return { ...result.data, webOrigin: env.WEB_ORIGIN, nodeEnv: env.NODE_ENV };
}
