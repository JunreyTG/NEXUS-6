import multer from "multer";
import { Router, type Request } from "express";
import { z } from "zod";
import { authenticate, requireAdminOrSuperAdmin } from "../auth/middleware.js";
import type { RequestHandler } from "express";
import { UploadValidationError } from "../errors/app-error.js";
import { DatasetService, type DatasetActor, DATASET_CATEGORIES, normalizeCategory } from "../services/dataset.service.js";
import { requireUploadConfig } from "../uploads/config.js";
import { TemporaryUploadStorage } from "../uploads/storage.js";
import { DatasetStorageService } from "../services/dataset-storage.service.js";
import { DATABASE_ENGINES } from "../database/types.js";
import { DatasetRecordService } from "../services/dataset-record.service.js";
import { DatasetExportService } from "../services/dataset-export.service.js";
import type { DatasetFileType } from "../uploads/parsers.js";
import rateLimit from "express-rate-limit";

const mimeTypes: Record<string, { type: DatasetFileType; mime: string[] }> = {
  csv: { type: "CSV", mime: ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"] },
  tsv: { type: "TSV", mime: ["text/tab-separated-values", "text/tsv", "text/plain", "application/octet-stream"] },
  json: { type: "JSON", mime: ["application/json", "text/json", "application/octet-stream"] },
  ndjson: { type: "NDJSON", mime: ["application/x-ndjson", "application/jsonlines", "application/jsonl", "text/plain"] },
  jsonl: { type: "NDJSON", mime: ["application/x-ndjson", "application/jsonlines", "application/jsonl", "text/plain"] },
  xml: { type: "XML", mime: ["application/xml", "text/xml", "application/octet-stream"] },
  xlsx: { type: "XLSX", mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"] }
};

const categorySchema = z.string().trim().refine((val) => normalizeCategory(val) !== null, {
  message: `Invalid category. Must be one of: ${DATASET_CATEGORIES.join(", ")}`
}).transform((val) => normalizeCategory(val)!);

const uploadInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  category: categorySchema.default("Education"),
  targetDb: z.string().trim().optional(),
  databaseEngine: z.string().trim().optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  ownerAdminId: z.string().uuid().optional()
});

const patchInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).optional()
}).strict().refine((value) => Object.keys(value).length > 0);

const storageInputSchema = z.object({ engine: z.enum(DATABASE_ENGINES) }).strict();
const recordIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/);
export const recordsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_$.[\]-]+$/).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  search: z.string().trim().max(200).optional()
}).strict();

export const datasetQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  database: z.string().trim().max(100).optional(),
  databaseEngine: z.string().trim().max(100).optional(),
  format: z.string().trim().max(50).optional(),
  fileFormat: z.string().trim().max(50).optional(),
  contributor: z.string().trim().max(200).optional(),
  contributorId: z.string().trim().max(200).optional(),
  date: z.string().trim().max(100).optional(),
  startDate: z.string().trim().max(100).optional(),
  endDate: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  sortBy: z.string().trim().max(50).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

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

export function detectUploadFileType(filename: string, mimetype: string): { extension: string; type: DatasetFileType } {
  if (filename.includes("\u0000") || filename.includes("/") || filename.includes("\\") || filename.length > 255) throw new UploadValidationError("FILENAME_INVALID");
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const match = mimeTypes[extension];
  if (!match || !match.mime.includes(mimetype.toLowerCase())) throw new UploadValidationError("FILE_TYPE_UNSUPPORTED");
  return { extension, type: match.type };
}

export function createDatasetRouter(service = new DatasetService(), uploadStorage = new TemporaryUploadStorage(), storageService = new DatasetStorageService(), recordService = new DatasetRecordService(), authenticateMiddleware: RequestHandler = authenticate, exportService = new DatasetExportService()): Router {
  const router = Router();
  const config = requireUploadConfig();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => { void uploadStorage.ensureDirectory().then(() => callback(null, uploadStorage.getDirectory())).catch((error: unknown) => callback(error as Error, uploadStorage.getDirectory())); },
      filename: (_request, file, callback) => {
        try {
          const detected = detectUploadFileType(file.originalname, file.mimetype);
          callback(null, uploadStorage.createFilename(detected.extension));
        } catch (error) {
          callback(error as Error, "");
        }
      }
    }),
    limits: { ...(config.MAX_UPLOAD_SIZE_MB > 0 ? { fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024 } : {}), files: 1, fields: 10, parts: 11 },
    fileFilter: (_request, file, callback) => {
      try {
        detectUploadFileType(file.originalname, file.mimetype);
        callback(null, true);
      } catch (error) {
        callback(error as Error);
      }
    }
  });

  void uploadStorage.cleanupExpired().catch(() => undefined);
  router.use(authenticateMiddleware, requireAdminOrSuperAdmin);

  router.post("/upload", uploadRateLimit, (request, response, next) => {
    upload.single("file")(request, response, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      const code = error instanceof UploadValidationError ? error.code : typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "UPLOAD_INVALID";
      void service.recordUploadFailure(actor(request), code).finally(() => next(error instanceof UploadValidationError ? error : new UploadValidationError(code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : code)));
    });
  }, async (request, response, next) => {
    let serviceStarted = false;
    try {
      if (!request.file) throw new UploadValidationError("FILE_REQUIRED");
      const detected = detectUploadFileType(request.file.originalname, request.file.mimetype);
      const input = uploadInputSchema.parse(request.body);
      serviceStarted = true;
      response.status(201).json(await service.upload({
        key: request.file.filename,
        path: request.file.path,
        originalFilename: request.file.originalname,
        fileType: detected.type,
        size: request.file.size
      }, input, actor(request)));
    } catch (error) {
      if (request.file) await uploadStorage.remove(request.file.filename).catch(() => undefined);
      if (!serviceStarted) {
        const code = error instanceof UploadValidationError ? error.code : "UPLOAD_INVALID";
        await service.recordUploadFailure(actor(request), code);
      }
      next(error);
    }
  });

  router.get("/mine", async (request, response, next) => {
    try {
      const query = datasetQuerySchema.parse(request.query);
      response.json(await service.listMine(actor(request), {
        ...query,
        limit: query.pageSize ?? query.limit,
        database: query.databaseEngine ?? query.database,
        format: query.fileFormat ?? query.format,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/statistics/categories", async (request, response, next) => {
    try {
      response.json(await service.getCategoryStatistics(actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/statistics/contributors", async (request, response, next) => {
    try {
      response.json(await service.getContributorStatistics(actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/contributors", async (request, response, next) => {
    try {
      response.json(await service.getContributorStatistics(actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/statistics/dashboard", async (request, response, next) => {
    try {
      const days = typeof request.query.days === "string" ? parseInt(request.query.days, 10) || 7 : 7;
      response.json(await service.getDashboardStats(actor(request), days));
    } catch (error) {
      next(error);
    }
  });

  router.get("/bookmarked/ids", async (request, response, next) => {
    try {
      response.json(await service.getBookmarkedIds(actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/bookmarked", async (request, response, next) => {
    try {
      const query = datasetQuerySchema.parse(request.query);
      response.json(await service.listBookmarked(actor(request), {
        ...query,
        limit: query.pageSize ?? query.limit,
        database: query.databaseEngine ?? query.database,
        format: query.fileFormat ?? query.format,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (request, response, next) => {
    try {
      const query = datasetQuerySchema.parse(request.query);
      response.json(await service.list(actor(request), {
        ...query,
        limit: query.pageSize ?? query.limit,
        database: query.databaseEngine ?? query.database,
        format: query.fileFormat ?? query.format,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      response.json(await service.get(z.string().uuid().parse(request.params.id), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/bookmark", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      response.json(await service.toggleBookmark(id, actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/bookmark", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      response.json(await service.unbookmark(id, actor(request)));
    } catch (error) {
      next(error);
    }
  });


  router.post("/:id/analyze", async (request, response, next) => {
    try {
      response.json(await service.analyze(z.string().uuid().parse(request.params.id), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/analysis", async (request, response, next) => {
    try {
      response.json(await service.getAnalysis(z.string().uuid().parse(request.params.id), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/storage", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      const input = storageInputSchema.parse(request.body);
      response.status(201).json(await storageService.requestStorage(id, input.engine, actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/storage", async (request, response, next) => {
    try {
      response.json(await storageService.getStorageStatus(z.string().uuid().parse(request.params.id), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/download", async (request, response, next) => {
    try {
      const id = request.params.id ?? (request.params as Record<string, string | undefined>).datasetId;
      const format = typeof request.query.format === "string" ? request.query.format : undefined;
      const result = await exportService.export(id ?? "", format, actor(request));
      response.setHeader("Content-Type", result.contentType);
      response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      response.setHeader("Content-Length", result.buffer.length);
      response.status(200).send(result.buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/export", async (request, response, next) => {
    try {
      const id = request.params.id ?? (request.params as Record<string, string | undefined>).datasetId;
      const format = typeof request.query.format === "string" ? request.query.format : undefined;
      const result = await exportService.export(id ?? "", format, actor(request));
      response.setHeader("Content-Type", result.contentType);
      response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      response.setHeader("Content-Length", result.buffer.length);
      response.status(200).send(result.buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/records", async (request, response, next) => {
    try {
      const id = z.string().uuid().parse(request.params.id);
      response.json(await recordService.list(id, recordsQuerySchema.parse(request.query), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/records/:recordId", async (request, response, next) => {
    try {
      response.json(await recordService.get(z.string().uuid().parse(request.params.id), recordIdSchema.parse(request.params.recordId), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/records", async (request, response, next) => {
    try {
      response.status(201).json(await recordService.create(z.string().uuid().parse(request.params.id), request.body, actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/records/:recordId", async (request, response, next) => {
    try {
      response.json(await recordService.update(z.string().uuid().parse(request.params.id), recordIdSchema.parse(request.params.recordId), request.body, actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/records/:recordId", async (request, response, next) => {
    try {
      await recordService.delete(z.string().uuid().parse(request.params.id), recordIdSchema.parse(request.params.recordId), actor(request));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      response.json(await service.update(z.string().uuid().parse(request.params.id), patchInputSchema.parse(request.body), actor(request)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      await service.delete(z.string().uuid().parse(request.params.id), actor(request));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
