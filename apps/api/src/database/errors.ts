import { AppError } from "../errors/app-error.js";
import type { DatabaseEngine } from "./types.js";

export class DatabaseNotConfiguredError extends AppError {
  readonly engine: DatabaseEngine;

  constructor(engine: DatabaseEngine) {
    super("The selected database engine is not configured.", 503, "DATABASE_NOT_CONFIGURED");
    this.name = "DatabaseNotConfiguredError";
    this.engine = engine;
  }
}

export class UnsupportedDatabaseEngineError extends AppError {
  constructor() {
    super("The requested database engine is not supported.", 400, "UNSUPPORTED_DATABASE_ENGINE");
    this.name = "UnsupportedDatabaseEngineError";
  }
}

export class DatabaseEngineNotSelectedError extends AppError {
  constructor() {
    super("A database engine must be selected before storage can be created.", 409, "DATABASE_ENGINE_NOT_SELECTED");
    this.name = "DatabaseEngineNotSelectedError";
  }
}

export class IncompatibleDatabaseEngineError extends AppError {
  constructor() {
    super("The selected database engine is incompatible with this dataset.", 400, "INCOMPATIBLE_DATABASE_ENGINE");
    this.name = "IncompatibleDatabaseEngineError";
  }
}

export class DatasetNotAnalyzedError extends AppError {
  constructor() {
    super("The dataset must be analyzed before storage can be created.", 409, "DATASET_NOT_ANALYZED");
    this.name = "DatasetNotAnalyzedError";
  }
}

export class StorageAlreadyExistsError extends AppError {
  constructor() {
    super("Storage has already been created for this dataset.", 409, "STORAGE_ALREADY_EXISTS");
    this.name = "StorageAlreadyExistsError";
  }
}

export class DatasetStorageUnavailableError extends AppError {
  constructor() {
    super("Dataset storage is not configured yet.", 503, "DATASET_STORAGE_NOT_CONFIGURED");
    this.name = "DatasetStorageUnavailableError";
  }
}
