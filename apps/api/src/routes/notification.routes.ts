import { Router, type Request } from "express";
import { z } from "zod";
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

export function createNotificationRouter(service = new DatasetService(), authenticateMiddleware: RequestHandler = authenticate): Router {
  const router = Router();
  router.use(authenticateMiddleware, requireAdminOrSuperAdmin);

  router.get("/", async (request, response, next) => {
    try {
      response.json(await service.listNotifications(actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/count", async (request, response, next) => {
    try {
      const count = await service.countUnreadNotifications(actor(request));
      response.json({ unreadCount: count });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/read-all", async (request, response, next) => {
    try {
      await service.markAllNotificationsAsRead(actor(request));
      response.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/read", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      await service.markNotificationAsRead(id, actor(request));
      response.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
