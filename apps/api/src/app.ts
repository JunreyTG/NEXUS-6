import express from "express";
import cookieParser from "cookie-parser";
import type { AuthService } from "./auth/service.js";
import type { AdminManagementService } from "./services/admin-management.service.js";
import type { LogService } from "./logging/log.service.js";
import type { DatasetService } from "./services/dataset.service.js";
import type { DatabaseRouter } from "./database/router.js";
import type { DatasetStorageService } from "./services/dataset-storage.service.js";
import type { DatasetRecordService } from "./services/dataset-record.service.js";
import type { ReportService } from "./services/report.service.js";
import type { PublicService } from "./services/public.service.js";
import type { AuthSessionRepository } from "./repositories/auth-session.repository.js";
import { configureHttp } from "./config/http.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createApiRouter } from "./routes/index.js";

export function createApp(authService?: AuthService, adminService?: AdminManagementService, logService?: LogService, datasetService?: DatasetService, databaseRouter?: DatabaseRouter, datasetStorageService?: DatasetStorageService, datasetRecordService?: DatasetRecordService, reportService?: ReportService, publicService?: PublicService, sessionRepository?: AuthSessionRepository) {
  const app = express();

  configureHttp(app);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createApiRouter(authService, adminService, logService, datasetService, databaseRouter, datasetStorageService, datasetRecordService, reportService, publicService, sessionRepository));

  app.use(errorHandler);

  return app;
}
