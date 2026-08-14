import { Request, Response, NextFunction } from "express";
import { config } from "../config";

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * CSRF protection middleware.
 *
 * For all mutating requests (POST/PUT/PATCH/DELETE), validates that the
 * X-CSRF-Token header matches the CSRF cookie value.
 *
 * The CSRF cookie is set by the client (readable via non-httpOnly cookie)
 * and sent back in the X-CSRF-Token header.
 *
 * The CSRF cookie is set on login (see services/cookies.ts) and read by the
 * client via `document.cookie` to echo back in the header. Requests that carry
 * no CSRF cookie at all (e.g. the pre-auth legacy X-User-Id routes, or the
 * login request itself) are still allowed, preserving backward compatibility
 * with the pre-issue-09 surface; once a cookie is present the header must match.
 */
export function csrfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip CSRF check for non-mutating methods
  if (!MUTATING_METHODS.includes(req.method)) {
    return next();
  }

  // Skip CSRF for health check
  if (req.path === "/api/v1/health") {
    return next();
  }

  const csrfCookie = req.cookies?.[config.csrf.cookieName];
  const csrfHeader = req.headers["x-csrf-token"] as string | undefined;

  // In MVP, if CSRF cookie is not set yet, allow the request
  // The CSRF cookie will be set by the auth service on login.
  // In production, this should reject requests without a valid CSRF token.
  if (!csrfCookie) {
    // Log warning in non-production environments
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[CSRF] No CSRF cookie found — allowing request to ${req.method} ${req.path} (MVP mode)`
      );
    }
    return next();
  }

  if (!csrfHeader) {
    res.status(403).json({
      error: {
        code: "CSRF_TOKEN_MISSING",
        message: "缺少 CSRF Token，请刷新页面后重试",
      },
    });
    return;
  }

  if (csrfCookie !== csrfHeader) {
    res.status(403).json({
      error: {
        code: "CSRF_TOKEN_MISMATCH",
        message: "CSRF Token 不匹配，请刷新页面后重试",
      },
    });
    return;
  }

  next();
}
