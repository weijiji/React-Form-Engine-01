import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { AppError } from "../middleware/errorHandler";
import { authenticate, requirePermission } from "../middleware/auth";
import { asyncHandler, clampInt } from "./helpers";
import { hashPassword } from "../services/password";

/**
 * User administration + role assignment (work order 09, extended by BUG-01).
 * Mounted at `/api/v1/users`.
 *
 * A user may hold multiple roles; their effective permissions are the union of
 * all roles' codes (computed at request time in `loadUserAuth`). Here we list /
 * create / edit / delete users and manage the `users_roles` assignment —
 * `admin:manage_users` only.
 *
 * BUG-01 completes the CRUD surface: the list gains offset pagination + search/
 * role/status filters, and `POST`/`PATCH`/`DELETE` add the missing create / edit /
 * delete. Delete is a hard delete guarded against three self-inflicted wounds:
 * self-operation, removing the last active admin, and orphaning templates whose
 * `created_by` FK is RESTRICT (see migration `001_initial_schema`).
 */

const router = Router();

const MANAGE_USERS = "admin:manage_users";

async function rolesForUser(userId: string) {
  return getDb()("roles")
    .join("users_roles", "roles.id", "users_roles.role_id")
    .where("users_roles.user_id", userId)
    .select("roles.id", "roles.name", "roles.description");
}

function isEmail(value: unknown): value is string {
  return (
    typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

/** Validate a body's roleIds: every id must reference an existing role. */
async function assertKnownRoles(db: ReturnType<typeof getDb>, roleIds: string[]) {
  if (roleIds.length === 0) return;
  const existing = await db("roles").whereIn("id", roleIds).select("id");
  const known = new Set(existing.map((r) => r.id as string));
  const unknown = roleIds.filter((id) => !known.has(String(id)));
  if (unknown.length > 0) {
    throw new AppError("VALIDATION_ERROR", `未知的角色：${unknown.join(", ")}`, 422);
  }
}

/** True when `userId` is an active user holding the `admin:manage_users` code. */
async function isActiveAdmin(db: ReturnType<typeof getDb>, userId: string) {
  const row = await db("users")
    .join("users_roles", "users.id", "users_roles.user_id")
    .join("roles_permissions", "users_roles.role_id", "roles_permissions.role_id")
    .join("permissions", "roles_permissions.permission_id", "permissions.id")
    .where("users.id", userId)
    .where("users.is_active", true)
    .where("permissions.code", MANAGE_USERS)
    .first();
  return !!row;
}

/** Count active users holding `admin:manage_users`, excluding `excludeId`. */
async function countOtherActiveAdmins(
  db: ReturnType<typeof getDb>,
  excludeId: string,
) {
  const rows = await db("users")
    .join("users_roles", "users.id", "users_roles.user_id")
    .join("roles_permissions", "users_roles.role_id", "roles_permissions.role_id")
    .join("permissions", "roles_permissions.permission_id", "permissions.id")
    .where("users.is_active", true)
    .where("permissions.code", MANAGE_USERS)
    .whereNot("users.id", excludeId)
    .distinct("users.id");
  return rows.length;
}

/** Reject removing the last active admin (deleting or disabling). */
async function assertNotLastAdmin(user: { id: string; is_active: unknown }) {
  if (user.is_active === false) return; // already inactive — nothing is removed
  const db = getDb();
  if (!(await isActiveAdmin(db, user.id))) return;
  if ((await countOtherActiveAdmins(db, user.id)) === 0) {
    throw new AppError("LAST_ADMIN", "不能删除或停用最后一个管理员", 409);
  }
}

// ── GET /api/v1/users — list (filters + offset pagination) ──────────────────
router.get(
  "/",
  authenticate,
  requirePermission(MANAGE_USERS),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { search, roleId, status } = req.query as Record<string, unknown>;

    const page = clampInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(req.query.pageSize, 20, 1, 100);

    const base = db("users");
    if (typeof search === "string" && search.trim() !== "") {
      const q = `%${search.trim()}%`;
      base.where(function () {
        this.whereILike("name", q).orWhereILike("email", q);
      });
    }
    if (typeof roleId === "string" && roleId !== "") {
      base.whereIn("id", db("users_roles").where({ role_id: roleId }).select("user_id"));
    }
    if (status === "active") base.where({ is_active: true });
    if (status === "inactive") base.where({ is_active: false });

    const countRows = (await base.clone().count("*")) as Array<{
      count: string | number;
    }>;
    const total = Number(countRows[0]?.count ?? 0);
    const rows = await base
      .select("id", "name", "email", "is_active")
      .orderBy("created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items = await Promise.all(
      rows.map(async (u) => ({
        id: u.id as string,
        name: u.name as string,
        email: u.email as string,
        is_active: u.is_active !== false,
        roles: await rolesForUser(u.id as string),
      })),
    );

    res.json({ items, total, page, pageSize });
  }),
);

// ── POST /api/v1/users — create a user with an initial password + roles ─────
router.post(
  "/",
  authenticate,
  requirePermission(MANAGE_USERS),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { name, email, password, roleIds } = req.body ?? {};

    if (typeof name !== "string" || name.trim() === "") {
      throw new AppError("VALIDATION_ERROR", "用户姓名不能为空", 422);
    }
    if (!isEmail(email)) {
      throw new AppError("VALIDATION_ERROR", "邮箱格式不正确", 422);
    }
    if (typeof password !== "string" || password === "") {
      throw new AppError("VALIDATION_ERROR", "初始密码不能为空", 422);
    }
    if (roleIds !== undefined && !Array.isArray(roleIds)) {
      throw new AppError("VALIDATION_ERROR", "roleIds 必须为数组", 422);
    }
    const ids: string[] = (roleIds ?? []).map(String);
    await assertKnownRoles(db, ids);

    const existing = await db("users").where({ email: email.trim() }).first();
    if (existing) {
      throw new AppError("EMAIL_TAKEN", "邮箱已被占用", 409);
    }

    const [created] = await db("users")
      .insert({
        name: name.trim(),
        email: email.trim(),
        password_hash: hashPassword(password),
        is_active: true,
      })
      .returning("id");
    const id = created.id as string;

    if (ids.length > 0) {
      await db("users_roles").insert(
        ids.map((roleId) => ({ user_id: id, role_id: roleId })),
      );
    }

    res.status(201).json({
      id,
      name: name.trim(),
      email: email.trim(),
      is_active: true,
      roles: await rolesForUser(id),
    });
  }),
);

// ── GET /api/v1/users/:id/roles — roles assigned to one user ────────────────
router.get(
  "/:id/roles",
  authenticate,
  requirePermission(MANAGE_USERS),
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
  requirePermission(MANAGE_USERS),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getDb()("users").where({ id: req.params.id }).first();
    if (!user) throw new AppError("NOT_FOUND", "用户不存在", 404);

    const roleIds = req.body?.roleIds;
    if (!Array.isArray(roleIds)) {
      throw new AppError("VALIDATION_ERROR", "roleIds 必须为数组", 422);
    }

    const db = getDb();
    await assertKnownRoles(db, roleIds.map(String));

    await db("users_roles").where({ user_id: req.params.id }).del();
    if (roleIds.length > 0) {
      await db("users_roles").insert(
        roleIds.map((roleId) => ({ user_id: req.params.id, role_id: roleId })),
      );
    }

    res.json({ items: await rolesForUser(req.params.id) });
  }),
);

// ── PATCH /api/v1/users/:id — edit name / email / active state ──────────────
router.patch(
  "/:id",
  authenticate,
  requirePermission(MANAGE_USERS),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const user = await db("users").where({ id: req.params.id }).first();
    if (!user) throw new AppError("NOT_FOUND", "用户不存在", 404);

    const { name, email, is_active } = req.body ?? {};

    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      throw new AppError("VALIDATION_ERROR", "用户姓名不能为空", 422);
    }
    if (email !== undefined && !isEmail(email)) {
      throw new AppError("VALIDATION_ERROR", "邮箱格式不正确", 422);
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      throw new AppError("VALIDATION_ERROR", "is_active 必须为布尔值", 422);
    }

    // Disabling a user is a lockout-shaped operation — same guards as delete.
    if (is_active === false) {
      if (req.params.id === req.auth!.id) {
        throw new AppError("USER_SELF_OPERATION", "不能停用当前登录账号", 409);
      }
      await assertNotLastAdmin(user);
    }

    if (email !== undefined) {
      const taken = await db("users")
        .where({ email: email.trim() })
        .whereNot({ id: req.params.id })
        .first();
      if (taken) throw new AppError("EMAIL_TAKEN", "邮箱已被占用", 409);
    }

    const update: Record<string, unknown> = { updated_at: db.fn.now() };
    if (name !== undefined) update.name = name.trim();
    if (email !== undefined) update.email = email.trim();
    if (is_active !== undefined) update.is_active = is_active;

    await db("users").where({ id: req.params.id }).update(update);

    const updated = await db("users").where({ id: req.params.id }).first();
    res.json({
      id: updated.id as string,
      name: updated.name as string,
      email: updated.email as string,
      is_active: updated.is_active !== false,
      roles: await rolesForUser(req.params.id),
    });
  }),
);

// ── DELETE /api/v1/users/:id — hard delete, guarded ─────────────────────────
router.delete(
  "/:id",
  authenticate,
  requirePermission(MANAGE_USERS),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const user = await db("users").where({ id: req.params.id }).first();
    if (!user) throw new AppError("NOT_FOUND", "用户不存在", 404);

    if (req.params.id === req.auth!.id) {
      throw new AppError("USER_SELF_OPERATION", "不能删除当前登录账号", 409);
    }
    await assertNotLastAdmin(user);

    const owned = await db("form_templates")
      .where({ created_by: req.params.id })
      .first();
    if (owned) {
      throw new AppError(
        "USER_HAS_TEMPLATES",
        "该用户创建过模板，请先处理模板归属后再删除",
        409,
      );
    }

    await db("users").where({ id: req.params.id }).del();
    res.status(204).end();
  }),
);

export default router;
