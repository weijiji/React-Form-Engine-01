import { NextFunction, Request, Response } from "express";
import { getDb } from "../db/connection";
import { config } from "../config";
import { verifyAccessToken } from "../services/jwt";

/**
 * Authentication + authorization middleware (work order 09).
 *
 * `authenticate` resolves the JWT from the httpOnly cookie and loads the user's
 * roles and permission codes fresh from the DB on every request — so a role
 * change takes effect on the very next request (no token revocation needed).
 * `requirePermission` then gates a route on the required permission codes.
 */

export interface AuthRole {
  id: string;
  name: string;
  description: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: AuthRole[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

/** Load a user plus their roles and permission-code union (or null if inactive/missing). */
export async function loadUserAuth(userId: string): Promise<AuthUser | null> {
  const db = getDb();

  const user = await db("users").where({ id: userId }).first();
  if (!user || user.is_active === false) return null;

  const roles = await db("roles")
    .join("users_roles", "roles.id", "users_roles.role_id")
    .where("users_roles.user_id", userId)
    .select("roles.id", "roles.name", "roles.description");

  const permissionRows = await db("permissions")
    .join("roles_permissions", "permissions.id", "roles_permissions.permission_id")
    .join("users_roles", "roles_permissions.role_id", "users_roles.role_id")
    .where("users_roles.user_id", userId)
    .select("permissions.code");

  const permissions = [...new Set(permissionRows.map((p) => p.code as string))];

  return {
    id: user.id as string,
    name: user.name as string,
    email: user.email as string,
    roles: roles.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
    })),
    permissions,
  };
}

/** Resolve the JWT cookie → `req.auth`; 401 when missing/invalid/inactive. */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[config.jwt.cookieName] as string | undefined;
  if (!token) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "请先登录" },
    });
    return;
  }

  const userId = verifyAccessToken(token);
  if (!userId) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "登录已过期，请重新登录" },
    });
    return;
  }

  try {
    const auth = await loadUserAuth(userId);
    if (!auth) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "用户不存在或已停用" },
      });
      return;
    }
    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Gate a route on a set of required permission codes. The current user's
 * `permissions` must include every declared code (AND semantics) — the route
 * declares all the codes it requires, so missing any one of them is a 403.
 */
export function requirePermission(...codes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const permissions = req.auth?.permissions ?? [];
    if (!codes.every((code) => permissions.includes(code))) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "无权限执行此操作" },
      });
      return;
    }
    next();
  };
}

/**
 * Gate a route on ANY of the required permission codes (OR semantics) — holding
 * at least one declared code passes. Used where two different codes unlock the
 * same operation, e.g. `GET /roles`: role managers see the full catalog while
 * user managers see the grantable subset (BUG-08/09).
 */
export function requireAnyPermission(...codes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const permissions = req.auth?.permissions ?? [];
    if (!codes.some((code) => permissions.includes(code))) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "无权限执行此操作" },
      });
      return;
    }
    next();
  };
}

/**
 * Admin-class (管理 category) permission codes — the `admin:*` codes carrying
 * user/role-management power. Under the BUG-09 grant policy a role containing
 * any of these may only be assigned by a full role manager
 * (`admin:manage_roles`); ordinary business roles are assignable by anyone
 * with `admin:manage_users`.
 */
export function isAdminClassPermission(code: string): boolean {
  return code.startsWith("admin:");
}
