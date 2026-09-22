import { Router } from "express";
import { AuthService } from "../auth/service.js";
import { createAuthRouter } from "./auth.routes.js";
import { AdminManagementService } from "../services/admin-management.service.js";
import { createAdminRouter } from "./admin.routes.js";
import { healthRouter } from "./health.routes.js";
import { LogService } from "../logging/log.service.js";
import { createLogRouter } from "./log.routes.js";
import { DatasetService } from "../services/dataset.service.js";
import { createDatasetRouter } from "./dataset.routes.js";
import { createDatabaseRouter } from "./database.routes.js";
import { DatabaseRouter } from "../database/router.js";
import { DatasetStorageService } from "../services/dataset-storage.service.js";
import { DatasetRecordService } from "../services/dataset-record.service.js";
import { ReportService } from "../services/report.service.js";
import { createReportRouter } from "./report.routes.js";
import { createPublicRouter } from "./public.routes.js";
import { PublicService } from "../services/public.service.js";

export function createApiRouter(authService?: AuthService, adminService?: AdminManagementService, logService?: LogService, datasetService?: DatasetService, databaseRouter?: DatabaseRouter, datasetStorageService?: DatasetStorageService, datasetRecordService?: DatasetRecordService, reportService?: ReportService, publicService?: PublicService): Router {
  const router = Router();
  const resolvedLogService = logService ?? new LogService();
  const resolvedAuthService = authService ?? new AuthService({ logger: resolvedLogService });
  const resolvedAdminService = adminService ?? new AdminManagementService({ logger: resolvedLogService });
  const resolvedDatasetService = datasetService ?? new DatasetService({ logger: resolvedLogService });
  const resolvedDatabaseRouter = databaseRouter ?? new DatabaseRouter();
  const resolvedDatasetStorageService = datasetStorageService ?? new DatasetStorageService({ logger: resolvedLogService });
  const resolvedDatasetRecordService = datasetRecordService ?? new DatasetRecordService({ logger: resolvedLogService });
  const resolvedReportService = reportService ?? new ReportService({ logger: resolvedLogService });
  const resolvedPublicService = publicService ?? new PublicService({ reportService: resolvedReportService });
  router.use("/auth", createAuthRouter(resolvedAuthService, resolvedAdminService));
  router.use("/admins", createAdminRouter(resolvedAdminService));
  router.use("/logs", createLogRouter(resolvedLogService));
  router.use("/datasets", createDatasetRouter(resolvedDatasetService, undefined, resolvedDatasetStorageService, resolvedDatasetRecordService));
  router.use("/reports", createReportRouter(resolvedReportService));
  router.use("/public", createPublicRouter(resolvedPublicService));
  router.use("/databases", createDatabaseRouter(resolvedDatabaseRouter));
  router.use("/health", healthRouter);
  return router;
}

export const apiRouter = createApiRouter();
