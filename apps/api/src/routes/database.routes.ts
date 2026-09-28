import { Router, type Request } from "express";
import { authenticate, requireSuperAdmin } from "../auth/middleware.js";
import type { RequestHandler } from "express";
import { DatabaseRouter } from "../database/router.js";
import type { ActivityLogger } from "../logging/types.js";

export function createDatabaseRouter(databaseRouter = new DatabaseRouter(), authenticateMiddleware: RequestHandler = authenticate, logger?: ActivityLogger): Router {
  const router = Router();
  router.use(authenticateMiddleware, requireSuperAdmin);

  router.get("/status", (request: Request, response) => {
    if (logger?.recordDatabaseActivity) {
      void logger.recordDatabaseActivity({
        actorType: request.principal!.role,
        actorId: request.principal!.id ?? undefined,
        actorEmail: request.principal!.email,
        ipAddress: request.ip,
        userAgent: request.get("user-agent"),
        action: "DATABASE_STATUS_VIEWED",
        resourceType: "DATABASE",
        success: true,
        metadata: { category: "DATABASE" }
      });
    }
    response.json(databaseRouter.getStatuses());
  });

  return router;
}
