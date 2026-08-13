import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { resolveCurrentUser } from "../middleware/currentUser";
import { AppError } from "../middleware/errorHandler";
import { parseSchema, type FormValues } from "form-engine-core";
import { asyncHandler, clampInt, parseJsonb, requireObject } from "./helpers";
import { migrateFieldValues } from "../services/fieldMigration";

const router = Router();

/**
 * Draft API (work order 05). A `drafts` row is a lightweight, template-version
 * independent save (CONTEXT.md "Draft": a separate entity from a draft-status
 * FormInstance). The resume path applies best-effort fieldId migration against
 * the *current* template schema (ADR-0004): still-valid fields are kept, removed
 * fields move to `_orphaned`, and `version_mismatch` flags when anything moved.
 */

interface DraftRow {
  id: string;
  template_id: string;
  user_id: string;
  field_values: FormValues;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

function toDraft(row: Record<string, unknown>): DraftRow {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    user_id: row.user_id as string,
    field_values: (parseJsonb(row.field_values) ?? {}) as FormValues,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    expires_at: row.expires_at as Date,
  };
}

async function findDraft(id: string, userId: string): Promise<DraftRow> {
  const row = await getDb()("drafts").where({ id, user_id: userId }).first();
  if (!row) {
    throw new AppError("NOT_FOUND", "草稿不存在", 404);
  }
  return toDraft(row);
}

// ── GET /api/v1/drafts — my drafts ───────────────────────────────────────────
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const db = getDb();
    const page = clampInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(req.query.pageSize, 20, 1, 100);

    const base = db("drafts").where({ user_id: user.id });
    const countRows = (await base.clone().count("*")) as Array<{
      count: string | number;
    }>;
    const total = Number(countRows[0]?.count ?? 0);
    const rows = await base
      .orderBy("updated_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const templateIds = [...new Set(rows.map((r) => r.template_id))] as string[];
    const templates = templateIds.length
      ? await db("form_templates").whereIn("id", templateIds).select("id", "name")
      : [];
    const nameById = new Map(templates.map((t) => [t.id, t.name]));

    res.json({
      items: rows.map((r) => ({
        ...toDraft(r),
        template_name: nameById.get(r.template_id as string) ?? null,
      })),
      total,
      page,
      pageSize,
    });
  }),
);

// ── POST /api/v1/drafts — create a draft ─────────────────────────────────────
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const templateId = req.body?.template_id;

    if (typeof templateId !== "string" || templateId.trim() === "") {
      throw new AppError("VALIDATION_ERROR", "缺少 template_id", 422);
    }

    const template = await getDb()("form_templates")
      .where({ id: templateId.trim() })
      .first();
    if (!template) {
      throw new AppError("NOT_FOUND", "模板不存在", 404);
    }
    if (template.status !== "published") {
      throw new AppError("TEMPLATE_NOT_PUBLISHED", "模板未发布或已下线", 400);
    }

    const fieldValues = req.body.field_values ?? {};
    requireObject(fieldValues, "field_values");

    const db = getDb();
    const [created] = await db("drafts")
      .insert({
        template_id: template.id,
        user_id: user.id,
        field_values: fieldValues,
      })
      .returning("*");

    res.status(201).json(toDraft(created));
  }),
);

// ── GET /api/v1/drafts/:id — resume (with version-mismatch migration) ───────
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const draft = await findDraft(req.params.id, user.id);

    const template = await getDb()("form_templates")
      .where({ id: draft.template_id })
      .first();
    if (!template) {
      throw new AppError("NOT_FOUND", "模板不存在", 404);
    }

    const schema = parseSchema(parseJsonb(template.schema), template.approval_chain == null ? null : parseJsonb(template.approval_chain));
    const migration = migrateFieldValues(draft.field_values, schema);

    res.json({
      ...draft,
      field_values: migration.values,
      _orphaned: migration.orphaned,
      version_mismatch: migration.changed,
      template: {
        id: template.id,
        name: template.name,
        status: template.status,
        schema: parseJsonb(template.schema),
        approval_chain: template.approval_chain == null ? null : parseJsonb(template.approval_chain),
        updated_at: template.updated_at,
      },
    });
  }),
);

// ── PUT /api/v1/drafts/:id — update field values ────────────────────────────
router.put(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const draft = await findDraft(req.params.id, user.id);

    const fieldValues = req.body.field_values;
    requireObject(fieldValues, "field_values");

    const db = getDb();
    const [updated] = await db("drafts")
      .where({ id: draft.id })
      .update({ field_values: fieldValues, updated_at: db.fn.now() })
      .returning("*");

    res.json(toDraft(updated));
  }),
);

// ── DELETE /api/v1/drafts/:id — discard a draft ─────────────────────────────
router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const draft = await findDraft(req.params.id, user.id);

    await getDb()("drafts").where({ id: draft.id }).del();
    res.status(204).end();
  }),
);

export default router;
