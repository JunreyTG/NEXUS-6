import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../auth/middleware.js";
import { DatabaseRouter } from "../database/router.js";

export function createDatabaseRouter(databaseRouter = new DatabaseRouter()): Router {
  const router = Router();
  router.use(authenticate, requireSuperAdmin);

  router.get("/status", (_request, response) => {
    response.json(databaseRouter.getStatuses());
  });

  return router;
}
