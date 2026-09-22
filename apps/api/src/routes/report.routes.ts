import { Router, type Request } from "express";
import { z } from "zod";
import { authenticate, requireAdminOrSuperAdmin } from "../auth/middleware.js";
import { ReportService, type ReportActor } from "../services/report.service.js";
import { reportCreateSchema, reportPatchSchema } from "../reports/schema.js";
import type { ReportInput, ReportPatchInput } from "../reports/types.js";

function actor(request: Request): ReportActor {
  return {
    role: request.principal!.role,
    actorType: request.principal!.role,
    actorId: request.principal!.id,
    actorEmail: request.principal!.email,
    ipAddress: request.ip,
    userAgent: request.get("user-agent")
  };
}

function reportId(request: Request): string {
  return z.string().uuid().parse(request.params.id);
}

export function createReportRouter(service = new ReportService()): Router {
  const router = Router();
  router.use(authenticate, requireAdminOrSuperAdmin);

  router.post("/", async (request, response, next) => {
    try {
      response.status(201).json(await service.create(reportCreateSchema.parse(request.body) as unknown as ReportInput, actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (request, response, next) => {
    try {
      response.json(await service.list(actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      response.json(await service.get(reportId(request), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      response.json(await service.update(reportId(request), reportPatchSchema.parse(request.body) as unknown as ReportPatchInput, actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      await service.delete(reportId(request), actor(request));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/preview", async (request, response, next) => {
    try {
      response.json(await service.preview(reportId(request), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/publish", async (request, response, next) => {
    try {
      response.json(await service.publish(reportId(request), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/unpublish", async (request, response, next) => {
    try {
      response.json(await service.unpublish(reportId(request), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
