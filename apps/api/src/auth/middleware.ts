import type { NextFunction, Request, Response, RequestHandler } from "express";
import { requireAuthConfig } from "./config.js";
import { AuthenticationError, AuthConfigurationError, AuthorizationError } from "./errors.js";
import { verifyAccessToken } from "./tokens.js";
import { AuthSessionRepository } from "../repositories/auth-session.repository.js";

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createAuthenticate(sessions = new AuthSessionRepository()): RequestHandler {
  return async function authenticate(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const authorization = request.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;
  if (!token) {
    next(new AuthenticationError());
    return;
  }

  try {
    const principal = await verifyAccessToken(token, requireAuthConfig());
    if (principal.sessionId && sessionIdPattern.test(principal.sessionId)) {
      const now = new Date();
      let active = false;
      if (principal.role === "ADMIN") {
        const session = await sessions.findAdminById(principal.sessionId);
        active = Boolean(session && !session.revokedAt && session.expiresAt > now && session.admin.emailVerified && session.admin.status === "ACTIVE" && session.admin.passwordHash);
      } else {
        const session = await sessions.findSuperAdminById(principal.sessionId);
        active = Boolean(session && !session.revokedAt && session.expiresAt > now);
      }
      if (!active) throw new AuthenticationError();
    }
    request.principal = principal;
    next();
  } catch (error) {
      next(error instanceof AuthConfigurationError ? error : new AuthenticationError());
    }
  };
}

export const authenticate = createAuthenticate();

export function requireSuperAdmin(request: Request, _response: Response, next: NextFunction): void {
  if (!request.principal) {
    next(new AuthenticationError());
    return;
  }
  if (request.principal.role !== "SUPER_ADMIN") {
    next(new AuthorizationError());
    return;
  }
  next();
}

export function requireAdminOrSuperAdmin(request: Request, _response: Response, next: NextFunction): void {
  if (!request.principal || !["ADMIN", "SUPER_ADMIN"].includes(request.principal.role)) {
    next(new AuthenticationError());
    return;
  }
  next();
}
