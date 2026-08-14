import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { AppError } from "../middleware/errorHandler";
import { authenticate, requirePermission } from "../middleware/auth";
import { asyncHandler } from "./helpers";

/**
 * User administration + role assignment (work order 09). Mounted at `/api/v1/users`.
 *
 * A user may hold multiple roles; their effective permissions are the union of
 * all roles' codes (computed at request time in `loadUserAuth`). Here we list
 * users and manage the `users_roles` assignment — `admin:manage_users` only.
 */

const router = Router();

async function rolesForUser(userId: string) {
  return getDb()("roles")
    .join("users_roles", "roles.id", "users_roles.role_id")
    .where("users_roles.user_id", userId)
    .select("roles.id", "roles.name", "roles.description");
}

// ── GET /api/v1/users — list users with their assigned roles ────────────────
router.get(
  "/",
  authenticate,
  requirePermission("admin:manage_users"),
  asyncHandler(async (_req: Request, res: Response) => {
    const users = await getDb()("users")
      .select("id", "name", "email", "is_active")
      .orderBy("created_at", "asc");

    const items = await Promise.all(
      users.map(async (u) => ({
        id: u.id as string,
        name: u.name as string,
        email: u.email as string,
        is_active: u.is_active !== false,
        roles: await rolesForUser(u.id as string),
      })),
    );

    res.json({ items });
  }),
);

// ── GET /api/v1/users/:id/roles — roles assigned to one user ────────────────
router.get(
  "/:id/roles",
  authenticate,
  requirePermission("admin:manage_users"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getDb()("users").where({ id: req.params.id }).first();
    if (!user) throw new AppError("NOT_FOUND", "用户不存在", 404);

    res.json({ items: await rolesForUser(req.params.id) });
  }),
);

// ── POST /api/v1/users/:id/roles — replace the user's role set ──────────────
router.post(
  "/:id/roles",
  authenticate,
  requirePermission("admin:manage_users"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getDb()("users").where({ id: req.params.id }).first();
    if (!user) throw new AppError("NOT_FOUND", "用户不存在", 404);

    const roleIds = req.body?.roleIds;
    if (!Array.isArray(roleIds)) {
      throw new AppError("VALIDATION_ERROR", "roleIds 必须为数组", 422);
    }

    const db = getDb();
    if (roleIds.length > 0) {
      const existing = await db("roles").whereIn("id", roleIds).select("id");
      const known = new Set(existing.map((r) => r.id as string));
      const unknown = roleIds.filter((id) => !known.has(String(id)));
      if (unknown.length > 0) {
        throw new AppError("VALIDATION_ERROR", `未知的角色：${unknown.join(", ")}`, 422);
      }
    }

    await db("users_roles").where({ user_id: req.params.id }).del();
    if (roleIds.length > 0) {
      await db("users_roles").insert(
        roleIds.map((roleId) => ({ user_id: req.params.id, role_id: roleId })),
      );
    }

    res.json({ items: await rolesForUser(req.params.id) });
  }),
);

export default router;
