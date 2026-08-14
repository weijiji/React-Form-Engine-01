import { NextFunction, Request, Response } from "express";

/**
 * In-memory fixed-window rate limiter (ID-15 / design spec §7.3).
 *
 * MVP keeps counters in process memory — no Redis. A window bucket resets once
 * `windowMs` has elapsed since the bucket opened. Keyed by `req.ip` (the client
 * IP; honours `X-Forwarded-For` when the app trusts the proxy).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed within one window. */
  max: number;
  /** Optional error message override (defaults to a generic Chinese string). */
  message?: string;
}

export interface RateLimiter {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Clear all buckets — exposed for tests to isolate the login limiter. */
  reset: () => void;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function reset(): void {
    buckets.clear();
  }

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: options.message ?? "请求过于频繁，请稍后重试",
        },
      });
      return;
    }

    existing.count += 1;
    next();
  }

  return { middleware, reset };
}
