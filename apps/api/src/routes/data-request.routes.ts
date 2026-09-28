import { Router, type Request } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate, requireAdminOrSuperAdmin } from "../auth/middleware.js";
import type { RequestHandler } from "express";
import type { DatasetActor } from "../services/dataset.service.js";

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

export interface DataRequestRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  preferredEngine: string;
  preferredFormat: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "PENDING" | "APPROVED" | "IN_PROGRESS" | "FULFILLED" | "REJECTED";
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  upvotes: number;
  voterIds: string[];
  fulfilledDatasetId?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

// In-memory persistent store with realistic initial data
const initialRequests: DataRequestRecord[] = [
  {
    id: "e1010101-0001-4000-8000-000000000001",
    title: "Global Real-Time Weather & Marine Buoy Telemetry",
    description: "Multi-year oceanic buoy climate records, surface water temperatures, and atmospheric pressure measurements across global coordinates.",
    category: "Environment",
    preferredEngine: "PostgreSQL",
    preferredFormat: "TSV",
    priority: "HIGH",
    status: "APPROVED",
    requesterId: "sys-admin-1",
    requesterName: "Dr. Elena Rostova",
    requesterEmail: "elena.rostova@nexus-climate.org",
    upvotes: 14,
    voterIds: ["sys-admin-1"],
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: "e1010101-0002-4000-8000-000000000002",
    title: "Financial Market Order Book & High-Frequency Trades",
    description: "Tick-by-tick order book depth (L2/L3), bid-ask spreads, and trade execution timestamps for top global currency pairs and equities.",
    category: "Finance",
    preferredEngine: "MySQL",
    preferredFormat: "CSV",
    priority: "URGENT",
    status: "IN_PROGRESS",
    requesterId: "sys-admin-2",
    requesterName: "Marcus Sterling",
    requesterEmail: "m.sterling@capital-nexus.io",
    upvotes: 28,
    voterIds: ["sys-admin-2"],
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: "e1010101-0003-4000-8000-000000000003",
    title: "Biomedical Clinical Trials & Genomic Knowledge Graph",
    description: "Interconnected network of FDA-approved clinical trial phases, target protein interactions, gene expressions, and adverse drug reactions.",
    category: "Healthcare",
    preferredEngine: "Neo4J",
    preferredFormat: "JSON",
    priority: "HIGH",
    status: "PENDING",
    requesterId: "sys-admin-3",
    requesterName: "Sarah Chen",
    requesterEmail: "sarah.chen@bio-nexus.med",
    upvotes: 19,
    voterIds: ["sys-admin-3"],
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: "e1010101-0004-4000-8000-000000000004",
    title: "IoT Connected Fleet Vehicle Telemetry",
    description: "High-density GPS coordinates, OBD-II engine diagnostics, tire pressure readings, and speed logs sampled every 5 seconds across 1,000 delivery vehicles.",
    category: "Transportation",
    preferredEngine: "MongoDB",
    preferredFormat: "NDJSON",
    priority: "MEDIUM",
    status: "FULFILLED",
    requesterId: "sys-admin-4",
    requesterName: "Alexandre Moreau",
    requesterEmail: "alex.moreau@fleet-logistics.eu",
    upvotes: 35,
    voterIds: ["sys-admin-4"],
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: "e1010101-0005-4000-8000-000000000005",
    title: "High-Throughput E-Commerce User Session Logs",
    description: "Anonymized session clickstreams, shopping cart revisions, checkout abandonment triggers, and recommendation click-through rates.",
    category: "Business",
    preferredEngine: "CouchBase",
    preferredFormat: "JSON",
    priority: "MEDIUM",
    status: "PENDING",
    requesterId: "sys-admin-5",
    requesterName: "Kaila Daplinan",
    requesterEmail: "daplinankaila91@gmail.com",
    upvotes: 9,
    voterIds: ["sys-admin-5"],
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

const dataRequestsStore = new Map<string, DataRequestRecord>(
  initialRequests.map(req => [req.id, req])
);

const createRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(3000),
  category: z.string().trim().min(1).max(100).default("Education"),
  preferredEngine: z.string().trim().min(1).max(50).default("PostgreSQL"),
  preferredFormat: z.string().trim().min(1).max(20).default("CSV"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM")
});

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "IN_PROGRESS", "FULFILLED", "REJECTED"]),
  fulfilledDatasetId: z.string().uuid().optional()
});

export function createDataRequestRouter(authenticateMiddleware: RequestHandler = authenticate): Router {
  const router = Router();
  router.use(authenticateMiddleware, requireAdminOrSuperAdmin);

  // List all data requests with optional filter
  router.get("/", async (request, response) => {
    const statusFilter = typeof request.query.status === "string" ? request.query.status.toUpperCase() : undefined;
    const engineFilter = typeof request.query.engine === "string" ? request.query.engine : undefined;
    const search = typeof request.query.search === "string" ? request.query.search.toLowerCase().trim() : undefined;

    let items = Array.from(dataRequestsStore.values());

    if (statusFilter && statusFilter !== "ALL") {
      items = items.filter(r => r.status === statusFilter);
    }

    if (engineFilter && engineFilter !== "ALL") {
      items = items.filter(r => r.preferredEngine.toLowerCase() === engineFilter.toLowerCase());
    }

    if (search) {
      items = items.filter(r =>
        r.title.toLowerCase().includes(search) ||
        r.description.toLowerCase().includes(search) ||
        r.category.toLowerCase().includes(search) ||
        r.requesterName.toLowerCase().includes(search)
      );
    }

    // Sort by status priority (urgent/pending first, fulfilled later), then upvotes, then date
    items.sort((a, b) => {
      if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const summary = {
      total: dataRequestsStore.size,
      pending: Array.from(dataRequestsStore.values()).filter(r => r.status === "PENDING").length,
      approved: Array.from(dataRequestsStore.values()).filter(r => r.status === "APPROVED" || r.status === "IN_PROGRESS").length,
      fulfilled: Array.from(dataRequestsStore.values()).filter(r => r.status === "FULFILLED").length
    };

    response.json({
      items,
      total: items.length,
      summary
    });
  });

  // Create a new data request
  router.post("/", async (request, response, next) => {
    try {
      const parsed = createRequestSchema.parse(request.body);
      const user = actor(request);

      const newRecord: DataRequestRecord = {
        id: randomUUID(),
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        preferredEngine: parsed.preferredEngine,
        preferredFormat: parsed.preferredFormat,
        priority: parsed.priority,
        status: "PENDING",
        requesterId: user.actorId || "admin",
        requesterName: (user.actorEmail ? user.actorEmail.split("@")[0] : null) || "Administrator",
        requesterEmail: user.actorEmail || "admin@nexus6.internal",
        upvotes: 1,
        voterIds: [user.actorId || "admin"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      dataRequestsStore.set(newRecord.id, newRecord);
      response.status(201).json(newRecord);
    } catch (error) {
      next(error);
    }
  });

  // Upvote a data request
  router.post("/:id/vote", async (request, response) => {
    const id = request.params.id;
    const user = actor(request);
    const userId = user.actorId || user.actorEmail || "user";

    const item = dataRequestsStore.get(id);
    if (!item) {
      return response.status(404).json({ error: { message: "Data request not found." } });
    }

    const hasVoted = item.voterIds.includes(userId);
    if (hasVoted) {
      // Toggle off
      item.voterIds = item.voterIds.filter(v => v !== userId);
      item.upvotes = Math.max(0, item.upvotes - 1);
    } else {
      // Add vote
      item.voterIds.push(userId);
      item.upvotes += 1;
    }
    item.updatedAt = new Date().toISOString();

    response.json({ upvotes: item.upvotes, hasVoted: !hasVoted });
  });

  // Update status (e.g. APPROVED, IN_PROGRESS, FULFILLED)
  router.patch("/:id/status", async (request, response, next) => {
    try {
      const id = request.params.id;
      const parsed = updateStatusSchema.parse(request.body);

      const item = dataRequestsStore.get(id);
      if (!item) {
        return response.status(404).json({ error: { message: "Data request not found." } });
      }

      item.status = parsed.status;
      if (parsed.fulfilledDatasetId) item.fulfilledDatasetId = parsed.fulfilledDatasetId;
      item.updatedAt = new Date().toISOString();

      response.json(item);
    } catch (error) {
      next(error);
    }
  });

  // Delete a request
  router.delete("/:id", async (request, response) => {
    const id = request.params.id;
    if (dataRequestsStore.has(id)) {
      dataRequestsStore.delete(id);
      return response.status(204).send();
    }
    response.status(404).json({ error: { message: "Data request not found." } });
  });

  return router;
}
