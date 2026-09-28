import express from "express";
import cookieParser from "cookie-parser";
import type { AuthService } from "./auth/service.js";
import type { AdminManagementService } from "./services/admin-management.service.js";
import type { DatasetService } from "./services/dataset.service.js";
import type { DatabaseRouter } from "./database/router.js";
import type { DatasetStorageService } from "./services/dataset-storage.service.js";
import type { DatasetRecordService } from "./services/dataset-record.service.js";
import type { ReportService } from "./services/report.service.js";
import type { PublicService } from "./services/public.service.js";
import type { DatasetExportService } from "./services/dataset-export.service.js";
import type { AuthSessionRepository } from "./repositories/auth-session.repository.js";
import { LogService } from "./logging/log.service.js";
import { createRequestLogger } from "./logging/request-logger.middleware.js";
import { configureHttp } from "./config/http.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createApiRouter } from "./routes/index.js";

export function createApp(authService?: AuthService, adminService?: AdminManagementService, logService?: LogService, datasetService?: DatasetService, databaseRouter?: DatabaseRouter, datasetStorageService?: DatasetStorageService, datasetRecordService?: DatasetRecordService, reportService?: ReportService, publicService?: PublicService, sessionRepository?: AuthSessionRepository, datasetExportService?: DatasetExportService) {
  const app = express();
  const resolvedLogService = logService ?? new LogService();

  configureHttp(app);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(createRequestLogger(resolvedLogService));

  app.use("/api", createApiRouter(authService, adminService, resolvedLogService, datasetService, databaseRouter, datasetStorageService, datasetRecordService, reportService, publicService, sessionRepository, datasetExportService));

  app.use(errorHandler);

  return app;
}
