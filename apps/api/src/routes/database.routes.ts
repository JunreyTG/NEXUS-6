import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../auth/middleware.js";
import type { RequestHandler } from "express";
import { DatabaseRouter } from "../database/router.js";

export function createDatabaseRouter(databaseRouter = new DatabaseRouter(), authenticateMiddleware: RequestHandler = authenticate): Router {
  const router = Router();
  router.use(authenticateMiddleware, requireSuperAdmin);

  router.get("/status", (_request, response) => {
    response.json(databaseRouter.getStatuses());
  });

  return router;
}
