import nodemailer from "nodemailer";
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
      htmlContent: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
          <div style="margin-bottom: 24px;">
            <span style="font-size: 20px; font-weight: 800; color: #38bdf8; letter-spacing: -0.02em;">DataVault6</span>
            <span style="display: block; font-size: 12px; color: #94a3b8; margin-top: 4px;">Enterprise Multi-Engine Data Platform</span>
          </div>
          <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 16px;">Welcome to DataVault6, ${escapeHtml(message.name)}!</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
            You have been provisioned as an administrator. Please verify your email address to activate your account and configure your secure administrator password.
          </p>
          <div style="margin: 28px 0;">
            <a href="${escapeHtml(message.verificationUrl)}" style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 14px; font-weight: 700; border-radius: 8px; display: inline-block;">
              Verify Email &amp; Set Password
            </a>
          </div>
          <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px;">
            If the button above does not open directly on your mobile device or desktop browser, copy and paste this verification URL into your browser:
          </p>
          <p style="font-size: 12px; word-break: break-all; background-color: #1e293b; padding: 10px 14px; border-radius: 6px; color: #38bdf8; font-family: monospace;">
            ${escapeHtml(message.verificationUrl)}
          </p>
          <p style="font-size: 11px; color: #64748b; margin-top: 20px;">
            This single-use link expires in 24 hours. Once verified, you will configure your password and sign into the platform.
          </p>
        </div>
      `,
      textContent: `Hello ${message.name},\n\nYou have been provisioned as a DataVault6 administrator.\n\nVerify your email and configure your password using this link:\n${message.verificationUrl}\n\nThis single-use link expires in 24 hours.`,
      headers: {
        "X-Mailin-trackclick": "0",
        "X-Mailin-Tag": "admin-verification"
      },
      tags: ["admin-verification"]
    });
  }

  async sendPasswordResetEmail(message: PasswordSetupEmail): Promise<void> {
    await this.send({
      to: [{ email: message.to, name: message.name }],
      subject: "Set up your DataVault6 administrator password",
      htmlContent: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
          <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 16px;">Set your DataVault6 password</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">Hello ${escapeHtml(message.name)},</p>
          <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">Click below to set your password:</p>
          <div style="margin: 24px 0;">
            <a href="${escapeHtml(message.setupUrl)}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: 700; border-radius: 6px; display: inline-block;">
              Set Password
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8;">Or open this link: <code>${escapeHtml(message.setupUrl)}</code></p>
        </div>
      `,
      textContent: `Hello ${message.name},\n\nSet your DataVault6 password:\n${message.setupUrl}`,
      headers: {
        "X-Mailin-trackclick": "0"
      },
      tags: ["password-setup"]
    });
  }

  private async send(payload: {
    to: Array<{ email: string; name?: string }>;
    subject: string;
    htmlContent: string;
    textContent?: string;
    headers?: Record<string, string>;
    tags?: string[];
  }): Promise<void> {
    try {
      const senderEmail = this.config.BREVO_SENDER_EMAIL || extractEmail(this.config.EMAIL_FROM) || "daplinankaila91@gmail.com";
      const senderName = this.config.BREVO_SENDER_NAME || extractName(this.config.EMAIL_FROM) || "DataVault6";

      // If SMTP relay credentials are provided, send directly via Brevo SMTP relay
      if (this.config.BREVO_SMTP_KEY && this.config.BREVO_SMTP_USER) {
        try {
          const transporter = nodemailer.createTransport({
            host: this.config.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
            port: this.config.BREVO_SMTP_PORT || 587,
            secure: false,
            auth: {
              user: this.config.BREVO_SMTP_USER,
              pass: this.config.BREVO_SMTP_KEY
            }
          });

          const toAddresses = payload.to.map(r => r.name ? `"${r.name}" <${r.email}>` : r.email).join(", ");
          await transporter.sendMail({
            from: `"${senderName}" <${senderEmail}>`,
            to: toAddresses,
            subject: payload.subject,
            html: payload.htmlContent,
            ...(payload.textContent ? { text: payload.textContent } : {}),
            ...(payload.headers ? { headers: payload.headers } : {})
          });
          return;
        } catch (smtpErr) {
          console.warn("[Brevo SMTP Relay warning, attempting REST API fallback]:", smtpErr);
        }
      }

      const body: Record<string, unknown> = {
        sender: { name: senderName, email: senderEmail },
        to: payload.to,
        subject: payload.subject,
        htmlContent: payload.htmlContent
      };
      if (payload.textContent) body.textContent = payload.textContent;
      if (payload.headers) body.headers = payload.headers;
      if (payload.tags) body.tags = payload.tags;

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": this.config.BREVO_API_KEY!,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body)
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
