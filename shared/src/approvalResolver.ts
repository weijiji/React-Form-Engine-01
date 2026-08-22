/**
 * ApprovalResolver — resolves an approval node's approver from an approver rule.
 *
 * Three rule types:
 *  - `org_structure`  direct_manager (直属上级) via `getUserManager`,
 *                     department_manager (部门负责人) via `getUsersByDepartment`
 *                     (MVP simplification: first active user in the department).
 *  - `role`           first active user in the role via `getUsersByRole`.
 *  - `specific`       a specifically named user via `getUser` (existence checked).
 *
 * A disabled (`isActive === false`) user must never resolve as an approver
 * (ADR-0015 ③): `specific` / `direct_manager` reject the disabled user, and
 * `role` / `department_manager` never fall back to a disabled member. Those
 * disabled-failures are marked `errorCode: "APPROVER_DISABLED"` so callers can
 * surface a clean business error instead of a 500.
 *
 * Resolution failures return `{ approver: null, reason }` — the reason is surfaced
 * to callers (transaction rollback + admin alert in the submission flow).
 */

import type { ApproverRule, OrgDataSource, User } from "./types";

export interface ResolveApproverResult {
  approver: User | null;
  reason: string | null;
  /** Set when resolution fails because the approver is disabled (ADR-0015 ③). */
  errorCode?: "APPROVER_DISABLED";
}

function pickActive(users: User[]): User | null {
  return users.find((u) => u.isActive !== false) ?? null;
}

/**
 * Resolve an approver from a role/department's members. An empty member list is
 * a config error (no `errorCode`); members that are all disabled are a
 * disabled-approver failure (ADR-0015 ③). No fallback to a disabled member.
 */
function resolveFromActiveMember(
  users: User[],
  emptyReason: string,
  allDisabledReason: string,
): ResolveApproverResult {
  const approver = pickActive(users);
  if (approver) return { approver, reason: null };
  if (users.length === 0) return { approver: null, reason: emptyReason };
  return { approver: null, reason: allDisabledReason, errorCode: "APPROVER_DISABLED" };
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
        return resolveFromActiveMember(
          users,
          `角色 "${rule.roleId}" 下无可用用户`,
          `角色 "${rule.roleId}" 下无启用用户（成员均已停用）`,
        );
      }

      case "specific": {
        const user = await org.getUser(rule.userId);
        if (user && user.isActive === false) {
          return {
            approver: null,
            reason: `指定审批人 "${user.name}" 已停用`,
            errorCode: "APPROVER_DISABLED",
          };
        }
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
    if (manager && manager.isActive === false) {
      return {
        approver: null,
        reason: `直属上级 "${manager.name}" 已停用`,
        errorCode: "APPROVER_DISABLED",
      };
    }
    if (manager) return { approver: manager, reason: null };
    return { approver: null, reason: "无法解析直属上级" };
  }

  // department_manager
  if (!submitter.departmentId) {
    return { approver: null, reason: "提交人无部门信息，无法解析部门负责人" };
  }
  const users = await org.getUsersByDepartment(submitter.departmentId);
  return resolveFromActiveMember(users, "部门下无可用用户", "部门下无启用用户（成员均已停用）");
}
