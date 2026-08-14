import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { config } from "../config";
import { AppError } from "../middleware/errorHandler";
import { authenticate, loadUserAuth, type AuthUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/rateLimit";
import { verifyPassword } from "../services/password";
import {
  generateCsrfToken,
  signAccessToken,
  verifyRefreshToken,
} from "../services/jwt";
import { clearAuthCookies, setAuthCookies } from "../services/cookies";
import { asyncHandler } from "./helpers";

/**
 * Auth API (work order 09). Mounted at `/api/v1/auth`.
 *
 * Login issues a httpOnly JWT (access_token) plus a JS-readable CSRF token
 * (xsrf-token) cookie; refresh implements sliding expiration by exchanging any
 * signature-valid token for a fresh one; logout clears both cookies.
 */

const router = Router();

const loginRateLimiter = createRateLimiter({
  windowMs: config.auth.loginRateLimit.windowMs,
  max: config.auth.loginRateLimit.max,
  message: "登录尝试过于频繁，请 1 分钟后再试",
});

/** Serialize an AuthUser as the auth endpoints' response body. */
function toAuthResponse(auth: AuthUser) {
  return {
    id: auth.id,
    name: auth.name,
    email: auth.email,
    roles: auth.roles,
    permissions: auth.permissions,
  };
}

// ── POST /api/v1/auth/login ────────────────────────────────────────────────
router.post(
  "/login",
  loginRateLimiter.middleware,
  asyncHandler(async (req: Request, res: Response) => {
    const email = req.body?.email;
    const password = req.body?.password;

    if (typeof email !== "string" || typeof password !== "string") {
      throw new AppError("VALIDATION_ERROR", "邮箱和密码不能为空", 422);
    }

    const user = await getDb()("users")
      .where({ email: email.trim() })
      .first();

    // Uniform failure for unknown email vs wrong password — no user enumeration.
    if (!user || user.is_active === false || !verifyPassword(password, user.password_hash as string)) {
      throw new AppError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
    }

    const auth = await loadUserAuth(user.id as string);
    if (!auth) {
      throw new AppError("INVALID_CREDENTIALS", "用户不存在或已停用", 401);
    }

    const csrfToken = generateCsrfToken();
    setAuthCookies(res, signAccessToken(user.id as string), csrfToken);
    res.json({ ...toAuthResponse(auth), csrfToken });
  }),
);

// ── POST /api/v1/auth/refresh — sliding expiration ──────────────────────────
router.post(
  "/refresh",
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.[config.jwt.cookieName] as string | undefined;
    if (!token) {
      throw new AppError("UNAUTHORIZED", "请先登录", 401);
    }

    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      throw new AppError("UNAUTHORIZED", "登录已过期，请重新登录", 401);
    }

    const auth = await loadUserAuth(decoded.sub);
    if (!auth) {
      throw new AppError("UNAUTHORIZED", "用户不存在或已停用", 401);
    }

    const csrfToken = generateCsrfToken();
    // Preserve the original `iat` so the absolute 7-day session cap still binds
    // across refreshes (sliding expiration within the login window).
    setAuthCookies(res, signAccessToken(decoded.sub, undefined, decoded.iat), csrfToken);
    res.json({ ...toAuthResponse(auth), csrfToken });
  }),
);

// ── POST /api/v1/auth/logout ────────────────────────────────────────────────
router.post("/logout", (_req: Request, res: Response) => {
  clearAuthCookies(res);
  res.status(204).end();
});

// ── GET /api/v1/auth/me — current user + roles + permissions ────────────────
router.get("/me", authenticate, (req: Request, res: Response) => {
  res.json(toAuthResponse(req.auth as AuthUser));
});

export default router;
