import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { resolveCurrentUser } from "../middleware/currentUser";
import { AppError } from "../middleware/errorHandler";
import {
  parseSchema,
  validateAll,
  type FormValues,
} from "form-engine-core";
import { asyncHandler, clampInt, parseJsonb, parseStatusList, requireObject } from "./helpers";
import { resolveApprovalChain } from "../services/approval";
import { createDbOrgDataSource } from "../services/orgDataSource";
import { notifyApprovers } from "../services/notifications";

const router = Router();

/**
 * Form Instance API (work order 05). An instance is the runtime record of a
 * form being filled (status `draft`) and then submitted. Submission is atomic
 * (ADR-0001): the instance UPDATE (status + frozen `template_snapshot`) and the
 * approval-record INSERTs happen in one transaction; approver resolution runs
 * inside that transaction and a failure rolls the whole submit back (500). The
 * notification persist + SSE push are async, after commit (ADR-0001; SSE lands
 * with work order 07).
 */

interface InstanceRow {
  id: string;
  template_id: string;
  template_snapshot: unknown;
  field_values: FormValues;
  status: string;
  current_node_index: number;
  version: number;
  submitted_by: string | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface TemplateRow {
  id: string;
  name: string;
  status: string;
  schema: unknown;
  approval_chain: unknown;
  updated_at: Date;
}

function toInstance(row: Record<string, unknown>): InstanceRow {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    template_snapshot: parseJsonb(row.template_snapshot),
    field_values: (parseJsonb(row.field_values) ?? {}) as FormValues,
    status: row.status as string,
    current_node_index: Number(row.current_node_index),
    version: Number(row.version),
    submitted_by: (row.submitted_by as string | null) ?? null,
    submitted_at: (row.submitted_at as Date | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

async function findInstance(id: string): Promise<InstanceRow> {
  const row = await getDb()("form_instances").where({ id }).first();
  if (!row) {
    throw new AppError("NOT_FOUND", "表单实例不存在", 404);
  }
  return toInstance(row);
}

async function findTemplateRow(id: string): Promise<TemplateRow> {
  const row = await getDb()("form_templates").where({ id }).first();
  if (!row) {
    throw new AppError("NOT_FOUND", "模板不存在", 404);
  }
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as string,
    schema: parseJsonb(row.schema),
    approval_chain: row.approval_chain == null ? null : parseJsonb(row.approval_chain),
    updated_at: row.updated_at as Date,
  };
}

/** Load the approval records for an instance, resolving approver display names. */
async function loadApprovalRecords(instanceId: string) {
  const db = getDb();
  const records = await db("approval_records")
    .where({ instance_id: instanceId })
    .orderBy("node_order", "asc");
  const approverIds = [
    ...new Set(records.map((r) => r.approver_id).filter(Boolean)),
  ] as string[];
  const approvers = approverIds.length
    ? await db("users").whereIn("id", approverIds).select("id", "name")
    : [];
  const nameById = new Map(approvers.map((u) => [u.id, u.name]));

  return records.map((r) => ({
    id: r.id,
    node_id: r.node_id,
    node_order: Number(r.node_order),
    approver_id: (r.approver_id as string | null) ?? null,
    approver_name: r.approver_id ? nameById.get(r.approver_id as string) ?? null : null,
    action: r.action,
    comment: (r.comment as string | null) ?? null,
    acted_at: (r.acted_at as Date | null) ?? null,
  }));
}

async function toInstanceDetail(instance: InstanceRow) {
  const template = await findTemplateRow(instance.template_id);
  const approval_records = await loadApprovalRecords(instance.id);
  return {
    ...instance,
    approval_records,
    template: {
      id: template.id,
      name: template.name,
      status: template.status,
      schema: template.schema,
      approval_chain: template.approval_chain,
      updated_at: template.updated_at,
    },
  };
}

function requireOwner(instance: InstanceRow, userId: string): void {
  if (instance.submitted_by !== userId) {
    throw new AppError("FORBIDDEN", "只能操作自己的表单实例", 403);
  }
}

// ── GET /api/v1/instances/my — my instances (drafts + submissions) ─────────
// Registered before `/:id` so the literal `my` segment is not captured as an id.
router.get(
  "/my",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const db = getDb();
    const statuses = parseStatusList(req.query.status);
    const page = clampInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(req.query.pageSize, 20, 1, 100);

    const base = db("form_instances").where({ submitted_by: user.id });
    if (statuses.length > 0) {
      base.whereIn("status", statuses);
    }

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
        ...toInstance(r),
        template_name: nameById.get(r.template_id as string) ?? null,
      })),
      total,
      page,
      pageSize,
    });
  }),
);

// ── POST /api/v1/instances — create a draft instance ────────────────────────
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const templateId = req.body?.template_id;

    if (typeof templateId !== "string" || templateId.trim() === "") {
      throw new AppError("VALIDATION_ERROR", "缺少 template_id", 422);
    }

    const template = await findTemplateRow(templateId.trim());
    if (template.status !== "published") {
      throw new AppError("TEMPLATE_NOT_PUBLISHED", "模板未发布或已下线", 400);
    }

    const db = getDb();
    const [created] = await db("form_instances")
      .insert({
        template_id: template.id,
        template_snapshot: {},
        field_values: req.body.field_values ?? {},
        status: "draft",
        submitted_by: user.id,
      })
      .returning("*");

    res.status(201).json(await toInstanceDetail(toInstance(created)));
  }),
);

// ── GET /api/v1/instances/:id — detail (snapshot + approval progress) ──────
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const instance = await findInstance(req.params.id);
    res.json(await toInstanceDetail(instance));
  }),
);

// ── PUT /api/v1/instances/:id/values — autosave field values ───────────────
router.put(
  "/:id/values",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const instance = await findInstance(req.params.id);
    requireOwner(instance, user.id);

    if (instance.status !== "draft") {
      throw new AppError(
        "VALIDATION_ERROR",
        `状态 "${instance.status}" 不允许保存`,
        400,
      );
    }

    const fieldValues = req.body?.field_values;
    requireObject(fieldValues, "field_values");

    // Autosave does not bump `version` (that lock guards submit/withdraw races,
    // not frequent saves); it only advances updated_at so draft staleness checks
    // stay meaningful.
    const db = getDb();
    const [updated] = await db("form_instances")
      .where({ id: instance.id })
      .update({ field_values: fieldValues, updated_at: db.fn.now() })
      .returning("*");

    res.json(toInstance(updated));
  }),
);

// ── POST /api/v1/instances/:id/submit — validate + atomic submit ────────────
router.post(
  "/:id/submit",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const instance = await findInstance(req.params.id);
    requireOwner(instance, user.id);

    if (instance.status !== "draft" && instance.status !== "withdrawn") {
      throw new AppError(
        "VERSION_CONFLICT",
        `状态 "${instance.status}" 已提交，请勿重复提交`,
        409,
      );
    }

    const template = await findTemplateRow(instance.template_id);
    if (template.status !== "published") {
      throw new AppError("TEMPLATE_NOT_PUBLISHED", "模板未发布或已下线", 400);
    }

    // The submit body may carry the final values; otherwise use what autosave
    // stored. Full validation runs against these values (the client cannot be
    // trusted, and a template may have changed since the instance was created).
    const values: FormValues =
      (req.body?.field_values as FormValues | undefined) ??
      instance.field_values;

    const parsedSchema = parseSchema(template.schema, template.approval_chain);
    const errors = validateAll(parsedSchema, values);
    if (Object.keys(errors).length > 0) {
      throw new AppError("VALIDATION_ERROR", "字段值校验失败，请修正后再提交", 422, {
        errors,
      });
    }

    const submitter = await createDbOrgDataSource().getUser(user.id);
    if (!submitter) {
      throw new AppError("NOT_FOUND", "用户不存在", 404);
    }

    const db = getDb();
    const approvers = await db.transaction(async (trx) => {
      // In-transaction resolution (ADR-0001) — a failure rolls back everything.
      const resolved = await resolveApprovalChain(parsedSchema, submitter, trx);
      // A well-formed chain always has ≥1 node; this branch is reachable only
      // for a template with no `approval_chain`, which needs no approval and so
      // submits straight to `approved`.
      const nextStatus = resolved.length === 0 ? "approved" : "submitted";

      const snapshot = {
        schema: template.schema,
        approval_chain: template.approval_chain,
      };

      const [updated] = await trx("form_instances")
        .where({ id: instance.id })
        .whereIn("status", ["draft", "withdrawn"])
        .update({
          template_snapshot: snapshot,
          field_values: values,
          status: nextStatus,
          current_node_index: 0,
          submitted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
          version: trx.raw("version + 1"),
        })
        .returning("*");

      if (!updated) {
        throw new AppError("VERSION_CONFLICT", "该实例已提交，请勿重复提交", 409);
      }

      // Replace any stale pending records (resubmission after withdrawal).
      await trx("approval_records")
        .where({ instance_id: instance.id })
        .where({ action: "pending" })
        .del();
      for (const approver of resolved) {
        await trx("approval_records").insert({
          instance_id: instance.id,
          node_id: approver.nodeId,
          node_order: approver.order,
          approver_id: approver.approverId,
          action: "pending",
        });
      }

      return resolved;
    });

    // Post-commit, best-effort (ADR-0001). SSE push lands with work order 07.
    void notifyApprovers(instance.id, approvers.map((a) => a.approverId));

    const refreshed = await findInstance(instance.id);
    res.json(await toInstanceDetail(refreshed));
  }),
);

// ── POST /api/v1/instances/:id/withdraw — revert to draft (optimistic lock) ─
router.post(
  "/:id/withdraw",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const instance = await findInstance(req.params.id);
    requireOwner(instance, user.id);

    if (instance.status !== "submitted" && instance.status !== "in_approval") {
      throw new AppError(
        "VALIDATION_ERROR",
        `状态 "${instance.status}" 不允许撤回`,
        400,
      );
    }

    const db = getDb();
    const acted = await db("approval_records")
      .where({ instance_id: instance.id })
      .whereIn("action", ["approved", "rejected", "returned", "transferred"])
      .first();
    if (acted) {
      throw new AppError("APPROVAL_NOT_PENDING", "审批人已处理，无法撤回", 400);
    }

    const expectedVersion = req.body?.version;
    if (
      typeof expectedVersion !== "number" ||
      !Number.isInteger(expectedVersion)
    ) {
      throw new AppError("VALIDATION_ERROR", "缺少 version（乐观锁版本）", 422);
    }
    const [updated] = await db("form_instances")
      .where({ id: instance.id, version: expectedVersion })
      .update({
        status: "draft",
        current_node_index: 0,
        submitted_at: null,
        updated_at: db.fn.now(),
        version: db.raw("version + 1"),
      })
      .returning("*");

    if (!updated) {
      throw new AppError("VERSION_CONFLICT", "该提交已被修改，请刷新后重试", 409);
    }

    // Drop the now-stale pending records so a resubmit starts clean.
    await db("approval_records")
      .where({ instance_id: instance.id })
      .where({ action: "pending" })
      .del();

    res.json(await toInstanceDetail(toInstance(updated)));
  }),
);

export default router;
