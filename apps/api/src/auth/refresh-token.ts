import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import type { AuthConfig } from "./config.js";

export const REFRESH_COOKIE_NAME = "nexus6_refresh";

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function refreshCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000
  };
}

export function setRefreshCookie(response: Response, token: string, config: AuthConfig): void {
  response.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(config));
}

export function clearRefreshCookie(response: Response, config: AuthConfig): void {
  const options = refreshCookieOptions(config);
  delete options.maxAge;
  response.clearCookie(REFRESH_COOKIE_NAME, options);
}

export function refreshExpiry(config: AuthConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}
