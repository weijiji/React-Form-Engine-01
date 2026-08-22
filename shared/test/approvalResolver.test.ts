import { describe, expect, it } from "vitest";
import { resolveApprover } from "../src/approvalResolver";
import type { OrgDataSource, User } from "../src/types";

function user(overrides: Partial<User> = {}): User {
  return { id: "u1", name: "张三", ...overrides };
}

function org(overrides: Partial<OrgDataSource> = {}): OrgDataSource {
  return {
    getUser: async () => null,
    searchUsers: async () => [],
    getUserManager: async () => null,
    getUsersByDepartment: async () => [],
    getUsersByRole: async () => [],
    ...overrides,
  };
}

const submitter: User = user({ id: "sub-1", name: "提交人", departmentId: "dept-1", managerId: "mgr-1" });

describe("ApprovalResolver", () => {
  describe("org_structure / direct_manager", () => {
    it("resolves the submitter's direct manager", async () => {
      const manager = user({ id: "mgr-1", name: "直属上级" });
      const res = await resolveApprover(
        { type: "org_structure", relation: "direct_manager" },
        submitter,
        org({ getUserManager: async () => manager }),
      );
      expect(res).toEqual({ approver: manager, reason: null });
    });

    it("fails when there is no manager", async () => {
      const res = await resolveApprover(
        { type: "org_structure", relation: "direct_manager" },
        submitter,
        org({ getUserManager: async () => null }),
      );
      expect(res.approver).toBeNull();
      expect(res.reason).toContain("直属上级");
    });
  });

  describe("org_structure / department_manager", () => {
    it("resolves the department head, preferring an active user", async () => {
      const inactive = user({ id: "d1", name: "负责人", isActive: false });
      const active = user({ id: "d2", name: "代理负责人", isActive: true });
      const res = await resolveApprover(
        { type: "org_structure", relation: "department_manager" },
        submitter,
        org({ getUsersByDepartment: async () => [inactive, active] }),
      );
      expect(res.approver).toBe(active);
    });

    it("fails when the submitter has no department", async () => {
      const noDept = user({ id: "sub-2", name: "无部门" });
      const res = await resolveApprover(
        { type: "org_structure", relation: "department_manager" },
        noDept,
        org(),
      );
      expect(res.approver).toBeNull();
      expect(res.reason).toContain("部门");
    });

    it("fails when the department has no users", async () => {
      const res = await resolveApprover(
        { type: "org_structure", relation: "department_manager" },
        submitter,
        org({ getUsersByDepartment: async () => [] }),
      );
      expect(res.approver).toBeNull();
      expect(res.reason).toContain("部门");
    });
  });

  describe("role", () => {
    it("resolves the first active user in the role", async () => {
      const inactive = user({ id: "r1", name: "a", isActive: false });
      const active = user({ id: "r2", name: "b", isActive: true });
      const res = await resolveApprover(
        { type: "role", roleId: "role-it" },
        submitter,
        org({ getUsersByRole: async () => [inactive, active] }),
      );
      expect(res.approver).toBe(active);
    });

    it("falls back to the first user when none is active", async () => {
      const first = user({ id: "r1", name: "a" });
      const second = user({ id: "r2", name: "b" });
      const res = await resolveApprover(
        { type: "role", roleId: "role-it" },
        submitter,
        org({ getUsersByRole: async () => [first, second] }),
      );
      expect(res.approver).toBe(first);
    });

    it("fails when the role has no users", async () => {
      const res = await resolveApprover(
        { type: "role", roleId: "role-empty" },
        submitter,
        org({ getUsersByRole: async () => [] }),
      );
      expect(res.approver).toBeNull();
      expect(res.reason).toContain("role-empty");
    });
  });

  describe("specific", () => {
    it("resolves the named user", async () => {
      const target = user({ id: "target-1", name: "指定人" });
      const res = await resolveApprover(
        { type: "specific", userId: "target-1" },
        submitter,
        org({ getUser: async (id) => (id === "target-1" ? target : null) }),
      );
      expect(res).toEqual({ approver: target, reason: null });
    });

    it("fails when the named user does not exist", async () => {
      const res = await resolveApprover(
        { type: "specific", userId: "missing" },
        submitter,
        org({ getUser: async () => null }),
      );
      expect(res.approver).toBeNull();
      expect(res.reason).toContain("missing");
    });
  });

  describe("disabled approvers (ADR-0015 ③)", () => {
    it("rejects a disabled specific approver (APPROVER_DISABLED)", async () => {
      const disabled = user({ id: "target-1", name: "已停用人", isActive: false });
      const res = await resolveApprover(
        { type: "specific", userId: "target-1" },
        submitter,
        org({ getUser: async (id) => (id === "target-1" ? disabled : null) }),
      );
      expect(res.approver).toBeNull();
      expect(res.errorCode).toBe("APPROVER_DISABLED");
      expect(res.reason).toContain("已停用");
    });

    it("rejects a disabled direct manager (APPROVER_DISABLED)", async () => {
      const manager = user({ id: "mgr-1", name: "直属上级", isActive: false });
      const res = await resolveApprover(
        { type: "org_structure", relation: "direct_manager" },
        submitter,
        org({ getUserManager: async () => manager }),
      );
      expect(res.approver).toBeNull();
      expect(res.errorCode).toBe("APPROVER_DISABLED");
      expect(res.reason).toContain("已停用");
    });

    it("does not flag APPROVER_DISABLED when a specific user is missing (config error)", async () => {
      const res = await resolveApprover(
        { type: "specific", userId: "missing" },
        submitter,
        org({ getUser: async () => null }),
      );
      expect(res.approver).toBeNull();
      expect(res.errorCode).toBeUndefined();
    });

    it("rejects a role whose every member is disabled — no fallback to a disabled user", async () => {
      const res = await resolveApprover(
        { type: "role", roleId: "role-it" },
        submitter,
        org({
          getUsersByRole: async () => [
            user({ id: "r1", isActive: false }),
            user({ id: "r2", isActive: false }),
          ],
        }),
      );
      expect(res.approver).toBeNull();
      expect(res.errorCode).toBe("APPROVER_DISABLED");
      expect(res.reason).toContain("无启用用户");
    });

    it("does not flag APPROVER_DISABLED when a role is empty (config error)", async () => {
      const res = await resolveApprover(
        { type: "role", roleId: "role-empty" },
        submitter,
        org({ getUsersByRole: async () => [] }),
      );
      expect(res.approver).toBeNull();
      expect(res.errorCode).toBeUndefined();
    });

    it("rejects a department whose every member is disabled", async () => {
      const res = await resolveApprover(
        { type: "org_structure", relation: "department_manager" },
        submitter,
        org({ getUsersByDepartment: async () => [user({ isActive: false })] }),
      );
      expect(res.approver).toBeNull();
      expect(res.errorCode).toBe("APPROVER_DISABLED");
    });

    it("does not flag APPROVER_DISABLED when a department is empty (config error)", async () => {
      const res = await resolveApprover(
        { type: "org_structure", relation: "department_manager" },
        submitter,
        org({ getUsersByDepartment: async () => [] }),
      );
      expect(res.approver).toBeNull();
      expect(res.errorCode).toBeUndefined();
    });
  });

  it("never throws — an org data-source error becomes a null approver + reason", async () => {
    const res = await resolveApprover(
      { type: "role", roleId: "role-it" },
      submitter,
      org({
        getUsersByRole: async () => {
          throw new Error("org down");
        },
      }),
    );
    expect(res.approver).toBeNull();
    expect(res.reason).toContain("org down");
  });
});
