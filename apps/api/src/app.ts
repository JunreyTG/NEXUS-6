import express from "express";
import cookieParser from "cookie-parser";
import type { AuthService } from "./auth/service.js";
import type { AdminManagementService } from "./services/admin-management.service.js";
import type { LogService } from "./logging/log.service.js";
import type { DatasetService } from "./services/dataset.service.js";
import { configureHttp } from "./config/http.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createApiRouter } from "./routes/index.js";

export function createApp(authService?: AuthService, adminService?: AdminManagementService, logService?: LogService, datasetService?: DatasetService) {
  const app = express();

  configureHttp(app);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createApiRouter(authService, adminService, logService, datasetService));

  app.use(errorHandler);

  return app;
}
