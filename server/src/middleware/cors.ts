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
      return callback(null, true);
    }

    // In development, allow any localhost/127.0.0.1 origin regardless of port —
    // Vite auto-increments the port (e.g. 5173 → 5174) when one is occupied, so
    // a fixed whitelist silently breaks the dev loop.
    if (config.isDev) {
      try {
        const { hostname } = new URL(origin);
        if (hostname === "localhost" || hostname === "127.0.0.1") {
          return callback(null, true);
        }
      } catch {
        // Malformed origin — fall through to reject.
      }
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`));
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
