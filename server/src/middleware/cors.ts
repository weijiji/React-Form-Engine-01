import cors from "cors";
import { config } from "../config";

/**
 * CORS middleware with explicit whitelist.
 * No wildcard — only allows configured origins.
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (config.cors.origins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true, // Required for httpOnly cookies
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-CSRF-Token",
    "X-Trace-Id",
    "Idempotency-Key",
  ],
  exposedHeaders: ["X-Trace-Id"],
});
