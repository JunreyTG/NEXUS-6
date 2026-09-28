import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { requireEmailConfig } from "../src/email/config.js";
import { createEmailProvider, BrevoEmailProvider, ConsoleEmailProvider } from "../src/email/provider.js";
import { EmailProviderError } from "../src/errors/app-error.js";

describe("Brevo Email Provider & Configuration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("validates brevo email configuration with required API key", () => {
    const config = requireEmailConfig({
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "xkeysib-test-key-12345",
      BREVO_SENDER_EMAIL: "admin@datavault6.local",
      BREVO_SENDER_NAME: "DataVault6"
    });

    expect(config.EMAIL_PROVIDER).toBe("brevo");
    expect(config.BREVO_API_KEY).toBe("xkeysib-test-key-12345");
    expect(config.BREVO_SENDER_EMAIL).toBe("admin@datavault6.local");
    expect(config.BREVO_SENDER_NAME).toBe("DataVault6");
  });

  it("supports 'brevos' alias as provider name", () => {
    const config = requireEmailConfig({
      EMAIL_PROVIDER: "brevos",
      BREVO_API_KEY: "xkeysib-test-key-12345"
    });

    expect(config.EMAIL_PROVIDER).toBe("brevos");
    expect(config.BREVO_API_KEY).toBe("xkeysib-test-key-12345");
  });

  it("throws EmailProviderError if brevo provider is selected without API key", () => {
    expect(() => {
      requireEmailConfig({
        EMAIL_PROVIDER: "brevo",
        BREVO_API_KEY: ""
      });
    }).toThrow(EmailProviderError);
  });

  it("instantiates BrevoEmailProvider when EMAIL_PROVIDER is brevo or brevos", () => {
    const provider1 = createEmailProvider(requireEmailConfig({
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "test-key"
    }));
    expect(provider1).toBeInstanceOf(BrevoEmailProvider);

    const provider2 = createEmailProvider(requireEmailConfig({
      EMAIL_PROVIDER: "brevos",
      BREVO_API_KEY: "test-key"
    }));
    expect(provider2).toBeInstanceOf(BrevoEmailProvider);
  });

  it("instantiates ConsoleEmailProvider when EMAIL_PROVIDER is console", () => {
    const provider = createEmailProvider(requireEmailConfig({
      EMAIL_PROVIDER: "console"
    }));
    expect(provider).toBeInstanceOf(ConsoleEmailProvider);
  });

  it("sends verification email using Brevo v3 smtp email API", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: "<123@brevo>" })
      };
    });

    const config = requireEmailConfig({
      EMAIL_PROVIDER: "brevos",
      BREVO_API_KEY: "xkeysib-live-key",
      BREVO_SENDER_EMAIL: "noreply@datavault6.local",
      BREVO_SENDER_NAME: "DataVault6 System"
    });

    const provider = new BrevoEmailProvider(config);
    await provider.sendVerificationEmail({
      to: "recipient@example.com",
      name: "Alice Recipient",
      verificationUrl: "https://localhost:4000/verify?token=abc"
    });

    expect(capturedUrl).toBe("https://api.brevo.com/v3/smtp/email");
    expect(capturedHeaders["api-key"]).toBe("xkeysib-live-key");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
    expect(capturedBody).toEqual({
      sender: {
        name: "DataVault6 System",
        email: "noreply@datavault6.local"
      },
      to: [
        {
          email: "recipient@example.com",
          name: "Alice Recipient"
        }
      ],
      subject: "Verify your DataVault6 administrator email",
      htmlContent: expect.stringContaining("https://localhost:4000/verify?token=abc")
    });
  });

  it("sends password reset email using Brevo v3 smtp email API", async () => {
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: "<456@brevo>" })
      };
    });

    const config = requireEmailConfig({
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "xkeysib-live-key",
      EMAIL_FROM: "DataVault6 <sender@datavault6.local>"
    });

    const provider = new BrevoEmailProvider(config);
    await provider.sendPasswordResetEmail({
      to: "bob@example.com",
      name: "Bob Admin",
      setupUrl: "https://localhost:4000/reset?token=xyz"
    });

    expect(capturedBody.sender.email).toBe("sender@datavault6.local");
    expect(capturedBody.subject).toBe("Set up your DataVault6 administrator password");
    expect(capturedBody.htmlContent).toContain("https://localhost:4000/reset?token=xyz");
  });
});
