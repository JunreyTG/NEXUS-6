import { Router } from "express";
import { checkDatabaseHealth } from "../services/database-health.service.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "nexus-6-api" });
});

healthRouter.get("/database", async (_req, res, next) => {
  try {
    res.status(200).json(await checkDatabaseHealth());
  } catch (error) {
    res.locals.databaseHealth = true;
    next(error);
  }
});
