import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Express } from "express";
import { env } from "./env.js";

export function configureHttp(app: Express): void {
  app.set("trust proxy", 1);
  const allowedOrigins = [
    env.WEB_ORIGIN,
    env.APP_BASE_URL,
    "http://localhost:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8081"
  ]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.replace(/\/+$/, ""));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/+$/, "");
        if (allowedOrigins.includes(normalized) || allowedOrigins.includes("*")) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true
    })
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
}
