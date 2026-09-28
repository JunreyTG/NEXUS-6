import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { issueAccessToken } from "../src/auth/tokens.js";
import { requireAuthConfig } from "../src/auth/config.js";
import { DatasetService } from "../src/services/dataset.service.js";
import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";


describe("DataVault6 Frontend API Connectivity Endpoints", () => {
  let app: Express;
  let superToken: string;
  let adminToken: string;
  const adminId = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    const config = requireAuthConfig();

    const mockRepo = {
      getCategoryStatistics: async () => ({
        totalDatasets: 2,
        categories: { Education: 1, Environment: 1, Transportation: 0, Demographics: 0, Business: 0, Finance: 0, Healthcare: 0 },
        databaseEngines: { MySQL: 1, SQLServer: 0, PostgreSQL: 1, MongoDB: 0, Neo4J: 0, CouchBase: 0 },
        breakdown: [{ category: "Education", count: 1, percentage: 50 }, { category: "Environment", count: 1, percentage: 50 }]
      }),
      getContributorStatistics: async () => ({
        totalContributors: 1,
        contributors: [{ id: adminId, name: "Alice Admin", email: "admin@nexus-6.test", datasetCount: 2, lastActiveAt: new Date() }],
        recentActivity: []
      }),
      listNotifications: async () => [
        { id: "00000000-0000-4000-8000-000000000001", title: "Dataset Uploaded", message: "Dataset uploaded successfully.", read: false, createdAt: new Date() }
      ],
      countUnreadNotifications: async () => 1,
      markAllNotificationsAsRead: async () => {},
      markNotificationAsRead: async () => {},
      getBookmarkedIds: async () => ["d1"],
      findBookmarked: async () => ({
        items: [{ id: "d1", name: "University Enrollment", category: "Education", visibility: "PRIVATE", ownerAdminId: adminId, createdAt: new Date(), updatedAt: new Date() }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1
      }),
      findById: async (id: string) => ({ id, name: "University Enrollment", visibility: "PUBLIC", ownerAdminId: adminId }),
      addBookmark: async () => {},
      removeBookmark: async () => {},
      isBookmarked: async () => true
    };

    const mockLog = {
      recordDatasetActivity: async () => {},
      recordAudit: async () => {},
      getDownloadCount: async () => 5,
      getActivityTimeline: async (days = 7) => {
        const arr = [];
        for (let i = 0; i < days; i++) {
          arr.push({ date: `2026-09-${20 + i}`, label: `Sep ${20 + i}`, count: 3 + i });
        }
        return arr;
      }
    };

    const datasetService = new DatasetService({ datasets: mockRepo as any, logger: mockLog as any });
    app = createApp(undefined, undefined, mockLog as any, datasetService);

    superToken = await issueAccessToken(
      {
        type: "SUPER_ADMIN",
        id: null,
        email: config.SUPER_ADMIN_EMAIL,
        role: "SUPER_ADMIN"
      },
      "super-session",
      config
    );

    adminToken = await issueAccessToken(
      {
        type: "ADMIN",
        id: adminId,
        email: "admin@nexus-6.test",
        role: "ADMIN"
      },
      "admin-session",
      config
    );
  });

  describe("Dashboard Stats API", () => {
    it("returns real dashboard metrics, kpis, timeline, and database engine counts", async () => {
      const res = await request(app)
        .get("/api/dashboard/stats?days=7")
        .set("Authorization", `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("kpis");
      expect(res.body.kpis).toHaveProperty("totalDatasets");
      expect(res.body.kpis).toHaveProperty("totalContributors");
      expect(res.body.kpis).toHaveProperty("categoriesCount");
      expect(res.body.kpis).toHaveProperty("totalDownloads");
      expect(res.body).toHaveProperty("databaseEngines");
      expect(res.body).toHaveProperty("timeline");
      expect(Array.isArray(res.body.timeline)).toBe(true);
      expect(res.body.timeline.length).toBe(7);
      expect(res.body.timeline[0]).toHaveProperty("date");
      expect(res.body.timeline[0]).toHaveProperty("count");
    });

    it("allows ADMIN users to retrieve dashboard stats", async () => {
      const res = await request(app)
        .get("/api/dashboard/stats?days=14")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.timeline.length).toBe(14);
    });

    it("rejects unauthenticated requests to dashboard stats", async () => {
      const res = await request(app).get("/api/dashboard/stats");
      expect(res.status).toBe(401);
    });
  });

  describe("Notifications API", () => {
    it("returns notifications list and unread count", async () => {
      const countRes = await request(app)
        .get("/api/notifications/count")
        .set("Authorization", `Bearer ${superToken}`);

      expect(countRes.status).toBe(200);
      expect(countRes.body).toHaveProperty("unreadCount");
      expect(typeof countRes.body.unreadCount).toBe("number");

      const listRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${superToken}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
    });

    it("marks all notifications as read", async () => {
      const res = await request(app)
        .patch("/api/notifications/read-all")
        .set("Authorization", `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe("Bookmarks API", () => {
    it("returns bookmarked IDs array", async () => {
      const res = await request(app)
        .get("/api/datasets/bookmarked/ids")
        .set("Authorization", `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("returns bookmarked datasets paginated list", async () => {
      const res = await request(app)
        .get("/api/datasets/bookmarked")
        .set("Authorization", `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("items");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("page");
    });
  });

  describe("Web UI Assets", () => {
    const webDir = path.resolve(process.cwd(), "../web");

    it("ensures apps/web/index.html has no mock dataset rows or fake activities", () => {
      const indexPath = path.join(webDir, "index.html");
      const html = fs.readFileSync(indexPath, "utf8");
      expect(html).toContain("DataVault6");
      expect(html).not.toContain("Student Enrollment Dataset");
      expect(html).not.toContain("Traffic Accident Records");
      expect(html).not.toContain("Population Statistics");
      expect(html).not.toContain("Weather Data 2026");
      expect(html).not.toContain("Sales Report 2026");
      expect(html).toContain("datasetsTableBody");
      expect(html).toContain("datasetPagination");
    });

    it("ensures apps/web/app.js has zero Math.random simulator calls and connects to API", () => {
      const appJsPath = path.join(webDir, "app.js");
      const js = fs.readFileSync(appJsPath, "utf8");
      expect(js).not.toContain("Math.random");
      expect(js).not.toContain("INITIAL_ACTIVITY_LOGS");
      expect(js).toContain("apiClient");
      expect(js).toContain("DashboardManager");
      expect(js).toContain("DatasetsManager");
    });
  });
});

