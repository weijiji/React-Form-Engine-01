import { Router, Request, Response } from "express";
import type { Knex } from "knex";
import { getDb } from "../db/connection";
import { authenticate, requirePermission } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { asyncHandler } from "./helpers";
import {
  findInstance,
  toInstanceDetail,
} from "../services/instances";
import { requireIdempotencyKey, runWithIdempotency } from "../services/idempotency";
import {
  newApprovalRequest,
  notifyUsers,
  type ApprovalNotification,
} from "../services/notifications";

/**
 * Approval API (work order 06). Approvers pick up pending approval records from
 * `/pending`, review the full read-only form via `/approvals/:id`, then act:
 * approve / reject / return / transfer.
 *
 * Identity is the JWT user; a record is only actionable by the approver it is
 * assigned to. Every write requires an `Idempotency-Key` (ADR-0002) and an
 * `instanceVersion` optimistic lock (ADR-0003): the write transaction is
 * version-guarded, so a stale read or a concurrent action gets a clean 409.
 *
 * Records for every chain node are created at submit time (work order 05), so
 * acting on the current node never inserts — approve either advances to the next
 * pending node (`in_approval`) or, when none remains, completes the instance
 * (`approved`). `return`/`transfer` are legal from the first node (`submitted`)
 * too, matching the UI. Each committed action persists a notification after the
 * transaction (ADR-0001): the next approver on advance, the submitter on a
 * terminal outcome, the new approver on transfer.
 */

const router = Router();

router.use(authenticate);

interface ApprovalRecordRow {
  id: string;
  instance_id: string;
  node_id: string;
  node_order: number;
  approver_id: string | null;
  action: string;
  comment: string | null;
  transferred_from: string | null;
  created_at: Date;
  acted_at: Date | null;
}

function toApprovalRecord(r: Record<string, unknown>): ApprovalRecordRow {
  return {
    id: r.id as string,
    instance_id: r.instance_id as string,
    node_id: r.node_id as string,
    node_order: Number(r.node_order),
    approver_id: (r.approver_id as string | null) ?? null,
    action: r.action as string,
    comment: (r.comment as string | null) ?? null,
    transferred_from: (r.transferred_from as string | null) ?? null,
    created_at: r.created_at as Date,
    acted_at: (r.acted_at as Date | null) ?? null,
  };
}

/** Require the current user to be the assigned approver of the record. */
function requireAssigned(record: ApprovalRecordRow, userId: string): void {
  if (record.approver_id !== userId) {
    throw new AppError("FORBIDDEN", "该审批不归属当前用户", 403);
  }
}

/**
 * Validate the common preconditions for acting on a record, inside the write
 * transaction. Reads the latest committed rows, so a concurrent action that
 * already landed surfaces as a clean 409 rather than a version race.
 */
async function loadActionContext(
  trx: Knex.Transaction,
  recordId: string,
  userId: string,
): Promise<{ record: ApprovalRecordRow; instance: Record<string, unknown> }> {
  const rawRecord = await trx("approval_records").where({ id: recordId }).first();
  if (!rawRecord) {
    throw new AppError("NOT_FOUND", "审批记录不存在", 404);
  }
  const record = toApprovalRecord(rawRecord);
  requireAssigned(record, userId);
  if (record.action !== "pending") {
    throw new AppError("APPROVAL_NOT_PENDING", "该审批已被处理，请刷新", 409);
  }

  const instance = await trx("form_instances")
    .where({ id: record.instance_id })
    .first();
  if (!instance) {
    throw new AppError("NOT_FOUND", "表单实例不存在", 404);
  }
  // A draft-status instance can only still carry a pending record if it was
  // withdrawn after submit — the run was voided, so acting on it is a conflict,
  // surfaced with the submitter-facing message (work order 06: "该提交已被撤回").
  if (instance.status === "draft") {
    throw new AppError("INSTANCE_WITHDRAWN", "该提交已被撤回，无法审批", 409);
  }
  // Only the active node can be acted on (records for later nodes are also
  // pending at submit time; approving them out of order must not skip a node).
  if (record.node_order - 1 !== Number(instance.current_node_index)) {
    throw new AppError(
      "APPROVAL_NOT_PENDING",
      "当前审批节点不匹配，请刷新后重试",
      409,
    );
  }
  return { record, instance };
}

/** Parse + validate the optimistic-lock version from the action body. */
function requireInstanceVersion(body: unknown): number {
  const version = (body as { instanceVersion?: unknown } | undefined)
    ?.instanceVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new AppError("VALIDATION_ERROR", "缺少 instanceVersion（乐观锁版本）", 422);
  }
  return version;
}

/** Body `comment` as a string, or null when absent. */
function optionalComment(body: unknown): string | null {
  const comment = (body as { comment?: unknown } | undefined)?.comment;
  return typeof comment === "string" && comment.trim() !== "" ? comment.trim() : null;
}

/** Required non-empty comment (reject / return). */
function requireComment(body: unknown, label: string): string {
  const comment = (body as { comment?: unknown } | undefined)?.comment;
  if (typeof comment !== "string" || comment.trim() === "") {
    throw new AppError("VALIDATION_ERROR", `${label}必填`, 400);
  }
  return comment.trim();
}

/** Rebuild the read-only detail response after an action commits. */
async function buildDetail(instanceId: string, recordId: string) {
  const instance = await findInstance(instanceId);
  const detail = await toInstanceDetail(instance);
  const approval = detail.approval_records.find((r) => r.id === recordId);
  if (!approval) {
    throw new AppError("NOT_FOUND", "审批记录不存在", 404);
  }
  return { approval, instance: detail };
}

/** Version-guarded instance update (ADR-0003): 0 rows → 409 VERSION_CONFLICT. */
async function bumpVersion(
  trx: Knex.Transaction,
  instanceId: string,
  version: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const [updated] = await trx("form_instances")
    .where({ id: instanceId, version })
    .update({
      ...patch,
      updated_at: trx.fn.now(),
      version: trx.raw("version + 1"),
    })
    .returning("*");
  if (!updated) {
    throw new AppError("VERSION_CONFLICT", "该提交已被修改，请刷新后重试", 409);
  }
}

/** Notification for the submitter of a terminal outcome; empty when no submitter. */
function submitterNotification(
  instance: Record<string, unknown>,
  type: string,
  title: string,
  content: string,
): ApprovalNotification[] {
  const submitterId = instance.submitted_by as string | null;
  return submitterId ? [{ recipientId: submitterId, type, title, content }] : [];
}

/**
 * Shared envelope for the four approval writes (work order 06): idempotency key
 * (ADR-0002), `instanceVersion` optimistic lock (ADR-0003), and the record /
 * assignment / status guards — then the action-specific mutation, all in one
 * transaction. The mutation returns the notifications it wants persisted, which
 * are written *after* commit, best-effort (ADR-0001). A replayed Idempotency-Key
 * re-sends them — rare retry duplication, accepted for the MVP.
 */
async function runApprovalMutation(
  req: Request,
  userId: string,
  actionLabel: string,
  mutate: (
    trx: Knex.Transaction,
    record: ApprovalRecordRow,
    instance: Record<string, unknown>,
    version: number,
  ) => Promise<ApprovalNotification[]>,
): Promise<{ instanceId: string; recordId: string }> {
  const idemKey = requireIdempotencyKey(req);
  const version = requireInstanceVersion(req.body);
  const db = getDb();
  const { instanceId, recordId, notify } = await db.transaction(async (trx) =>
    runWithIdempotency(trx, userId, idemKey, async () => {
      const { record, instance } = await loadActionContext(trx, req.params.id, userId);
      const status = instance.status as string;
      if (status !== "submitted" && status !== "in_approval") {
        throw new AppError(
          "APPROVAL_NOT_PENDING",
          `状态 "${status}" 不允许${actionLabel}`,
          409,
        );
      }
      const notify = await mutate(trx, record, instance, version);
      return { instanceId: record.instance_id, recordId: record.id, notify };
    }),
  );
  void notifyUsers(instanceId, notify);
  return { instanceId, recordId };
}

// ── GET /api/v1/approvals/options — transfer targets ────────────────────────
// Users a pending node can be transferred to: active users who actually hold
// `approval:approve`, excluding the caller (transferring to yourself is a 400).
// The approver UI's 转交 picker reads this.
router.get(
  "/options",
  requirePermission("approval:transfer"),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const users = await db("users as u")
      .distinct("u.id", "u.name")
      .join("users_roles as ur", "ur.user_id", "u.id")
      .join("roles_permissions as rp", "rp.role_id", "ur.role_id")
      .join("permissions as p", "p.id", "rp.permission_id")
      .where({ "u.is_active": true, "p.code": "approval:approve" })
      .whereNot("u.id", req.auth!.id)
      .orderBy("u.name", "asc");
    res.json({ users });
  }),
);

// ── GET /api/v1/approvals/pending — my pending approvals ────────────────────
router.get(
  "/pending",
  requirePermission("approval:view_pending"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const db = getDb();

    const rows = await db("approval_records as ar")
      .join("form_instances as fi", "ar.instance_id", "fi.id")
      .where({ "ar.approver_id": user.id, "ar.action": "pending" })
      .whereIn("fi.status", ["submitted", "in_approval"])
      .orderBy("fi.updated_at", "desc")
      .select(
        "ar.id",
        "ar.instance_id",
        "ar.node_id",
        "ar.node_order",
        "ar.approver_id",
        "ar.action",
        "ar.comment",
        "ar.transferred_from",
        "ar.created_at as ar_created_at",
        "ar.acted_at as ar_acted_at",
        "fi.template_id",
        "fi.status as instance_status",
        "fi.current_node_index",
        "fi.submitted_by",
        "fi.submitted_at",
        "fi.updated_at as instance_updated_at",
      );

    const templateIds = [...new Set(rows.map((r) => r.template_id as string))];
    const templates = templateIds.length
      ? await db("form_templates").whereIn("id", templateIds).select("id", "name")
      : [];
    const nameById = new Map(templates.map((t) => [t.id, t.name]));

    const submitterIds = [
      ...new Set(rows.map((r) => r.submitted_by).filter(Boolean)),
    ] as string[];
    const submitters = submitterIds.length
      ? await db("users").whereIn("id", submitterIds).select("id", "name")
      : [];
    const submitterNameById = new Map(submitters.map((u) => [u.id, u.name]));

    const items = rows.map((r) => ({
      approval: {
        id: r.id,
        node_id: r.node_id,
        node_order: Number(r.node_order),
        approver_id: r.approver_id,
        approver_name: user.name,
        action: r.action,
        comment: r.comment,
        transferred_from: r.transferred_from,
        acted_at: r.ar_acted_at,
      },
      instance: {
        id: r.instance_id,
        template_id: r.template_id,
        status: r.instance_status,
        current_node_index: Number(r.current_node_index),
        submitted_by: r.submitted_by,
        submitted_at: r.submitted_at,
        updated_at: r.instance_updated_at,
      },
      template_name: nameById.get(r.template_id as string) ?? null,
      submitter_name:
        r.submitted_by == null
          ? null
          : (submitterNameById.get(r.submitted_by as string) ?? null),
    }));

    res.json({ items, total: items.length });
  }),
);

// ── GET /api/v1/approvals/:id — read-only review detail ─────────────────────
router.get(
  "/:id",
  requirePermission("approval:view_pending"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const row = await getDb()("approval_records").where({ id: req.params.id }).first();
    if (!row) {
      throw new AppError("NOT_FOUND", "审批记录不存在", 404);
    }
    const record = toApprovalRecord(row);
    requireAssigned(record, user.id);
    res.json(await buildDetail(record.instance_id, record.id));
  }),
);

// ── POST /api/v1/approvals/:id/approve ──────────────────────────────────────
router.post(
  "/:id/approve",
  requirePermission("approval:approve"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const comment = optionalComment(req.body);
    const { instanceId, recordId } = await runApprovalMutation(
      req,
      user.id,
      "审批",
      async (trx, record, instance, version) => {
        const next = await trx("approval_records")
          .where({ instance_id: record.instance_id, action: "pending" })
          .where("node_order", ">", record.node_order)
          .orderBy("node_order", "asc")
          .first();

        await bumpVersion(trx, record.instance_id, version, {
          status: next ? "in_approval" : "approved",
          current_node_index: next ? Number(next.node_order) - 1 : record.node_order - 1,
        });
        await trx("approval_records")
          .where({ id: record.id })
          .update({ action: "approved", comment, acted_at: trx.fn.now() });

        // Advance → the next approver picks it up; final → the submitter learns.
        return next
          ? [newApprovalRequest(next.approver_id as string)]
          : submitterNotification(instance, "instance_approved", "审批通过", "您的提交已通过审批");
      },
    );
    res.json(await buildDetail(instanceId, recordId));
  }),
);

// ── POST /api/v1/approvals/:id/reject ───────────────────────────────────────
router.post(
  "/:id/reject",
  requirePermission("approval:reject"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const comment = requireComment(req.body, "拒绝原因");
    const { instanceId, recordId } = await runApprovalMutation(
      req,
      user.id,
      "拒绝",
      async (trx, record, instance, version) => {
        await bumpVersion(trx, record.instance_id, version, { status: "rejected" });
        await trx("approval_records")
          .where({ id: record.id })
          .update({ action: "rejected", comment, acted_at: trx.fn.now() });
        return submitterNotification(instance, "instance_rejected", "审批被拒绝", "您的提交被拒绝，请查看原因");
      },
    );
    res.json(await buildDetail(instanceId, recordId));
  }),
);

// ── POST /api/v1/approvals/:id/return ───────────────────────────────────────
router.post(
  "/:id/return",
  requirePermission("approval:return"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const comment = requireComment(req.body, "退回原因");
    const { instanceId, recordId } = await runApprovalMutation(
      req,
      user.id,
      "退回",
      async (trx, record, instance, version) => {
        await bumpVersion(trx, record.instance_id, version, {
          status: "returned",
          current_node_index: 0,
        });
        await trx("approval_records")
          .where({ id: record.id })
          .update({ action: "returned", comment, acted_at: trx.fn.now() });
        return submitterNotification(instance, "instance_returned", "审批被退回", "您的提交被退回，请修改后重新提交");
      },
    );
    res.json(await buildDetail(instanceId, recordId));
  }),
);

// ── POST /api/v1/approvals/:id/transfer ─────────────────────────────────────
router.post(
  "/:id/transfer",
  requirePermission("approval:transfer"),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!;
    const comment = optionalComment(req.body);
    const targetUserId = (req.body as { targetUserId?: unknown } | undefined)
      ?.targetUserId;
    if (typeof targetUserId !== "string" || targetUserId.trim() === "") {
      throw new AppError("VALIDATION_ERROR", "缺少 targetUserId", 422);
    }

    const { instanceId, recordId } = await runApprovalMutation(
      req,
      user.id,
      "转交",
      async (trx, record, _instance, version) => {
        if (targetUserId === user.id) {
          throw new AppError("VALIDATION_ERROR", "不能转交给当前审批人", 400);
        }
        const target = await trx("users").where({ id: targetUserId }).first();
        if (!target || target.is_active !== true) {
          throw new AppError("VALIDATION_ERROR", "目标审批人不存在或已停用", 400);
        }

        await bumpVersion(trx, record.instance_id, version, {});
        await trx("approval_records")
          .where({ id: record.id })
          .update({
            approver_id: targetUserId,
            transferred_from: record.approver_id,
            comment,
            acted_at: trx.fn.now(),
          });

        return [
          {
            recipientId: targetUserId,
            type: "instance_transferred",
            title: "审批已转交",
            content: "您有一条待审批的表单提交",
          },
        ];
      },
    );
    res.json(await buildDetail(instanceId, recordId));
  }),
);

export default router;
