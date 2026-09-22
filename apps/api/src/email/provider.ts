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

export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly config: EmailConfig) {}

  async sendVerificationEmail(message: VerificationEmail): Promise<void> {
    await this.send({
      to: message.to,
      subject: "Verify your NEXUS-6 administrator email",
      html: `<p>Hello ${escapeHtml(message.name)},</p><p>Verify your administrator email by opening <a href="${escapeHtml(message.verificationUrl)}">this link</a>.</p>`
    });
  }

  async sendPasswordResetEmail(message: PasswordSetupEmail): Promise<void> {
    await this.send({
      to: message.to,
      subject: "Set up your NEXUS-6 administrator password",
      html: `<p>Hello ${escapeHtml(message.name)},</p><p>Set your password by opening <a href="${escapeHtml(message.setupUrl)}">this link</a>.</p>`
    });
  }

  private async send(message: { to: string; subject: string; html: string }): Promise<void> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from: this.config.EMAIL_FROM, ...message })
      });
      if (!response.ok) throw new EmailProviderError();
    } catch (error) {
      if (error instanceof EmailProviderError) throw error;
      throw new EmailProviderError();
    }
  }
}

export function createEmailProvider(config: EmailConfig): EmailProvider {
  return config.EMAIL_PROVIDER === "resend" ? new ResendEmailProvider(config) : new ConsoleEmailProvider(config);
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
