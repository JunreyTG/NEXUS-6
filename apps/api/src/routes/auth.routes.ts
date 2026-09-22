import rateLimit from "express-rate-limit";
import { Router, type Request } from "express";
import { z } from "zod";
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from "../auth/refresh-token.js";
import { authenticate } from "../auth/middleware.js";
import type { RequestHandler } from "express";
import { AuthService, type SessionRequestMetadata } from "../auth/service.js";
import { AdminManagementService } from "../services/admin-management.service.js";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(4096)
});
const tokenSchema = z.string().trim().min(1);
const setPasswordSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(12).max(256),
  passwordConfirmation: z.string().min(12).max(256)
}).refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"] });

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const authActionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

function requestMetadata(request: Request): SessionRequestMetadata {
  const userAgent = request.get("user-agent");
  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(userAgent ? { userAgent } : {})
  };
}

export function createAuthRouter(authService = new AuthService(), adminService = new AdminManagementService(), authenticateMiddleware: RequestHandler = authenticate): Router {
  const router = Router();

  router.post("/login", loginRateLimit, async (request, response, next) => {
    try {
      const input = loginSchema.parse(request.body);
      const result = await authService.login(input, requestMetadata(request));
      const config = authService.getConfig();
      setRefreshCookie(response, result.refreshToken, config);
      response.status(200).json({ accessToken: result.accessToken, user: result.user });
    } catch (error) {
      next(error);
    }
  });

  router.post("/refresh", authActionRateLimit, async (request, response, next) => {
    try {
      const result = await authService.refresh(request.cookies?.[REFRESH_COOKIE_NAME], requestMetadata(request));
      setRefreshCookie(response, result.refreshToken, authService.getConfig());
      response.status(200).json({ accessToken: result.accessToken, user: result.user });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", async (request, response, next) => {
    try {
      await authService.logout(request.cookies?.[REFRESH_COOKIE_NAME], requestMetadata(request));
      clearRefreshCookie(response, authService.getConfig());
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", authenticateMiddleware, (request, response) => {
    response.status(200).json({ email: request.principal!.email, role: request.principal!.role });
  });

  router.get("/verify-email", authActionRateLimit, async (request, response, next) => {
    try {
      const token = tokenSchema.parse(request.query.token);
      response.status(200).json({ status: "verified", ...(await adminService.verifyEmail(token)) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/set-password", authActionRateLimit, async (request, response, next) => {
    try {
      const input = setPasswordSchema.parse(request.body);
      response.status(200).json({ status: "active", admin: await adminService.setPassword(input.token, input.password) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const authRouter = createAuthRouter();
