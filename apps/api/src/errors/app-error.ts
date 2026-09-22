export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ConflictError extends AppError {
  public constructor(code = "CONFLICT") {
    super("Request conflicts with existing data.", 409, code);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends AppError {
  public constructor(code = "NOT_FOUND") {
    super("Requested resource was not found.", 404, code);
    this.name = "NotFoundError";
  }
}

export class InvalidTokenError extends AppError {
  public constructor(code = "INVALID_TOKEN") {
    super("Token is invalid or expired.", 400, code);
    this.name = "InvalidTokenError";
  }
}

export class EmailProviderError extends AppError {
  public constructor() {
    super("Email provider unavailable.", 503, "EMAIL_PROVIDER_UNAVAILABLE");
    this.name = "EmailProviderError";
  }
}

export class UploadValidationError extends AppError {
  public constructor(code = "UPLOAD_INVALID") {
    super("Uploaded file is invalid.", 400, code);
    this.name = "UploadValidationError";
  }
}

export class RecordValidationError extends AppError {
  public constructor(code = "RECORD_INVALID") {
    super("Record data is invalid.", 400, code);
    this.name = "RecordValidationError";
  }
}

export class ReportValidationError extends AppError {
  public constructor(code = "REPORT_INVALID") {
    super("Report configuration is invalid.", 400, code);
    this.name = "ReportValidationError";
  }
}
