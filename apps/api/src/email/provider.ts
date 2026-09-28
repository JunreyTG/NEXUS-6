import { EmailProviderError } from "../errors/app-error.js";
import type { EmailConfig } from "./config.js";

export type VerificationEmail = {
  to: string;
  name: string;
  verificationUrl: string;
};

export type PasswordSetupEmail = {
  to: string;
  name: string;
  setupUrl: string;
};

export interface EmailProvider {
  sendVerificationEmail(message: VerificationEmail): Promise<void>;
  sendPasswordResetEmail(message: PasswordSetupEmail): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  constructor(private readonly config: EmailConfig) {}

  async sendVerificationEmail(message: VerificationEmail): Promise<void> {
    if (this.config.nodeEnv === "production") throw new EmailProviderError();
    console.info(`[NEXUS-6 email] verification email queued for ${message.to}`);
  }

  async sendPasswordResetEmail(message: PasswordSetupEmail): Promise<void> {
    if (this.config.nodeEnv === "production") throw new EmailProviderError();
    console.info(`[NEXUS-6 email] password setup email queued for ${message.to}`);
  }
}

export class BrevoEmailProvider implements EmailProvider {
  constructor(private readonly config: EmailConfig) {}

  async sendVerificationEmail(message: VerificationEmail): Promise<void> {
    await this.send({
      to: [{ email: message.to, name: message.name }],
      subject: "Verify your DataVault6 administrator email",
      htmlContent: `<p>Hello ${escapeHtml(message.name)},</p><p>Verify your administrator email by opening <a href="${escapeHtml(message.verificationUrl)}">this link</a>.</p>`
    });
  }

  async sendPasswordResetEmail(message: PasswordSetupEmail): Promise<void> {
    await this.send({
      to: [{ email: message.to, name: message.name }],
      subject: "Set up your DataVault6 administrator password",
      htmlContent: `<p>Hello ${escapeHtml(message.name)},</p><p>Set your password by opening <a href="${escapeHtml(message.setupUrl)}">this link</a>.</p>`
    });
  }

  private async send(payload: { to: Array<{ email: string; name?: string }>; subject: string; htmlContent: string }): Promise<void> {
    try {
      const senderEmail = this.config.BREVO_SENDER_EMAIL || extractEmail(this.config.EMAIL_FROM) || "daplinankaila91@gmail.com";
      const senderName = this.config.BREVO_SENDER_NAME || extractName(this.config.EMAIL_FROM) || "DataVault6";

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": this.config.BREVO_API_KEY!,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: payload.to,
          subject: payload.subject,
          htmlContent: payload.htmlContent
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`[Brevo Email Error] HTTP ${response.status}: ${errorText}`);
        throw new EmailProviderError();
      }
    } catch (error) {
      if (error instanceof EmailProviderError) throw error;
      throw new EmailProviderError();
    }
  }
}

export function createEmailProvider(config: EmailConfig): EmailProvider {
  return (config.EMAIL_PROVIDER === "brevo" || config.EMAIL_PROVIDER === "brevos")
    ? new BrevoEmailProvider(config)
    : new ConsoleEmailProvider(config);
}

function extractEmail(str: string): string | null {
  const match = str.match(/<([^>]+)>/) || str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match && match[1] ? match[1] : null;
}

function extractName(str: string): string | null {
  const match = str.match(/^([^<]+)</);
  return match && match[1] ? match[1].trim() : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}
