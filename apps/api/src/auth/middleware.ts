import type { NextFunction, Request, Response } from "express";
import { requireAuthConfig } from "./config.js";
import { AuthenticationError, AuthConfigurationError, AuthorizationError } from "./errors.js";
import { verifyAccessToken } from "./tokens.js";

export async function authenticate(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const authorization = request.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;
  if (!token) {
    next(new AuthenticationError());
    return;
  }

  try {
    request.principal = await verifyAccessToken(token, requireAuthConfig());
    next();
  } catch (error) {
    next(error instanceof AuthConfigurationError ? error : new AuthenticationError());
  }
}

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
