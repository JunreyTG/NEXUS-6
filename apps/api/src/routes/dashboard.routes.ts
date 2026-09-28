import { Router, type Request } from "express";
import { authenticate, requireAdminOrSuperAdmin } from "../auth/middleware.js";
import type { RequestHandler } from "express";
import { DatasetService, type DatasetActor } from "../services/dataset.service.js";

function actor(request: Request): DatasetActor {
  return {
    role: request.principal!.role,
    actorType: request.principal!.role,
    actorId: request.principal!.id,
    actorEmail: request.principal!.email,
    ipAddress: request.ip,
    userAgent: request.get("user-agent")
  };
}

export function createDashboardRouter(service = new DatasetService(), authenticateMiddleware: RequestHandler = authenticate): Router {
  const router = Router();
  router.use(authenticateMiddleware, requireAdminOrSuperAdmin);

  router.get("/stats", async (request, response, next) => {
    try {
      const days = typeof request.query.days === "string" ? parseInt(request.query.days, 10) || 7 : 7;
      response.json(await service.getDashboardStats(actor(request), days));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
