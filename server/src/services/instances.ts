import { getDb } from "../db/connection";
import { AppError } from "../middleware/errorHandler";
import { parseJsonb } from "../routes/helpers";
import type { FormValues } from "form-engine-core";

/**
 * Shared FormInstance data access — used by the instance routes (work order 05)
 * and the approval routes (work order 06) so both read an instance's detail the
 * same way. An instance is a draft or a submitted/running approval flow; the
 * detail embeds the frozen `template_snapshot`, the resolved `approval_records`,
 * and the live template for display.
 */

export interface InstanceRow {
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

export interface TemplateRow {
  id: string;
  name: string;
  status: string;
  schema: unknown;
  approval_chain: unknown;
  updated_at: Date;
}

export function toInstance(row: Record<string, unknown>): InstanceRow {
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

export async function findInstance(id: string): Promise<InstanceRow> {
  const row = await getDb()("form_instances").where({ id }).first();
  if (!row) {
    throw new AppError("NOT_FOUND", "表单实例不存在", 404);
  }
  return toInstance(row);
}

export async function findTemplateRow(id: string): Promise<TemplateRow> {
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
export async function loadApprovalRecords(instanceId: string) {
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
    transferred_from: (r.transferred_from as string | null) ?? null,
    acted_at: (r.acted_at as Date | null) ?? null,
  }));
}

export async function toInstanceDetail(instance: InstanceRow) {
  const template = await findTemplateRow(instance.template_id);
  // A draft (never submitted, or withdrawn back to draft) has no execution
  // history: its chain timeline renders from the live template, not stale
  // records from a run that was voided by the withdrawal. `submitted_at` is the
  // marker — submit/return keep it, withdraw clears it.
  const approval_records =
    instance.submitted_at == null ? [] : await loadApprovalRecords(instance.id);
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

export function requireOwner(instance: InstanceRow, userId: string): void {
  if (instance.submitted_by !== userId) {
    throw new AppError("FORBIDDEN", "只能操作自己的表单实例", 403);
  }
}
