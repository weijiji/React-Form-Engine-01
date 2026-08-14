import { describe, expect, it } from "vitest";
import { hasAnyRole, portalsForRoles, primaryPortal } from "./roles";

describe("role ↔ portal mapping (work order 17)", () => {
  it("maps each fixed role to its portal", () => {
    expect(primaryPortal(["设计者"])).toBe("/designer");
    expect(primaryPortal(["填写者"])).toBe("/filler");
    expect(primaryPortal(["审批者"])).toBe("/approver");
    expect(primaryPortal(["管理员"])).toBe("/admin");
    expect(primaryPortal(["运维"])).toBe("/ops");
  });

  it("picks the highest-priority role for a multi-role user", () => {
    expect(primaryPortal(["填写者", "审批者"])).toBe("/filler");
    expect(primaryPortal(["审批者", "运维"])).toBe("/approver");
  });

  it("falls back to /filler when no role is recognized", () => {
    expect(primaryPortal([])).toBe("/filler");
    expect(primaryPortal(["未知角色"])).toBe("/filler");
  });

  it("lists the portals a user's roles unlock, in priority order", () => {
    expect(portalsForRoles(["填写者", "审批者"])).toEqual([
      { role: "填写者", to: "/filler" },
      { role: "审批者", to: "/approver" },
    ]);
  });

  it("hasAnyRole checks membership", () => {
    expect(hasAnyRole(["填写者"], ["填写者"])).toBe(true);
    expect(hasAnyRole(["填写者"], ["管理员"])).toBe(false);
    expect(hasAnyRole(["填写者", "审批者"], ["审批者"])).toBe(true);
  });
});
