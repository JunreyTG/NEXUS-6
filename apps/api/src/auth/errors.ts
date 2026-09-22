import { AppError } from "../errors/app-error.js";

export class AuthenticationError extends AppError {
  constructor(code = "AUTHENTICATION_REQUIRED") {
    super("Authentication failed.", 401, code);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor() {
    super("Authorization failed.", 403, "FORBIDDEN");
    this.name = "AuthorizationError";
  }
}

export class AuthConfigurationError extends AppError {
  constructor() {
    super("Authentication configuration is unavailable.", 503, "AUTH_CONFIGURATION_ERROR");
    this.name = "AuthConfigurationError";
  }
}
