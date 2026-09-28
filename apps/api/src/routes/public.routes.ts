import rateLimit from "express-rate-limit";
import { Router, type Request } from "express";
import { z } from "zod";
import { DATABASE_ENGINES } from "../database/types.js";
import { PublicService } from "../services/public.service.js";

import type { ActivityLogger } from "../logging/types.js";

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(200).optional()
}).strict();

export function createPublicRouter(service = new PublicService(), logger?: ActivityLogger): Router {
  const router = Router();
  router.use(rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

  const logPublic = (action: string, resourceType?: string, resourceId?: string, req?: Request) => {
    if (!logger?.recordDatasetActivity) return;
    void logger.recordDatasetActivity({
      actorType: "ANONYMOUS",
      ipAddress: req?.ip,
      userAgent: req?.get("user-agent"),
      action,
      resourceType: resourceType ?? undefined,
      resourceId: resourceId ?? undefined,
      success: true,
      metadata: { category: "PUBLIC_ACCESS" }
    });
  };

  router.get("/datasets", async (request, response, next) => {
    try {
      const query = pageSchema.extend({ classification: z.string().trim().max(100).optional(), engine: z.enum(DATABASE_ENGINES).optional() }).parse(request.query);
      const result = await service.listDatasets(query);
      logPublic("PUBLIC_DATASET_LIST_VIEWED", "DATASET", undefined, request as any);
      response.json(result);
    } catch (error) { next(error); }
  });

  router.get("/datasets/:id", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      const dataset = await service.getDataset(id);
      if (!dataset) { response.status(404).json({ error: { code: "DATASET_NOT_FOUND", message: "Request failed." } }); return; }
      logPublic("PUBLIC_DATASET_VIEWED", "DATASET", id, request as any);
      response.json(dataset);
    } catch (error) { next(error); }
  });

  router.get("/reports", async (request, response, next) => {
    try {
      const query = pageSchema.extend({ datasetId: z.string().uuid().optional() }).parse(request.query);
      const result = await service.listReports(query);
      logPublic("PUBLIC_REPORT_LIST_VIEWED", "REPORT", undefined, request as any);
      response.json(result);
    } catch (error) { next(error); }
  });

  router.get("/reports/:id", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      const result = await service.getReport(id);
      logPublic("PUBLIC_REPORT_VIEWED", "REPORT", id, request as any);
      response.json(result);
    } catch (error) { next(error); }
  });

  router.get("/statistics", async (request, response, next) => {
    try {
      const result = await service.getStatistics();
      logPublic("PUBLIC_STATISTICS_VIEWED", "STATISTICS", undefined, request as any);
      response.json(result);
    } catch (error) { next(error); }
  });

  return router;
}
