import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, ConflictError, EmailProviderError, InvalidTokenError, NotFoundError, UploadValidationError } from "../errors/app-error.js";
import { DatabaseError } from "../errors/database-error.js";
import { AuthenticationError, AuthorizationError } from "../auth/errors.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Never log arbitrary error messages, causes, driver metadata, or environment values.
  if (error instanceof DatabaseError) {
    if (res.locals.databaseHealth === true) {
      res.status(503).json({ status: "error", database: "system" });
    } else {
      const message = error.code === "LOG_DATABASE_UNAVAILABLE" ? "Log database unavailable." : "System database unavailable.";
      res.status(503).json({ error: { code: error.code, message } });
    }
    return;
  }

  if (error instanceof EmailProviderError) {
    res.status(503).json({ error: { code: error.code, message: "Email provider unavailable." } });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request." } });
    return;
  }

  if (error instanceof UploadValidationError) {
    res.status(400).json({ error: { code: error.code, message: "Uploaded file is invalid." } });
    return;
  }

  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && error.code.startsWith("LIMIT_")) {
    res.status(400).json({ error: { code: error.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "UPLOAD_INVALID", message: "Uploaded file is invalid." } });
    return;
  }

  if (error instanceof AuthenticationError) {
    res.status(401).json({
      error: {
        code: error.code,
        message: error.code === "INVALID_CREDENTIALS" ? "Invalid credentials." : "Authentication required."
      }
    });
    return;
  }

  if (error instanceof AuthorizationError) {
    res.status(403).json({ error: { code: error.code, message: "Forbidden." } });
    return;
  }

  if (error instanceof ConflictError) {
    res.status(409).json({ error: { code: error.code, message: "Request conflicts with existing data." } });
    return;
  }

  if (error instanceof NotFoundError || error instanceof InvalidTokenError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: "Request failed." } });
    return;
  }

  if (error instanceof AppError && error.statusCode < 500) {
    res.status(error.statusCode).json({ error: { code: error.code, message: "Request failed." } });
    return;
  }

  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } });
};
