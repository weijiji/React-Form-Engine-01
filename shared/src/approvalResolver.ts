/**
 * ApprovalResolver — resolves an approval node's approver from an approver rule.
 *
 * Three rule types:
 *  - `org_structure`  direct_manager (直属上级) via `getUserManager`,
 *                     department_manager (部门负责人) via `getUsersByDepartment`
 *                     (MVP simplification: first user in the department).
 *  - `role`           first (active) user in the role via `getUsersByRole`.
 *  - `specific`       a specifically named user via `getUser` (existence checked).
 *
 * Resolution failures return `{ approver: null, reason }` — the reason is surfaced
 * to callers (transaction rollback + admin alert in the submission flow).
 */

import type { ApproverRule, OrgDataSource, User } from "./types";

export interface ResolveApproverResult {
  approver: User | null;
  reason: string | null;
}

function preferActive(users: User[]): User | null {
  return users.find((u) => u.isActive !== false) ?? users[0] ?? null;
}

/**
 * Resolve an approver for a rule. Never throws — failures are returned as a
 * null approver plus a reason.
 */
export async function resolveApprover(
  rule: ApproverRule,
  submitter: User,
  org: OrgDataSource,
): Promise<ResolveApproverResult> {
  try {
    switch (rule.type) {
      case "org_structure":
        return resolveOrgStructure(rule.relation, submitter, org);

      case "role": {
        const users = await org.getUsersByRole(rule.roleId);
        const approver = preferActive(users);
        if (approver) return { approver, reason: null };
        return { approver: null, reason: `角色 "${rule.roleId}" 下无可用用户` };
      }

      case "specific": {
        const user = await org.getUser(rule.userId);
        if (user) return { approver: user, reason: null };
        return { approver: null, reason: `指定审批人 "${rule.userId}" 不存在` };
      }

      default:
        return { approver: null, reason: "未知的审批规则类型" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { approver: null, reason: `审批人解析失败：${message}` };
  }
}

async function resolveOrgStructure(
  relation: "direct_manager" | "department_manager",
  submitter: User,
  org: OrgDataSource,
): Promise<ResolveApproverResult> {
  if (relation === "direct_manager") {
    const manager = await org.getUserManager(submitter.id);
    if (manager) return { approver: manager, reason: null };
    return { approver: null, reason: "无法解析直属上级" };
  }

  // department_manager
  if (!submitter.departmentId) {
    return { approver: null, reason: "提交人无部门信息，无法解析部门负责人" };
  }
  const users = await org.getUsersByDepartment(submitter.departmentId);
  const approver = preferActive(users);
  if (approver) return { approver, reason: null };
  return { approver: null, reason: "部门下无可用用户" };
}
