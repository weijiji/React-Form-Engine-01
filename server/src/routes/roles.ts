import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { AppError } from "../middleware/errorHandler";
import { authenticate, requireAnyPermission, requirePermission } from "../middleware/auth";
import { asyncHandler } from "./helpers";

/**
 * Role CRUD (work order 09). Mounted at `/api/v1/roles`.
 *
 * A role bundles a set of permission codes (roles_permissions). Creating a role
 * requires at least one permission. Mutations require `admin:manage_roles`;
 * the read-only catalog (`GET /`) is additionally available to
 * `admin:manage_users` holders so the user-management page can drive its role
 * picker — those callers receive only the roles they are allowed to grant
 * (permission-subset rule, BUG-08/09).
 */

const router = Router();

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
}

async function permissionCodesFor(roleId: string): Promise<string[]> {
  const rows = await getDb()("roles_permissions")
    .join("permissions", "permissions.id", "roles_permissions.permission_id")
    .where("roles_permissions.role_id", roleId)
    .select("permissions.code");
  return rows.map((r) => r.code as string);
}

async function toRole(row: RoleRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: await permissionCodesFor(row.id),
    created_at: row.created_at,
  };
}

async function findRole(id: string): Promise<RoleRow> {
  const row = await getDb()("roles").where({ id }).first();
  if (!row) throw new AppError("NOT_FOUND", "角色不存在", 404);
  return row as RoleRow;
}

/**
 * Validate permission codes: must be a non-empty array and every code must
 * exist in the seeded permission catalog.
 */
async function validatePermissionCodes(codes: unknown): Promise<string[]> {
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new AppError("VALIDATION_ERROR", "创建角色时至少需勾选 1 个权限码", 422);
  }
  const normalized = codes.map((c) => String(c));
  const existing = await getDb()("permissions").whereIn("code", normalized);
  const known = new Set(existing.map((p) => p.code as string));
  const unknown = normalized.filter((c) => !known.has(c));
  if (unknown.length > 0) {
    throw new AppError("VALIDATION_ERROR", `未知的权限码：${unknown.join(", ")}`, 422);
  }
  return [...new Set(normalized)];
}

function assertRoleName(name: unknown): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new AppError("VALIDATION_ERROR", "角色名称不能为空", 422);
  }
  return name.trim();
}

// ── GET /api/v1/roles — list roles with permission codes ────────────────────
// `admin:manage_roles` callers see the full catalog; `admin:manage_users`
// callers (limited admins) see only roles whose permission set is a subset of
// their own — the exact set they may grant (BUG-08/09).
router.get(
  "/",
  authenticate,
  requireAnyPermission("admin:manage_roles", "admin:manage_users"),
  asyncHandler(async (req: Request, res: Response) => {
    const rows = (await getDb()("roles").orderBy("created_at", "asc")) as RoleRow[];
    const items = (await Promise.all(rows.map(toRole))).filter((role) => {
      if (req.auth!.permissions.includes("admin:manage_roles")) return true;
      return role.permissions.every((code) =>
        req.auth!.permissions.includes(code),
      );
    });
    res.json({ items });
  }),
);

// ── POST /api/v1/roles — create (≥1 permission required) ────────────────────
router.post(
  "/",
  authenticate,
  requirePermission("admin:manage_roles"),
  asyncHandler(async (req: Request, res: Response) => {
    const name = assertRoleName(req.body?.name);
    const permissionCodes = await validatePermissionCodes(req.body?.permissionCodes);

    const existing = await getDb()("roles").where({ name }).first();
    if (existing) {
      throw new AppError("VALIDATION_ERROR", "角色名称已存在", 422);
    }

    const db = getDb();
    const [created] = await db("roles")
      .insert({ name, description: req.body?.description ?? null })
      .returning("*");

    const permissionRows = await db("permissions").whereIn("code", permissionCodes);
    await db("roles_permissions").insert(
      permissionRows.map((p) => ({ role_id: created.id, permission_id: p.id })),
    );

    res.status(201).json(await toRole(created as RoleRow));
  }),
);

// ── PUT /api/v1/roles/:id — update name/description/permissions ─────────────
router.put(
  "/:id",
  authenticate,
  requirePermission("admin:manage_roles"),
  asyncHandler(async (req: Request, res: Response) => {
    const role = await findRole(req.params.id);
    const db = getDb();

    const update: Record<string, unknown> = {};
    if (req.body?.name !== undefined) {
      update.name = assertRoleName(req.body.name);
    }
    if (req.body?.description !== undefined) {
      update.description = req.body.description ?? null;
    }
    if (Object.keys(update).length > 0) {
      const [updated] = await db("roles").where({ id: role.id }).update(update).returning("*");
      Object.assign(role, updated);
    }

    if (req.body?.permissionCodes !== undefined) {
      const permissionCodes = await validatePermissionCodes(req.body.permissionCodes);
      await db("roles_permissions").where({ role_id: role.id }).del();
      const permissionRows = await db("permissions").whereIn("code", permissionCodes);
      if (permissionRows.length > 0) {
        await db("roles_permissions").insert(
          permissionRows.map((p) => ({ role_id: role.id, permission_id: p.id })),
        );
      }
    }

    res.json(await toRole(role));
  }),
);

// ── DELETE /api/v1/roles/:id — delete (cascades assignments) ────────────────
router.delete(
  "/:id",
  authenticate,
  requirePermission("admin:manage_roles"),
  asyncHandler(async (req: Request, res: Response) => {
    const role = await findRole(req.params.id);
    await getDb()("roles").where({ id: role.id }).del();
    res.status(204).end();
  }),
);

export default router;
