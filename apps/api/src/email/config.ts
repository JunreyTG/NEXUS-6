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
  BREVO_SMTP_KEY: optionalEmpty(z.string().trim().min(1).optional()),
  BREVO_SMTP_USER: optionalEmpty(z.string().trim().min(1).optional()),
  BREVO_SMTP_HOST: optionalEmpty(z.string().trim().min(1).default("smtp-relay.brevo.com")),
  BREVO_SMTP_PORT: z.coerce.number().int().positive().default(587),
  BREVO_SENDER_EMAIL: optionalEmpty(z.string().trim().email().optional()),
  BREVO_SENDER_NAME: optionalEmpty(z.string().trim().min(1).default("DataVault6")),
  VERIFICATION_TOKEN_EXPIRES_HOURS: z.coerce.number().int().positive().max(168).default(24),
  PASSWORD_SETUP_TOKEN_EXPIRES_MINUTES: z.coerce.number().int().positive().max(1440).default(30),
  APP_BASE_URL: optionalEmpty(z.string().trim().url().optional())
});

export type EmailConfig = z.infer<typeof emailEnvSchema> & {
  webOrigin: string;
  appBaseUrl: string;
  nodeEnv: string;
};

export function requireEmailConfig(source: NodeJS.ProcessEnv = process.env): EmailConfig {
  const result = emailEnvSchema.safeParse(source);
  const isBrevo = result.success && (result.data.EMAIL_PROVIDER === "brevo" || result.data.EMAIL_PROVIDER === "brevos");
  if (!result.success || (isBrevo && !result.data.BREVO_API_KEY)) {
    throw new EmailProviderError();
  }

  // Prioritize APP_BASE_URL (configured public HTTPS URL), fallback to WEB_ORIGIN or default
  const rawBaseUrl = result.data.APP_BASE_URL || source.APP_BASE_URL || source.PUBLIC_APP_URL || source.WEB_ORIGIN || env.APP_BASE_URL || env.WEB_ORIGIN || "http://localhost:8080";
  const normalizedBaseUrl = rawBaseUrl.trim().replace(/\/+$/, "");

  return {
    ...result.data,
    webOrigin: normalizedBaseUrl,
    appBaseUrl: normalizedBaseUrl,
    nodeEnv: env.NODE_ENV
  };
}
