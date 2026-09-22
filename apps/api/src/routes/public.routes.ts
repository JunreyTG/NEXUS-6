import rateLimit from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import { DATABASE_ENGINES } from "../database/types.js";
import { PublicService } from "../services/public.service.js";

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(200).optional()
}).strict();

export function createPublicRouter(service = new PublicService()): Router {
  const router = Router();
  router.use(rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

  router.get("/datasets", async (request, response, next) => {
    try {
      const query = pageSchema.extend({ classification: z.string().trim().max(100).optional(), engine: z.enum(DATABASE_ENGINES).optional() }).parse(request.query);
      response.json(await service.listDatasets(query));
    } catch (error) { next(error); }
  });

  router.get("/datasets/:id", async (request, response, next) => {
    try {
      const dataset = await service.getDataset(z.string().uuid().parse(request.params.id));
      if (!dataset) { response.status(404).json({ error: { code: "DATASET_NOT_FOUND", message: "Request failed." } }); return; }
      response.json(dataset);
    } catch (error) { next(error); }
  });

  router.get("/reports", async (request, response, next) => {
    try {
      const query = pageSchema.extend({ datasetId: z.string().uuid().optional() }).parse(request.query);
      response.json(await service.listReports(query));
    } catch (error) { next(error); }
  });

  router.get("/reports/:id", async (request, response, next) => {
    try {
      response.json(await service.getReport(z.string().uuid().parse(request.params.id)));
    } catch (error) { next(error); }
  });

  router.get("/statistics", async (_request, response, next) => {
    try { response.json(await service.getStatistics()); } catch (error) { next(error); }
  });

  return router;
}
