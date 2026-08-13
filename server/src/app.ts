import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { traceIdMiddleware } from "./middleware/traceId";
import { requestLoggerMiddleware } from "./middleware/logger";
import { corsMiddleware } from "./middleware/cors";
import { csrfMiddleware } from "./middleware/csrf";
import { errorHandlerMiddleware } from "./middleware/errorHandler";
import healthRouter from "./routes/health";
import meRouter from "./routes/me";
import templatesRouter from "./routes/templates";

/**
 * Create and configure the Express application.
 */
export function createApp(): express.Application {
  const app = express();

  // ── Middleware chain (order matters) ──────────────────────
  // 1. TraceId — must be first so all subsequent handlers have req.traceId
  app.use(traceIdMiddleware);

  // 2. Request logging
  app.use(requestLoggerMiddleware);

  // 3. Security headers (helmet)
  app.use(helmet());

  // 4. CORS — explicit whitelist
  app.use(corsMiddleware);

  // 5. Cookie parser (needed for CSRF cookie)
  app.use(cookieParser());

  // 6. JSON body parser
  app.use(express.json({ limit: "1mb" }));

  // 7. CSRF protection (mutating methods only)
  app.use(csrfMiddleware);

  // ── Routes ────────────────────────────────────────────────
  app.use(healthRouter);
  app.use(meRouter);
  app.use("/api/v1/templates", templatesRouter);

  // ── 404 catch-all ─────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "请求的资源不存在",
      },
    });
  });

  // ── Unified error handler (must be last) ──────────────────
  app.use(errorHandlerMiddleware);

  return app;
}
