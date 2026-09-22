import { AppError } from "./app-error.js";
import { ConflictError } from "./app-error.js";

export class DatabaseError extends AppError {
  constructor(message = "System database unavailable.", code = "SYSTEM_DATABASE_UNAVAILABLE") {
    super(message, 503, code);
    this.name = "DatabaseError";
  }
}

// Deliberately discard the original driver error, including its message and cause.
export async function databaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new DatabaseError();
  }
}

export async function databaseWriteOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new ConflictError("EMAIL_ALREADY_EXISTS");
    }
    throw new DatabaseError();
  }
}

export async function logDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new DatabaseError("Log database unavailable.", "LOG_DATABASE_UNAVAILABLE");
  }
}
