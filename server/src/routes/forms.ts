import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { asyncHandler, clampInt, parseJsonb } from "./helpers";

const router = Router();

/**
 * Form Center API (work order 05). `GET /api/v1/forms` lists the forms a filler
 * can start — only *published* templates (CONTEXT.md "FormTemplate": a template
 * must be published before users can fill it). Supports category + search
 * filters and offset pagination, mirroring the templates list endpoint.
 */

interface FormRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  schema: unknown;
  approval_chain: unknown;
  updated_at: Date;
}

function toForm(row: Record<string, unknown>): FormRow {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    schema: parseJsonb(row.schema),
    approval_chain: row.approval_chain == null ? null : parseJsonb(row.approval_chain),
    updated_at: row.updated_at as Date,
  };
}

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { category, search } = req.query as Record<string, unknown>;
    const page = clampInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(req.query.pageSize, 20, 1, 100);

    const base = db("form_templates").where({ status: "published" });
    if (typeof category === "string" && category !== "") {
      base.where({ category });
    }
    if (typeof search === "string" && search.trim() !== "") {
      base.whereILike("name", `%${search.trim()}%`);
    }

    const countRows = (await base.clone().count("*")) as Array<{
      count: string | number;
    }>;
    const total = Number(countRows[0]?.count ?? 0);
    const rows = await base
      .orderBy("updated_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items: rows.map(toForm), total, page, pageSize });
  }),
);

export default router;
