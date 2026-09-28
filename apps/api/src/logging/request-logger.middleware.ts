import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { LogService } from "./log.service.js";
import type { LogActor } from "./types.js";
import { requestContextStorage, type RequestLogContext } from "./request-context.js";

const SKIP_PATHS = [
  /^\/api\/health/i,
  /^\/favicon\.ico/i,
  /\.(?:js|css|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i
];

function shouldSkip(path: string): boolean {
  return SKIP_PATHS.some((pattern) => pattern.test(path));
}

export function createRequestLogger(logService: LogService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const originalUrl = req.originalUrl || req.url || "/";
    if (shouldSkip(originalUrl)) {
      next();
      return;
    }

    const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID();
    res.setHeader("X-Request-Id", requestId);

    const context: RequestLogContext = {
      requestId,
      startTime: Date.now(),
      method: req.method,
      endpoint: originalUrl,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      semanticLogEmitted: false
    };

    requestContextStorage.run(context, () => {
      res.on("finish", () => {
        try {
          if (context.semanticLogEmitted) {
            // A semantic activity log was already recorded for this action.
            return;
          }

          const durationMs = Date.now() - context.startTime;
          const principal = req.principal;
          const actor: LogActor = principal
            ? {
                actorType: principal.role,
                actorId: principal.id ?? undefined,
                actorEmail: principal.email,
                ipAddress: req.ip,
                userAgent: req.get("user-agent")
              }
            : {
                actorType: "ANONYMOUS",
                ipAddress: req.ip,
                userAgent: req.get("user-agent")
              };

          const statusCode = res.statusCode;

          if (statusCode === 401) {
            if (typeof logService?.recordSecurity === "function") {
              void logService.recordSecurity({
                ...actor,
                action: "UNAUTHORIZED_ACCESS",
                resourceType: "ENDPOINT",
                resourceId: undefined,
                success: false,
                errorCode: "AUTHENTICATION_REQUIRED",
                metadata: {
                  category: "SECURITY",
                  method: req.method,
                  endpoint: originalUrl,
                  statusCode,
                  durationMs,
                  requestId
                }
              });
            }
            return;
          }

          if (statusCode === 403) {
            if (typeof logService?.recordSecurity === "function") {
              void logService.recordSecurity({
                ...actor,
                action: "FORBIDDEN_ACCESS",
                resourceType: "ENDPOINT",
                resourceId: undefined,
                success: false,
                errorCode: "FORBIDDEN",
                metadata: {
                  category: "SECURITY",
                  method: req.method,
                  endpoint: originalUrl,
                  statusCode,
                  durationMs,
                  requestId
                }
              });
            }
            return;
          }

          if (statusCode === 429) {
            if (typeof logService?.recordSecurity === "function") {
              void logService.recordSecurity({
                ...actor,
                action: "RATE_LIMIT_EXCEEDED",
                resourceType: "ENDPOINT",
                resourceId: undefined,
                success: false,
                errorCode: "RATE_LIMIT_EXCEEDED",
                metadata: {
                  category: "SECURITY",
                  method: req.method,
                  endpoint: originalUrl,
                  statusCode,
                  durationMs,
                  requestId
                }
              });
            }
            return;
          }

          if (statusCode >= 400) {
            if (typeof logService?.recordAudit === "function") {
              void logService.recordAudit({
                ...actor,
                action: statusCode >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED",
                resourceType: "ENDPOINT",
                resourceId: undefined,
                success: false,
                errorCode: `HTTP_${statusCode}`,
                metadata: {
                  category: statusCode >= 500 ? "SYSTEM" : "SECURITY",
                  method: req.method,
                  endpoint: originalUrl,
                  statusCode,
                  durationMs,
                  requestId
                }
              });
            }
          }
        } catch {
          // Request logging must never cause unhandled exceptions.
        }
      });

      next();
    });
  };
}
