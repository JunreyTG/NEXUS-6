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
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  actor: z.string().trim().min(1).max(320).optional(),
  actorId: z.string().trim().min(1).max(320).optional(),
  action: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  resourceType: z.string().trim().min(1).max(100).optional(),
  resourceId: z.string().trim().min(1).max(100).optional(),
  datasetId: z.string().trim().min(1).max(100).optional(),
  dataset: z.string().trim().min(1).max(100).optional(),
  databaseEngine: z.string().trim().min(1).max(100).optional(),
  success: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  status: z.string().trim().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  stream: z.enum(["login", "audit", "security", "dataset-activity", "database-activity", "all", "authentication", "datasets", "database"]).optional()
}).transform((val) => {
  const start = val.start ?? val.from;
  const end = val.end ?? val.to;
  let success = val.success;
  if (success === undefined && val.status) {
    const s = val.status.toUpperCase();
    if (s === "SUCCESS" || s === "TRUE") success = true;
    else if (s === "FAILED" || s === "FAILURE" || s === "FALSE") success = false;
  }
  return {
    ...val,
    start,
    end,
    success,
    actor: val.actor ?? val.actorId,
    datasetId: val.datasetId ?? val.dataset
  };
}).refine((value) => !value.start || !value.end || value.start <= value.end, {
  message: "start must be before end",
  path: ["start"]
});

export function createLogRouter(service = new LogService(), authenticateMiddleware: RequestHandler = authenticate): Router {
  const router = Router();
  router.use(authenticateMiddleware, requireAdminOrSuperAdmin);

  // Statistics endpoint (must be before :id)
  router.get("/statistics", async (request, response, next) => {
    try {
      const query = querySchema.parse(request.query);
      const stats = service.getStatistics
        ? await service.getStatistics({ start: query.start, end: query.end })
        : { total: 0, success: 0, failure: 0, byCategory: {}, byStream: { login: 0, audit: 0, security: 0, datasetActivity: 0, databaseActivity: 0 } };
      response.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // Unified activity endpoint
  router.get("/activity", async (request, response, next) => {
    try {
      const query = querySchema.parse(request.query);
      if (service.listAll) {
        response.json(await service.listAll(query));
      } else {
        response.json(await service.listAudit(query));
      }
    } catch (error) {
      next(error);
    }
  });

  // Stream aliases
  router.get("/authentication", async (request, response, next) => {
    try {
      response.json(await service.listLogin(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/datasets", async (request, response, next) => {
    try {
      response.json(await service.listDatasetActivity(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/database", async (request, response, next) => {
    try {
      response.json(await service.listDatabaseActivity(querySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  // Existing streams
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

  // Root logs endpoint: unified activity logs
  router.get("/", async (request, response, next) => {
    try {
      const query = querySchema.parse(request.query);
      if (service.listAll) {
        response.json(await service.listAll(query));
      } else {
        response.json(await service.listAudit(query));
      }
    } catch (error) {
      next(error);
    }
  });

  // Get log by ID
  router.get("/:id", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      const log = service.getById ? await service.getById(id) : null;
      if (!log) {
        response.status(404).json({ error: { code: "LOG_NOT_FOUND", message: "Log record not found." } });
        return;
      }
      response.json(log);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
