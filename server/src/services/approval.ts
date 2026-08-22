import type { Knex } from "knex";
import {
  resolveApprover,
  type ParsedSchema,
  type User,
} from "form-engine-core";
import { AppError } from "../middleware/errorHandler";
import { createDbOrgDataSource } from "./orgDataSource";

export interface ResolvedApprover {
  nodeId: string;
  order: number;
  approverId: string;
  approverName: string;
}

/**
 * Resolve every node in a parsed schema's approval chain to a concrete user.
 *
 * Runs against the supplied knex instance (usually the submit transaction) so
 * approver resolution shares the submission's transaction boundary (ADR-0001).
 * A failure to resolve any node throws — the caller lets it propagate inside
 * the transaction so the whole submit rolls back. A disabled approver is a
 * clean business error (`APPROVER_DISABLED`, 409, ADR-0015 ③); genuine config
 * errors (missing user / empty role) stay `APPROVER_RESOLUTION_FAILED` (500).
 */
export async function resolveApprovalChain(
  schema: ParsedSchema,
  submitter: User,
  db: Knex | Knex.Transaction,
): Promise<ResolvedApprover[]> {
  const nodes = schema.approvalChain?.nodes ?? [];
  const org = createDbOrgDataSource(db);
  const resolved: ResolvedApprover[] = [];

  for (const node of nodes) {
    const result = await resolveApprover(node.approverRule, submitter, org);
    if (!result.approver) {
      if (result.errorCode === "APPROVER_DISABLED") {
        throw new AppError(
          "APPROVER_DISABLED",
          `审批节点 "${node.label ?? node.id}" 的审批人已停用：${result.reason ?? "该审批人不可用"}`,
          409,
        );
      }
      throw new AppError(
        "APPROVER_RESOLUTION_FAILED",
        `审批节点 "${node.label ?? node.id}" 审批人解析失败：${result.reason ?? "无法解析审批人"}`,
        500,
      );
    }
    resolved.push({
      nodeId: node.id,
      order: node.order,
      approverId: result.approver.id,
      approverName: result.approver.name,
    });
  }

  return resolved;
}
