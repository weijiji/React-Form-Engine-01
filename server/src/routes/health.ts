import { Router, Request, Response } from "express";
import { checkDbConnection } from "../db/connection";
import { config } from "../config";

const router = Router();

/**
 * GET /api/v1/health
 * Returns server health status including database connectivity.
 */
router.get("/api/v1/health", async (_req: Request, res: Response) => {
  const dbConnected = await checkDbConnection();

  const status = dbConnected ? "ok" : "degraded";
  const httpStatus = dbConnected ? 200 : 503;

  res.status(httpStatus).json({
    status,
    db: dbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.env,
  });
});

export default router;
