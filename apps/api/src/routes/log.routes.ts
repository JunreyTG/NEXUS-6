import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdminOrSuperAdmin } from "../auth/middleware.js";
import type { RequestHandler } from "express";
import { LogService } from "../logging/log.service.js";

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(100_000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  actor: z.string().trim().min(1).max(320).optional(),
  action: z.string().trim().min(1).max(200).optional(),
  success: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  search: z.string().trim().min(1).max(200).optional()
}).refine((value) => !value.start || !value.end || value.start <= value.end, {
  message: "start must be before end",
  path: ["start"]
});

export function createLogRouter(service = new LogService(), authenticateMiddleware: RequestHandler = authenticate): Router {
  const router = Router();
  router.use(authenticateMiddleware, requireAdminOrSuperAdmin);

  router.get("/login", async (request, response, next) => {
    try {
      response.json(await service.listLogin(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/audit", async (request, response, next) => {
    try {
      response.json(await service.listAudit(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/security", async (request, response, next) => {
    try {
      response.json(await service.listSecurity(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dataset-activity", async (request, response, next) => {
    try {
      response.json(await service.listDatasetActivity(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/database-activity", async (request, response, next) => {
    try {
      response.json(await service.listDatabaseActivity(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
