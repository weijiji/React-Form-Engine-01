import { Router, Request, Response, NextFunction } from "express";
import { getDb } from "../db/connection";
import { authenticate, requirePermission } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Identity comes from the JWT cookie (work order 17): every template route
// requires a logged-in user. `DELETE /:id` additionally gates on the
// `template:delete` permission code (work order 20); the rest rely on the
// shared checkout-lock semantics.
router.use(authenticate);

/**
 * Template API (work order 04). All routes are mounted at `/api/v1/templates`.
 *
 * Checkout/checkin implement the exclusive edit lock (CONTEXT.md "签出 / 签入"):
 * exactly one user holds `locked_by` at a time; `PUT …/schema` requires the
 * caller to be that holder. `publish` is a single atomic UPDATE that flips
 * `draft → published` and clears the lock. `force-unlock` is documented as
 * admin-only; role enforcement lands with auth (issue 09), so for now it clears
 * the lock unconditionally — consistent with the MVP's permissive CSRF stance.
 */

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  schema: unknown;
  approval_chain: unknown;
  status: "draft" | "published" | "archived";
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/** Express 4 does not await async handlers; forward rejections to `next`. */
type Handler = (req: Request, res: Response) => Promise<unknown>;
function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/**
 * Normalize a DB row into the API shape. The seed stores `schema`/`approval_chain`
 * as JSON strings; rows written through this route store JSONB objects. Parse
 * strings defensively so both shapes read as objects.
 */
function toTemplate(row: Record<string, unknown>): TemplateRow {
  const parse = (value: unknown): unknown =>
    typeof value === "string" ? JSON.parse(value) : value;

  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    version: Number(row.version),
    schema: parse(row.schema),
    approval_chain: row.approval_chain == null ? null : parse(row.approval_chain),
    status: row.status as TemplateRow["status"],
    locked_by: (row.locked_by as string | null) ?? null,
    locked_by_name: null,
    locked_at: row.locked_at ? (row.locked_at as Date) : null,
    created_by: row.created_by as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/** Attach the lock holder's display name for the designer's checkout badge. */
async function withLockerName(template: TemplateRow): Promise<TemplateRow> {
  if (!template.locked_by) return template;
  return { ...template, locked_by_name: await lockerName(template.locked_by) };
}

async function findTemplate(id: string): Promise<TemplateRow> {
  const row = await getDb()("form_templates").where({ id }).first();
  if (!row) {
    throw new AppError("NOT_FOUND", "模板不存在", 404);
  }
  return toTemplate(row);
}

async function lockerName(userId: string): Promise<string> {
  const user = await getDb()("users").where({ id: userId }).first();
  return user?.name ?? "其他用户";
}

function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// ── POST /api/v1/templates — create + auto-checkout ─────────────────────────
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const name = req.body?.name;

    if (typeof name !== "string" || name.trim() === "") {
      throw new AppError("VALIDATION_ERROR", "模板名称不能为空", 422);
    }

    const db = getDb();
    const [created] = await db("form_templates")
      .insert({
        name: name.trim(),
        description: req.body.description ?? null,
        category: req.body.category ?? null,
        schema: req.body.schema ?? { schemaVersion: "1.0.0", sections: [] },
        approval_chain: req.body.approval_chain ?? null,
        status: "draft",
        locked_by: user.id,
        locked_at: db.fn.now(),
        created_by: user.id,
      })
      .returning("*");

    res.status(201).json(await withLockerName(toTemplate(created)));
  }),
);

// ── GET /api/v1/templates — list (filters + offset pagination) ──────────────
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { category, status, search } = req.query as Record<string, unknown>;

    const page = clampInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(req.query.pageSize, 20, 1, 100);

    const base = db("form_templates");
    if (typeof category === "string" && category !== "") {
      base.where({ category });
    }
    if (typeof status === "string" && status !== "") {
      base.where({ status });
    }
    if (typeof search === "string" && search.trim() !== "") {
      base.whereILike("name", `%${search.trim()}%`);
    }

    const countRows = (await base.clone().count("*")) as Array<{
      count: string | number;
    }>;
    const total = Number(countRows[0]?.count ?? 0);
    const rows = await base
      .orderBy("created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items = rows.map(toTemplate);
    const lockedIds = [...new Set(items.map((t) => t.locked_by).filter(Boolean))] as string[];
    const holders = lockedIds.length
      ? await db("users").whereIn("id", lockedIds).select("id", "name")
      : [];
    const nameById = new Map(holders.map((u) => [u.id, u.name]));

    res.json({
      items: items.map((t) => ({
        ...t,
        locked_by_name: t.locked_by ? nameById.get(t.locked_by) ?? null : null,
      })),
      total,
      page,
      pageSize,
    });
  }),
);

// ── GET /api/v1/templates/:id — detail ──────────────────────────────────────
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await withLockerName(await findTemplate(req.params.id)));
  }),
);

// ── DELETE /api/v1/templates/:id — delete a draft the caller holds ──────────
// Delete is a destructive mutation, so it sits behind `template:delete` (work
// order 20) and the exclusive checkout lock, like any other edit: the caller
// must hold `locked_by`. Check order: status first (a published/archived
// template may have instances/drafts referencing it — those must be archived,
// not deleted), then the lock.
router.delete(
  "/:id",
  requirePermission("template:delete"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const template = await findTemplate(req.params.id);

    if (template.status !== "draft") {
      throw new AppError("TEMPLATE_NOT_DRAFT", "仅草稿模板可删除", 400);
    }

    if (template.locked_by !== user.id) {
      if (template.locked_by == null) {
        throw new AppError("TEMPLATE_LOCKED", "模板未签出，请先签出后删除", 409);
      }
      throw new AppError(
        "TEMPLATE_LOCKED",
        `模板已被 ${await lockerName(template.locked_by)} 签出，仅签出人可删除`,
        409,
      );
    }

    // Write-time guard (ADR-0003): the checks above ran on the row read at the
    // start of the request; a concurrent publish/checkout could have changed
    // status or holder in between, so re-guard at delete time. 0 rows affected
    // means the row no longer matches (e.g. was just published) — back off.
    const deleted = await getDb()("form_templates")
      .where({ id: template.id })
      .andWhere({ status: "draft" })
      .andWhere({ locked_by: user.id })
      .del();
    if (deleted === 0) {
      throw new AppError("TEMPLATE_LOCKED", "模板状态已变化，请刷新后重试", 409);
    }
    res.status(204).end();
  }),
);

// ── PUT /api/v1/templates/:id/schema — save schema (lock holder only) ───────
router.put(
  "/:id/schema",
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const template = await findTemplate(req.params.id);

    if (template.locked_by !== user.id) {
      if (template.locked_by == null) {
        throw new AppError("TEMPLATE_LOCKED", "模板未签出，请先签出后编辑", 409);
      }
      throw new AppError(
        "TEMPLATE_LOCKED",
        `模板已被 ${await lockerName(template.locked_by)} 签出`,
        409,
      );
    }

    const schema = req.body?.schema;
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      throw new AppError("VALIDATION_ERROR", "schema 必须为对象", 422);
    }

    const db = getDb();
    const update: Record<string, unknown> = {
      schema,
      updated_at: db.fn.now(),
      version: db.raw("version + 1"),
    };
    if (req.body.approval_chain !== undefined) {
      update.approval_chain = req.body.approval_chain;
    }

    const [updated] = await db("form_templates")
      .where({ id: template.id })
      .update(update)
      .returning("*");

    res.json(await withLockerName(toTemplate(updated)));
  }),
);

// ── POST /api/v1/templates/:id/checkout — acquire lock ──────────────────────
router.post(
  "/:id/checkout",
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const template = await findTemplate(req.params.id);

    if (template.locked_by === user.id) {
      res.json(await withLockerName(template));
      return;
    }
    if (template.locked_by != null) {
      throw new AppError(
        "TEMPLATE_LOCKED",
        `模板已被 ${await lockerName(template.locked_by)} 签出`,
        409,
      );
    }

    const db = getDb();
    const [updated] = await db("form_templates")
      .where({ id: template.id })
      .update({ locked_by: user.id, locked_at: db.fn.now(), updated_at: db.fn.now() })
      .returning("*");

    res.json(await withLockerName(toTemplate(updated)));
  }),
);

// ── POST /api/v1/templates/:id/checkin — release lock ───────────────────────
router.post(
  "/:id/checkin",
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const template = await findTemplate(req.params.id);

    if (template.locked_by == null) {
      res.json(template);
      return;
    }
    if (template.locked_by !== user.id) {
      throw new AppError(
        "TEMPLATE_LOCKED",
        `仅签出人（${await lockerName(template.locked_by)}）可签入`,
        409,
      );
    }

    const db = getDb();
    const [updated] = await db("form_templates")
      .where({ id: template.id })
      .update({ locked_by: null, locked_at: null, updated_at: db.fn.now() })
      .returning("*");

    res.json(await withLockerName(toTemplate(updated)));
  }),
);

// ── POST /api/v1/templates/:id/publish — draft → published ──────────────────
router.post(
  "/:id/publish",
  asyncHandler(async (req: Request, res: Response) => {
    const template = await findTemplate(req.params.id);

    if (template.status !== "draft") {
      throw new AppError("TEMPLATE_NOT_DRAFT", "仅草稿模板可发布", 400);
    }

    // Atomic draft → published transition (ADR-0003-style optimistic guard on
    // `status`). The MVP has no template cache, so clearing it is a no-op —
    // this UPDATE is the whole publish side effect.
    const db = getDb();
    const [updated] = await db("form_templates")
      .where({ id: template.id })
      .andWhere({ status: "draft" })
      .update({
        status: "published",
        locked_by: null,
        locked_at: null,
        updated_at: db.fn.now(),
        version: db.raw("version + 1"),
      })
      .returning("*");

    res.json(await withLockerName(toTemplate(updated)));
  }),
);

// ── POST /api/v1/templates/:id/force-unlock — admin override ────────────────
router.post(
  "/:id/force-unlock",
  asyncHandler(async (req: Request, res: Response) => {
    const template = await findTemplate(req.params.id);

    const db = getDb();
    const [updated] = await db("form_templates")
      .where({ id: template.id })
      .update({ locked_by: null, locked_at: null, updated_at: db.fn.now() })
      .returning("*");

    res.json(await withLockerName(toTemplate(updated)));
  }),
);

export default router;
