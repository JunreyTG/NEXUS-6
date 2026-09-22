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

export function createApiRouter(authService?: AuthService, adminService?: AdminManagementService, logService?: LogService, datasetService?: DatasetService): Router {
  const router = Router();
  const resolvedLogService = logService ?? new LogService();
  const resolvedAuthService = authService ?? new AuthService({ logger: resolvedLogService });
  const resolvedAdminService = adminService ?? new AdminManagementService({ logger: resolvedLogService });
  const resolvedDatasetService = datasetService ?? new DatasetService({ logger: resolvedLogService });
  router.use("/auth", createAuthRouter(resolvedAuthService, resolvedAdminService));
  router.use("/admins", createAdminRouter(resolvedAdminService));
  router.use("/logs", createLogRouter(resolvedLogService));
  router.use("/datasets", createDatasetRouter(resolvedDatasetService));
  router.use("/health", healthRouter);
  return router;
}

export const apiRouter = createApiRouter();
